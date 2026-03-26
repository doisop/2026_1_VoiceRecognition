/**
 * STT module — Whisper ONNX via @xenova/transformers
 *
 * @xenova/transformers bundles ONNX Runtime Web as an internal webpack bundle.
 * Vite's module transformation breaks this bundle's initialization sequence,
 * so we bypass Vite entirely by loading the library from CDN at runtime.
 * The ~250 MB Whisper model weights are still cached in the browser's IndexedDB.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pipeline = (input: Float32Array, opts: Record<string, unknown>) => Promise<any>
type EnvObject = { useBrowserCache: boolean; allowLocalModels: boolean }
type ProgressEvent = { status: string; file?: string; progress?: number }

let _pipeline: ((type: string, model: string, opts: Record<string, unknown>) => Promise<Pipeline>) | null = null
let _env: EnvObject | null = null

/** Load the transformers.js library from CDN (bypasses Vite bundling). */
async function getTransformers(): Promise<{ pipeline: typeof _pipeline; env: typeof _env }> {
  if (_pipeline) return { pipeline: _pipeline, env: _env }

  // @ts-expect-error — CDN URL import, not resolvable by TypeScript
  const mod = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2/dist/transformers.min.js') as Record<string, unknown>

  _pipeline = mod.pipeline as typeof _pipeline
  _env = mod.env as typeof _env
  if (_env) {
    _env.useBrowserCache = true
    _env.allowLocalModels = false
  }

  return { pipeline: _pipeline, env: _env }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type ProgressCallback = (pct: number) => void

let asrInstance: Pipeline | null = null
let loadPromise: Promise<void> | null = null

/** Pre-loads Whisper model. Safe to call multiple times — only loads once. */
export async function loadWhisper(onProgress?: ProgressCallback): Promise<void> {
  if (asrInstance) return
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    const { pipeline } = await getTransformers()
    if (!pipeline) throw new Error('Failed to load transformers.js from CDN')

    const fileProgress: Record<string, number> = {}

    const progressCallback = onProgress
      ? (p: ProgressEvent) => {
          if (p.status === 'progress' && p.file && p.progress !== undefined) {
            fileProgress[p.file] = p.progress
            const values = Object.values(fileProgress)
            onProgress(values.reduce((s, v) => s + v, 0) / values.length)
          }
        }
      : undefined

    asrInstance = await pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-small',
      { quantized: true, progress_callback: progressCallback }
    )
  })()

  return loadPromise
}

export function isWhisperLoaded(): boolean {
  return asrInstance !== null
}

/** Transcribes a recorded audio Blob using Whisper. */
export async function transcribeBlob(blob: Blob): Promise<string> {
  if (!asrInstance) throw new Error('Whisper model not loaded. Call loadWhisper() first.')

  const samples = await blobTo16kFloat32(blob)
  const result = await asrInstance(samples, { language: 'korean', task: 'transcribe' })
  const output = Array.isArray(result) ? result[0] : result
  return (output?.text ?? '').trim()
}

// ─── Audio helpers ────────────────────────────────────────────────────────────

async function blobTo16kFloat32(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer()
  const audioCtx = new AudioContext()
  const decoded = await audioCtx.decodeAudioData(arrayBuffer)
  await audioCtx.close()

  if (decoded.sampleRate === 16000 && decoded.numberOfChannels === 1) {
    return decoded.getChannelData(0)
  }

  const numSamples = Math.ceil(decoded.duration * 16000)
  const offlineCtx = new OfflineAudioContext(1, numSamples, 16000)
  const src = offlineCtx.createBufferSource()
  src.buffer = decoded
  src.connect(offlineCtx.destination)
  src.start()
  const resampled = await offlineCtx.startRendering()
  return resampled.getChannelData(0)
}
