/**
 * STT module — Whisper ONNX via @xenova/transformers
 *
 * @xenova/transformers bundles ONNX Runtime Web as an internal webpack bundle.
 * Vite's module transformation breaks this bundle's initialization sequence,
 * so we bypass Vite entirely by loading the library from CDN at runtime.
 * The ~250 MB Whisper model weights are still cached in the browser's IndexedDB.
 *
 * Device selection:
 *   - Windows / Apple Silicon → WebGPU (DirectX 12 / Metal 내부 사용)
 *   - WebGPU 미지원 환경      → WASM CPU 폴백
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

// ─── Platform & Device detection ─────────────────────────────────────────────

type Device = 'webgpu' | 'wasm'

/** 현재 플랫폼을 사람이 읽기 좋은 문자열로 반환 */
function getPlatformLabel(): string {
  const ua = navigator.userAgent
  const platform = (navigator.platform ?? '').toLowerCase()

  if (platform.includes('mac') || ua.includes('Mac OS X')) {
    // 브라우저는 Apple Silicon/Intel 구분을 노출하지 않으므로 macOS로 표기
    return 'macOS (WebGPU → Metal)'
  }
  if (platform.includes('win') || ua.includes('Windows')) {
    return 'Windows (WebGPU → DirectX 12)'
  }
  if (platform.includes('linux') || ua.includes('Linux')) {
    return 'Linux (WebGPU → Vulkan)'
  }
  return '알 수 없는 플랫폼'
}

/**
 * WebGPU 어댑터 요청으로 실제 지원 여부를 확인한다.
 * navigator.gpu 존재 여부만으로는 불충분하므로 requestAdapter까지 시도.
 */
async function detectDevice(): Promise<Device> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) return 'wasm'
  try {
    const adapter = await (navigator as Navigator & { gpu: { requestAdapter: () => Promise<unknown> } }).gpu.requestAdapter()
    return adapter ? 'webgpu' : 'wasm'
  } catch {
    return 'wasm'
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type ProgressCallback = (pct: number) => void

let asrInstance: Pipeline | null = null
let loadPromise: Promise<void> | null = null
let activeDevice: Device = 'wasm'

/** Pre-loads Whisper model. Safe to call multiple times — only loads once. */
export async function loadWhisper(onProgress?: ProgressCallback): Promise<void> {
  if (asrInstance) {
    console.log(`[STT] 이미 초기화됨 — 현재 백엔드: ${activeDevice === 'webgpu' ? 'WebGPU (GPU)' : 'WASM (CPU)'}`)
    return
  }
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    const { pipeline } = await getTransformers()
    if (!pipeline) throw new Error('Failed to load transformers.js from CDN')

    const preferredDevice = await detectDevice()
    activeDevice = preferredDevice
    const platformLabel = getPlatformLabel()
    const startDeviceLabel = activeDevice === 'webgpu' ? 'WebGPU (GPU)' : 'WASM (CPU)'

    console.log(`[STT] Whisper 모델 로딩 시작 — 플랫폼: ${platformLabel} / 디바이스: ${startDeviceLabel}`)

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

    try {
      asrInstance = await pipeline(
        'automatic-speech-recognition',
        'Xenova/whisper-small',
        { quantized: true, device: activeDevice, progress_callback: progressCallback }
      )
    } catch (error) {
      if (preferredDevice === 'webgpu') {
        console.warn('[STT] WebGPU 초기화 실패, WASM(CPU)로 폴백합니다.', error)
        activeDevice = 'wasm'
        asrInstance = await pipeline(
          'automatic-speech-recognition',
          'Xenova/whisper-small',
          { quantized: true, device: activeDevice, progress_callback: progressCallback }
        )
      } else {
        throw error
      }
    }

    const finalDeviceLabel = activeDevice === 'webgpu' ? 'WebGPU (GPU)' : 'WASM (CPU)'
    console.log(`[STT] Whisper 모델 로딩 완료 — ${finalDeviceLabel}`)
    if (activeDevice === 'webgpu') {
      console.log('[STT] Using WebGPU backend.')
    } else {
      console.log('[STT] Using fallback backend.')
    }
  })()

  return loadPromise
}

export function isWhisperLoaded(): boolean {
  return asrInstance !== null
}

/** Transcribes a recorded audio Blob using Whisper. */
export async function transcribeBlob(blob: Blob): Promise<string> {
  if (!asrInstance) throw new Error('Whisper model not loaded. Call loadWhisper() first.')

  const deviceLabel = activeDevice === 'webgpu' ? 'WebGPU (GPU)' : 'WASM (CPU)'
  console.log(`[STT] 전사 시작 — 사용 디바이스: ${deviceLabel}`)

  const samples = await blobTo16kFloat32(blob)
  const t0 = performance.now()
  const result = await asrInstance(samples, { language: 'korean', task: 'transcribe' })
  const inferenceMs = (performance.now() - t0).toFixed(0)

  const output = Array.isArray(result) ? result[0] : result
  const text = (output?.text ?? '').trim()
  console.log(`[STT] 전사 완료 (${inferenceMs}ms / ${deviceLabel}):`, text)
  return text
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
