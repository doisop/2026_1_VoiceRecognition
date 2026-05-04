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

const FRAME_SIZE = 2048
const HOP_SIZE = 512
const MIN_F0_HZ = 75    // lowest expected fundamental (bass voice)
const MAX_F0_HZ = 500   // highest expected fundamental (high-pitched voice)
const DIVERGE_THRESHOLD = 1.2  // z-score difference to flag as divergent
const YIN_THRESHOLD = 0.15
const YIN_PROB_THRESHOLD = 0.1

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
  refAudioPath: string | null
): Promise<PitchAnalysisResult> {
  const userAudio = await decodeToMono(userBlob)
  const contourUser = extractContour(userAudio.samples, userAudio.sampleRate)

  let contourRef: number[] | null = null

  if (refAudioPath) {
    try {
      const res = await fetch(refAudioPath)
      if (res.ok) {
        const refBlob = await res.blob()
        const refAudio = await decodeToMono(refBlob)
        contourRef = extractContour(refAudio.samples, refAudio.sampleRate)
      }
    } catch {
      contourRef = null
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
  const detectPitch = YIN({
    sampleRate,
    threshold: YIN_THRESHOLD,
    probabilityThreshold: YIN_PROB_THRESHOLD,
  })
  const contour: number[] = []

  for (let start = 0; start + FRAME_SIZE <= samples.length; start += HOP_SIZE) {
    const frame = samples.slice(start, start + FRAME_SIZE)
    if (rmsEnergy(frame) < 0.005) {
      contour.push(0)
      continue
    }
    const windowed = applyHannWindow(frame)
    const pitch = detectPitch(windowed)
    if (!pitch || pitch < MIN_F0_HZ || pitch > MAX_F0_HZ) {
      contour.push(0)
    } else {
      contour.push(pitch)
    }
  }

  return contour
}

// ─── Contour comparison ───────────────────────────────────────────────────────

function compareContours(
  user: number[],
  ref: number[]
): { divergentRegions: [number, number][]; feedback: string } {
  const len = Math.min(user.length, ref.length, 300)
  const userR = resample(user, len)
  const refR = resample(ref, len)

  // Collect voiced frames (both user and ref must be voiced)
  type VoicedFrame = { i: number; u: number; r: number }
  const voiced: VoicedFrame[] = []
  for (let i = 0; i < len; i++) {
    if (userR[i] > 0 && refR[i] > 0) {
      voiced.push({ i, u: userR[i], r: refR[i] })
    }
  }

  if (voiced.length < 10) {
    return {
      divergentRegions: [],
      feedback: '음성 구간이 너무 짧아 음조 분석이 어렵습니다.',
    }
  }

  // Convert to log scale (semitones) then z-score normalize each
  const uLog = zScore(voiced.map(({ u }) => Math.log2(u)))
  const rLog = zScore(voiced.map(({ r }) => Math.log2(r)))

  // Identify divergent regions
  const divergentRegions: [number, number][] = []
  let regionStart = -1

  for (let k = 0; k < voiced.length; k++) {
    const diff = Math.abs(uLog[k] - rLog[k])
    if (diff > DIVERGE_THRESHOLD && regionStart < 0) {
      regionStart = voiced[k].i
    } else if (diff <= DIVERGE_THRESHOLD && regionStart >= 0) {
      divergentRegions.push([regionStart, voiced[k - 1].i])
      regionStart = -1
    }
  }
  if (regionStart >= 0) {
    divergentRegions.push([regionStart, voiced[voiced.length - 1].i])
  }

  // Generate feedback
  const divergedFrames = divergentRegions.reduce((s, [a, b]) => s + (b - a), 0)
  const divergeRatio = divergedFrames / len
  const isEndDivergent = divergentRegions.some(([, e]) => e > len * 0.65)
  const isStartDivergent = divergentRegions.some(([s]) => s < len * 0.3)

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

function applyHannWindow(frame: Float32Array): Float32Array {
  const n = frame.length
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    out[i] = frame[i] * 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)))
  }
  return out
}

function rmsEnergy(frame: Float32Array): number {
  let sum = 0
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i]
  return Math.sqrt(sum / frame.length)
}
