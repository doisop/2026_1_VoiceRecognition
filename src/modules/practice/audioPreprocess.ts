import type { MonoAudio } from './types'

const TARGET_SAMPLE_RATE = 16000
const SILENCE_THRESHOLD = 0.01
const SILENCE_FRAME = 256

/** WebM/WAV Blob → 16kHz 모노 PCM Float32Array 변환 + 무음 트리밍 */
export async function decodeToMono(blob: Blob): Promise<MonoAudio> {
  const arrayBuffer = await blob.arrayBuffer()
  const audioCtx = new AudioContext()
  const decoded = await audioCtx.decodeAudioData(arrayBuffer)
  await audioCtx.close()

  // 멀티채널 → 모노
  const mono = new Float32Array(decoded.length)
  for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
    const data = decoded.getChannelData(ch)
    for (let i = 0; i < decoded.length; i++) {
      mono[i] += data[i] / decoded.numberOfChannels
    }
  }

  // 16kHz 다운샘플 (이미 16kHz면 스킵)
  const samples = decoded.sampleRate === TARGET_SAMPLE_RATE
    ? mono
    : downsample(mono, decoded.sampleRate, TARGET_SAMPLE_RATE)

  const trimmed = trimSilence(samples)

  return {
    samples: trimmed,
    sampleRate: TARGET_SAMPLE_RATE,
    durationSec: trimmed.length / TARGET_SAMPLE_RATE,
  }
}

function downsample(src: Float32Array, fromRate: number, toRate: number): Float32Array {
  const ratio = fromRate / toRate
  const outLen = Math.floor(src.length / ratio)
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio
    const lo = Math.floor(pos)
    const hi = Math.min(lo + 1, src.length - 1)
    out[i] = src[lo] * (1 - (pos - lo)) + src[hi] * (pos - lo)
  }
  return out
}

function calcRms(src: Float32Array, offset: number, len: number): number {
  let sum = 0
  const end = Math.min(offset + len, src.length)
  for (let i = offset; i < end; i++) sum += src[i] * src[i]
  return Math.sqrt(sum / (end - offset))
}

function trimSilence(samples: Float32Array): Float32Array {
  let start = 0
  let end = samples.length

  for (let i = 0; i + SILENCE_FRAME <= samples.length; i += SILENCE_FRAME) {
    if (calcRms(samples, i, SILENCE_FRAME) > SILENCE_THRESHOLD) { start = i; break }
  }
  for (let i = samples.length - SILENCE_FRAME; i >= 0; i -= SILENCE_FRAME) {
    if (calcRms(samples, i, SILENCE_FRAME) > SILENCE_THRESHOLD) { end = i + SILENCE_FRAME; break }
  }

  return start < end ? samples.slice(start, end) : samples
}
