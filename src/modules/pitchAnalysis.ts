/**
 * Pitch Analysis module
 *
 * Extracts F0 (fundamental frequency) pitch contour from recorded audio
 * using Pitchfinder (YIN), then compares with a reference contour to
 * identify divergent intonation regions.
 *
 * Pipeline:
 *   AudioBlob → decode → mono PCM → frame-by-frame YIN → F0 contour
 *   (user contour + ref contour) → normalize → compare → divergent regions + feedback
 */

import { YIN } from 'pitchfinder'

// Pitch analysis is done at 16 kHz — pitchfinder's YIN is tuned for that
// sample rate and becomes unreliable at 48 kHz with default thresholds.
const ANALYSIS_SAMPLE_RATE = 16000
const FRAME_SIZE = 1024              // ~64 ms @ 16 kHz
const HOP_SIZE = 256                 // ~16 ms @ 16 kHz
const MIN_F0_HZ = 70
const MAX_F0_HZ = 500
const DIVERGE_THRESHOLD = 1.2  // z-score difference to flag as divergent
const YIN_THRESHOLD = 0.20      // higher = more permissive
const YIN_PROB_THRESHOLD = 0.05 // lower = more permissive
const FALLBACK_YIN_THRESHOLD = 0.32
const FALLBACK_YIN_PROB_THRESHOLD = 0.01
const ULTRA_FALLBACK_YIN_THRESHOLD = 0.42
const ULTRA_FALLBACK_YIN_PROB_THRESHOLD = 0.001
const MIN_VOICED_FRAMES = 6
const BRIDGE_MAX_GAP_FRAMES = 2
const EDGE_TRIM_VOICED_MARGIN_FRAMES = 8
const MIN_TRIMMED_FRAMES = 40
const AUTOCORR_MIN_CORR = 0.35

export interface PitchAnalysisResult {
  contourUser: number[]                  // F0 per frame (Hz); 0 = unvoiced
  contourRef: number[] | null            // null when no reference is available
  divergentRegions: [number, number][]   // [startFrame, endFrame][]
  feedback: string
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyze a recorded utterance and optionally compare with reference audio.
 */
export async function analyzePitch(
  userBlob: Blob,
  refAudioPath: string | string[] | null
): Promise<PitchAnalysisResult> {
  const userAudio = await decodeToMono(userBlob)
  let maxAbs = 0
  for (let i = 0; i < userAudio.samples.length; i++) {
    const abs = Math.abs(userAudio.samples[i])
    if (abs > maxAbs) maxAbs = abs
  }
  const contourUserRaw = extractContour(userAudio.samples, userAudio.sampleRate)
  const userTrim = trimContourEdgesSafe(
    contourUserRaw,
    EDGE_TRIM_VOICED_MARGIN_FRAMES,
    MIN_TRIMMED_FRAMES,
  )
  const contourUser = userTrim.contour
  console.log(
    '[pitch] user audio:',
    (userAudio.samples.length / userAudio.sampleRate).toFixed(2), 's @',
    userAudio.sampleRate, 'Hz, frames:', contourUser.length,
    '(raw:', contourUserRaw.length, ')',
    '| trimApplied =', userTrim.trimApplied,
    '| trimFallbackToRaw =', userTrim.usedRawFallback,
    'maxAbs:', maxAbs.toFixed(4),
  )

  let contourRef: number[] | null = null

  const candidates = Array.isArray(refAudioPath)
    ? refAudioPath
    : refAudioPath
      ? [refAudioPath]
      : []

  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate)
      if (!res.ok) continue
      const refBlob = await res.blob()
      const refAudio = await decodeToMono(refBlob)
      const contourRefRaw = extractContour(refAudio.samples, refAudio.sampleRate)
      const refTrim = trimContourEdgesSafe(
        contourRefRaw,
        EDGE_TRIM_VOICED_MARGIN_FRAMES,
        MIN_TRIMMED_FRAMES,
      )
      contourRef = refTrim.contour
      console.log(
        '[pitch] ref audio:', candidate, '→',
        (refAudio.samples.length / refAudio.sampleRate).toFixed(2), 's @',
        refAudio.sampleRate, 'Hz, frames:', contourRef.length,
        '(raw:', contourRefRaw.length, ')',
        '| trimApplied =', refTrim.trimApplied,
        '| trimFallbackToRaw =', refTrim.usedRawFallback,
      )
      break
    } catch {
      // Try the next candidate path.
    }
  }

  if (!contourRef) {
    return {
      contourUser,
      contourRef: null,
      divergentRegions: [],
      feedback: '기준 음성 파일이 없어 음조 비교를 건너뜁니다.',
    }
  }

  const { divergentRegions, feedback } = compareContours(contourUser, contourRef)
  return { contourUser, contourRef, divergentRegions, feedback }
}

// ─── Audio decoding ───────────────────────────────────────────────────────────

interface MonoAudio {
  samples: Float32Array
  sampleRate: number
}

async function decodeToMono(blob: Blob): Promise<MonoAudio> {
  const arrayBuffer = await blob.arrayBuffer()
  const audioCtx = new AudioContext()
  const decoded = await audioCtx.decodeAudioData(arrayBuffer)
  await audioCtx.close()

  // Mix all channels down to mono
  const mono = new Float32Array(decoded.length)
  for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
    const ch_data = decoded.getChannelData(ch)
    for (let i = 0; i < decoded.length; i++) {
      mono[i] += ch_data[i] / decoded.numberOfChannels
    }
  }

  return { samples: mono, sampleRate: decoded.sampleRate }
}

// ─── Pitch extraction ─────────────────────────────────────────────────────────

function extractContour(samples: Float32Array, sampleRate: number): number[] {
  // Resample to 16 kHz if needed — YIN is tuned for this rate.
  let analysisSamples: Float32Array
  let analysisRate: number
  if (sampleRate !== ANALYSIS_SAMPLE_RATE) {
    analysisSamples = resampleAudio(samples, sampleRate, ANALYSIS_SAMPLE_RATE)
    analysisRate = ANALYSIS_SAMPLE_RATE
  } else {
    analysisSamples = samples
    analysisRate = sampleRate
  }
  analysisSamples = preprocessForPitch(analysisSamples, analysisRate)

  // First pass: collect RMS for every frame so we can choose an adaptive
  // silence threshold that scales with the overall input level.
  const rmsList: number[] = []
  for (let start = 0; start + FRAME_SIZE <= analysisSamples.length; start += HOP_SIZE) {
    const frame = analysisSamples.subarray(start, start + FRAME_SIZE)
    rmsList.push(rmsEnergy(frame))
  }
  const maxRms = rmsList.reduce((m, v) => (v > m ? v : m), 0)
  const p50Rms = percentile(rmsList, 0.5)
  const p90Rms = percentile(rmsList, 0.9)
  // Spike(입력 시작/끝 클릭)에 끌려가지 않도록 max 대신 p90/p50 기반으로 컷오프를 잡는다.
  // 음량이 작은 사용자 입력에서 voiced가 모두 날아가지 않도록 이전보다 완화.
  const adaptiveFloor = Math.max(Math.min(p90Rms * 0.1, p50Rms * 1.2), 2e-5)

  const firstPass = runPitchPass({
    samples: analysisSamples,
    analysisRate,
    silenceFloor: adaptiveFloor,
    yinThreshold: YIN_THRESHOLD,
    yinProbThreshold: YIN_PROB_THRESHOLD,
    allowEnergyGate: true,
    minF0Hz: MIN_F0_HZ,
    maxF0Hz: MAX_F0_HZ,
    useAutocorrFallback: true,
  })

  // 사용자 음성이 작거나 잡음이 많으면 voiced가 너무 적게 나올 수 있다.
  // 비교에 필요한 최소 프레임(MIN_VOICED_FRAMES)보다 부족하면 완화 패스를 시도.
  const fallbackPass = firstPass.voicedCount < MIN_VOICED_FRAMES
    ? runPitchPass({
        samples: analysisSamples,
        analysisRate,
        silenceFloor: 0,
        yinThreshold: FALLBACK_YIN_THRESHOLD,
        yinProbThreshold: FALLBACK_YIN_PROB_THRESHOLD,
        allowEnergyGate: false,
        minF0Hz: MIN_F0_HZ - 10,
        maxF0Hz: MAX_F0_HZ + 30,
        useAutocorrFallback: true,
      })
    : null

  const ultraFallbackPass = firstPass.voicedCount < MIN_VOICED_FRAMES
    ? runPitchPass({
        samples: analysisSamples,
        analysisRate,
        silenceFloor: 0,
        yinThreshold: ULTRA_FALLBACK_YIN_THRESHOLD,
        yinProbThreshold: ULTRA_FALLBACK_YIN_PROB_THRESHOLD,
        allowEnergyGate: false,
        minF0Hz: MIN_F0_HZ - 15,
        maxF0Hz: MAX_F0_HZ + 60,
        useAutocorrFallback: true,
      })
    : null

  const allPasses = [firstPass, fallbackPass, ultraFallbackPass].filter(Boolean) as PitchPassResult[]
  let chosen = allPasses[0]
  for (const pass of allPasses) {
    if (pass.voicedCount > chosen.voicedCount) chosen = pass
  }
  const fallbackUsed = chosen !== firstPass
  const contourBridged = bridgeShortUnvoicedGaps(chosen.contour, BRIDGE_MAX_GAP_FRAMES)
  const bridgedCount =
    contourBridged.filter((v) => v > 0).length - chosen.contour.filter((v) => v > 0).length

  console.log(
    '[pitch] extractContour:',
    'inputRate =', sampleRate, 'analysisRate =', analysisRate,
    'frames =', rmsList.length,
    'maxRMS =', maxRms.toFixed(5), 'p50RMS =', p50Rms.toFixed(5), 'p90RMS =', p90Rms.toFixed(5),
    'silenceFloor =', adaptiveFloor.toFixed(5),
    '| voiced =', chosen.voicedCount,
    'droppedByEnergy =', chosen.droppedByEnergy,
    'droppedByYin =', chosen.droppedByYin,
    '| passVoiced(first/fallback/ultra)=',
    `${firstPass.voicedCount}/${fallbackPass?.voicedCount ?? '-'}${`/${ultraFallbackPass?.voicedCount ?? '-'}`}`,
    '| bridged =', bridgedCount,
    '| fallbackUsed =', fallbackUsed,
  )

  return contourBridged
}

// ─── Contour comparison ───────────────────────────────────────────────────────

function compareContours(
  user: number[],
  ref: number[]
): { divergentRegions: [number, number][]; feedback: string } {
  const userSmoothed = medianSmoothVoiced(user, 1)
  const refSmoothed = medianSmoothVoiced(ref, 1)
  const userVoiced = userSmoothed.filter((v) => v > 0)
  const refVoiced = refSmoothed.filter((v) => v > 0)
  const userMinVoiced = dynamicMinVoicedFrames(user.length)
  const refMinVoiced = dynamicMinVoicedFrames(ref.length)

  console.log(
    '[pitch] frames(total/voiced) user:', user.length, '/', userVoiced.length,
    'ref:', ref.length, '/', refVoiced.length,
    '| minRequired(user/ref):', `${userMinVoiced}/${refMinVoiced}`,
  )

  if (userVoiced.length < userMinVoiced) {
    return {
      divergentRegions: [],
      feedback:
        `사용자 음성에서 음조 추출이 어렵습니다 (voiced ${userVoiced.length}프레임). ` +
        `마이크에 가까이, 더 또렷하게 말씀해 주세요.`,
    }
  }
  if (refVoiced.length < refMinVoiced) {
    return {
      divergentRegions: [],
      feedback:
        `기준 음성에서 음조 추출이 어렵습니다 (voiced ${refVoiced.length}프레임). ` +
        `기준 오디오 파일이 너무 짧거나 무성 구간만 있는지 확인해 주세요.`,
    }
  }

  // Resample both voiced contours to a common length so we are not bottlenecked
  // by the shorter side (e.g. a short reference clip).
  const voicedLen = Math.min(Math.max(userVoiced.length, refVoiced.length), 200)
  const userV = resample(userVoiced, voicedLen)
  const refV = resample(refVoiced, voicedLen)

  // Convert to log scale (semitones) then z-score normalize each
  const uLog = zScore(userV.map((u) => Math.log2(u)))
  const rLog = zScore(refV.map((r) => Math.log2(r)))

  // Identify divergent regions
  const divergentRegions: [number, number][] = []
  let regionStart = -1

  for (let k = 0; k < voicedLen; k++) {
    const diff = Math.abs(uLog[k] - rLog[k])
    if (diff > DIVERGE_THRESHOLD && regionStart < 0) {
      regionStart = k
    } else if (diff <= DIVERGE_THRESHOLD && regionStart >= 0) {
      divergentRegions.push([regionStart, k - 1])
      regionStart = -1
    }
  }
  if (regionStart >= 0) {
    divergentRegions.push([regionStart, voicedLen - 1])
  }

  // Generate feedback
  const divergedFrames = divergentRegions.reduce((s, [a, b]) => s + (b - a), 0)
  const divergeRatio = divergedFrames / voicedLen
  const isEndDivergent = divergentRegions.some(([, e]) => e > voicedLen * 0.65)
  const isStartDivergent = divergentRegions.some(([s]) => s < voicedLen * 0.3)

  let feedback: string
  if (divergeRatio < 0.1) {
    feedback = '음조가 매우 자연스럽습니다!'
  } else if (divergeRatio < 0.25) {
    feedback = '전반적으로 좋습니다. 조금만 더 연습해 보세요.'
  } else if (isEndDivergent) {
    feedback = '문장 끝 억양을 기준 음성처럼 조금 낮춰보세요.'
  } else if (isStartDivergent) {
    feedback = '문장 시작 부분의 억양을 더 자연스럽게 해 보세요.'
  } else {
    feedback = '중간 구간의 강세와 억양을 기준 음성과 비교해 보세요.'
  }

  return { divergentRegions, feedback }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resample(arr: number[], targetLen: number): number[] {
  if (arr.length === targetLen) return [...arr]
  const out: number[] = new Array(targetLen)
  for (let i = 0; i < targetLen; i++) {
    const pos = (i / (targetLen - 1)) * (arr.length - 1)
    const lo = Math.floor(pos)
    const hi = Math.min(lo + 1, arr.length - 1)
    out[i] = arr[lo] * (1 - (pos - lo)) + arr[hi] * (pos - lo)
  }
  return out
}

function zScore(arr: number[]): number[] {
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length
  const std = Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length)
  if (std < 1e-6) return arr.map(() => 0)
  return arr.map((v) => (v - mean) / std)
}

function rmsEnergy(frame: Float32Array): number {
  let sum = 0
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i]
  return Math.sqrt(sum / frame.length)
}

function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))
  return sorted[idx]
}

interface PitchPassOptions {
  samples: Float32Array
  analysisRate: number
  silenceFloor: number
  yinThreshold: number
  yinProbThreshold: number
  allowEnergyGate: boolean
  minF0Hz: number
  maxF0Hz: number
  useAutocorrFallback: boolean
}

interface PitchPassResult {
  contour: number[]
  voicedCount: number
  droppedByEnergy: number
  droppedByYin: number
}

function runPitchPass({
  samples,
  analysisRate,
  silenceFloor,
  yinThreshold,
  yinProbThreshold,
  allowEnergyGate,
  minF0Hz,
  maxF0Hz,
  useAutocorrFallback,
}: PitchPassOptions): PitchPassResult {
  const detectPitch = YIN({
    sampleRate: analysisRate,
    threshold: yinThreshold,
    probabilityThreshold: yinProbThreshold,
  })

  const contour: number[] = []
  let droppedByEnergy = 0
  let droppedByYin = 0
  let voicedCount = 0

  for (let start = 0; start + FRAME_SIZE <= samples.length; start += HOP_SIZE) {
    const frame = samples.subarray(start, start + FRAME_SIZE)
    if (allowEnergyGate && rmsEnergy(frame) < silenceFloor) {
      contour.push(0)
      droppedByEnergy++
      continue
    }

    // NOTE: do NOT apply a Hann window before YIN. YIN operates on the
    // squared difference between samples; windowing pushes the frame edges
    // toward 0, which makes the difference function artificially small at
    // every lag and breaks the threshold step.
    const pitchYin = detectPitch(frame)
    let pitch = pitchYin
    if ((!pitch || pitch < minF0Hz || pitch > maxF0Hz) && useAutocorrFallback) {
      const pitchAc = detectPitchAutoCorrelation(frame, analysisRate, minF0Hz, maxF0Hz)
      if (pitchAc > 0) pitch = pitchAc
    }

    if (!pitch || pitch < minF0Hz || pitch > maxF0Hz) {
      contour.push(0)
      droppedByYin++
    } else {
      contour.push(pitch)
      voicedCount++
    }
  }

  return { contour, voicedCount, droppedByEnergy, droppedByYin }
}

function preprocessForPitch(samples: Float32Array, sampleRate: number): Float32Array {
  if (samples.length === 0) return samples

  // Remove DC bias and gently amplify quiet captures.
  let mean = 0
  for (let i = 0; i < samples.length; i++) mean += samples[i]
  mean /= samples.length

  let peak = 0
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] - mean
    const abs = Math.abs(v)
    if (abs > peak) peak = abs
  }
  if (peak < 1e-8) return samples

  const targetPeak = 0.25
  const gain = Math.min(Math.max(targetPeak / peak, 1), 8)
  if (Math.abs(mean) < 1e-6 && Math.abs(gain - 1) < 1e-6) return samples

  const centered = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) centered[i] = (samples[i] - mean) * gain

  // Voice-focused band shaping (approx. 60~900 Hz) to stabilize F0 detection.
  const hp = highPassFilter(centered, sampleRate, 60)
  const lp = lowPassFilter(hp, sampleRate, 900)
  return lp
}

function bridgeShortUnvoicedGaps(contour: number[], maxGap: number): number[] {
  if (contour.length === 0 || maxGap <= 0) return contour
  const out = [...contour]
  let i = 0

  while (i < out.length) {
    if (out[i] > 0) {
      i++
      continue
    }
    const gapStart = i
    while (i < out.length && out[i] <= 0) i++
    const gapEnd = i - 1
    const gapLen = gapEnd - gapStart + 1
    const left = gapStart - 1
    const right = gapEnd + 1
    if (gapLen > maxGap) continue
    if (left < 0 || right >= out.length) continue
    if (out[left] <= 0 || out[right] <= 0) continue

    for (let k = 1; k <= gapLen; k++) {
      const t = k / (gapLen + 1)
      out[gapStart + k - 1] = out[left] * (1 - t) + out[right] * t
    }
  }

  return out
}

function medianSmoothVoiced(contour: number[], radius: number): number[] {
  if (contour.length === 0 || radius <= 0) return [...contour]
  const out = [...contour]
  for (let i = 0; i < contour.length; i++) {
    if (contour[i] <= 0) continue
    const win: number[] = []
    for (let k = i - radius; k <= i + radius; k++) {
      if (k < 0 || k >= contour.length) continue
      if (contour[k] > 0) win.push(contour[k])
    }
    if (win.length < 2) continue
    win.sort((a, b) => a - b)
    out[i] = win[Math.floor(win.length / 2)]
  }
  return out
}

function dynamicMinVoicedFrames(totalFrames: number): number {
  // 짧은 발화는 voiced 프레임이 적게 나오므로 최소 기준을 낮춰 안정성 확보.
  if (totalFrames <= 120) return 4
  if (totalFrames <= 180) return 5
  return MIN_VOICED_FRAMES
}

interface TrimResult {
  contour: number[]
  trimApplied: boolean
  usedRawFallback: boolean
}

function trimContourEdgesSafe(
  contour: number[],
  voicedMarginFrames: number,
  minTrimmedFrames: number,
): TrimResult {
  if (contour.length === 0) {
    return {
      contour,
      trimApplied: false,
      usedRawFallback: false,
    }
  }
  let firstVoiced = -1
  let lastVoiced = -1

  for (let i = 0; i < contour.length; i++) {
    if (contour[i] > 0) {
      firstVoiced = i
      break
    }
  }
  for (let i = contour.length - 1; i >= 0; i--) {
    if (contour[i] > 0) {
      lastVoiced = i
      break
    }
  }

  if (firstVoiced < 0 || lastVoiced < 0 || lastVoiced < firstVoiced) {
    return {
      contour,
      trimApplied: false,
      usedRawFallback: false,
    }
  }

  const start = Math.max(0, firstVoiced - voicedMarginFrames)
  const end = Math.min(contour.length - 1, lastVoiced + voicedMarginFrames)
  const trimmed = contour.slice(start, end + 1)
  const trimApplied = start > 0 || end < contour.length - 1

  // 단문 발화에서 과도한 트림으로 프레임이 너무 작아지면 원본 유지.
  if (trimmed.length < minTrimmedFrames && contour.length >= minTrimmedFrames) {
    return {
      contour,
      trimApplied,
      usedRawFallback: true,
    }
  }

  return {
    contour: trimmed,
    trimApplied,
    usedRawFallback: false,
  }
}

function detectPitchAutoCorrelation(
  frame: Float32Array,
  sampleRate: number,
  minF0Hz: number,
  maxF0Hz: number,
): number {
  const n = frame.length
  if (n < 4) return 0

  let mean = 0
  for (let i = 0; i < n; i++) mean += frame[i]
  mean /= n

  const x = new Float32Array(n)
  let energy = 0
  for (let i = 0; i < n; i++) {
    x[i] = frame[i] - mean
    energy += x[i] * x[i]
  }
  if (energy < 1e-8) return 0

  const lagMin = Math.max(1, Math.floor(sampleRate / maxF0Hz))
  const lagMax = Math.min(n - 2, Math.floor(sampleRate / minF0Hz))
  if (lagMax <= lagMin) return 0

  let bestLag = -1
  let bestCorr = -1

  for (let lag = lagMin; lag <= lagMax; lag++) {
    let num = 0
    let denA = 0
    let denB = 0
    for (let i = 0; i < n - lag; i++) {
      const a = x[i]
      const b = x[i + lag]
      num += a * b
      denA += a * a
      denB += b * b
    }
    const den = Math.sqrt(denA * denB)
    if (den < 1e-12) continue
    const corr = num / den
    if (corr > bestCorr) {
      bestCorr = corr
      bestLag = lag
    }
  }

  if (bestLag < 0 || bestCorr < AUTOCORR_MIN_CORR) return 0
  return sampleRate / bestLag
}

function lowPassFilter(samples: Float32Array, sampleRate: number, cutoffHz: number): Float32Array {
  const out = new Float32Array(samples.length)
  if (samples.length === 0) return out
  const alpha = Math.exp((-2 * Math.PI * cutoffHz) / sampleRate)
  out[0] = samples[0]
  for (let i = 1; i < samples.length; i++) {
    out[i] = (1 - alpha) * samples[i] + alpha * out[i - 1]
  }
  return out
}

function highPassFilter(samples: Float32Array, sampleRate: number, cutoffHz: number): Float32Array {
  const out = new Float32Array(samples.length)
  if (samples.length === 0) return out
  const alpha = Math.exp((-2 * Math.PI * cutoffHz) / sampleRate)
  out[0] = 0
  for (let i = 1; i < samples.length; i++) {
    out[i] = alpha * (out[i - 1] + samples[i] - samples[i - 1])
  }
  return out
}

// Linear-interpolation resampler for a Float32Array of audio samples.
function resampleAudio(
  samples: Float32Array,
  fromRate: number,
  toRate: number,
): Float32Array {
  if (fromRate === toRate) return samples
  const ratio = fromRate / toRate
  const newLength = Math.floor(samples.length / ratio)
  const out = new Float32Array(newLength)
  for (let i = 0; i < newLength; i++) {
    const pos = i * ratio
    const lo = Math.floor(pos)
    const hi = Math.min(lo + 1, samples.length - 1)
    const frac = pos - lo
    out[i] = samples[lo] * (1 - frac) + samples[hi] * frac
  }
  return out
}
