/**
 * STT module — remote Whisper API via Modal
 *
 * 기존 브라우저 내 Whisper 추론 대신, 녹음된 오디오 Blob을 Modal 서버로 전송한다.
 * loadWhisper/isWhisperLoaded/transcribeBlob 공개 API는 유지해서 화면 로직 변경을 최소화한다.
 */

export type ProgressCallback = (pct: number) => void

type TranscriptionResponse = {
  text?: string
  transcript?: string
  result?: { text?: string; transcript?: string }
}

const MODAL_STT_ENDPOINT =
  ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_MODAL_STT_URL) ??
  "https://kang-minseokk--whisper-turbo-api-whisper-server.modal.run"

const REQUEST_TIMEOUT_MS = 60_000

let isReady = false
let loadPromise: Promise<void> | null = null

/** STT 서버 연결을 준비한다. 실제 모델 로딩 대신 연결 상태만 초기화한다. */
export async function loadWhisper(onProgress?: ProgressCallback): Promise<void> {
  if (isReady) {
    if (onProgress) onProgress(100)
    return
  }
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    const startedAt = performance.now()
    console.log(`[STT] 모델 로딩 시작. 서버: ${MODAL_STT_ENDPOINT}`)
    try {
      if (onProgress) onProgress(100)
      isReady = true
      const latencyMs = Math.round(performance.now() - startedAt)
      console.log(`[STT] 모델 로딩 완료 (${latencyMs}ms). 입력 수신 준비됨.`)
    } catch (err) {
      console.error('[STT] 모델 로딩 실패:', err)
      throw err
    }
  })()

  return loadPromise
}

export function isWhisperLoaded(): boolean {
  return isReady
}

/** 100ms 무음 WAV Blob 생성 — Modal 서버 콜드 스타트 워밍업용 */
function createSilentWav(): Blob {
  const sampleRate = 16000
  const numSamples = Math.floor(sampleRate * 0.1)  // 100ms
  const dataSize = numSamples * 2  // 16-bit mono
  const buf = new ArrayBuffer(44 + dataSize)
  const v = new DataView(buf)
  const str = (offset: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); str(8, 'WAVE')
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true)
  v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, dataSize, true)
  return new Blob([buf], { type: 'audio/wav' })
}

/** Modal STT 서버 콜드 스타트 방지용 워밍업 — 앱 로드 시 백그라운드에서 호출 */
export async function warmUpSTT(): Promise<void> {
  if (!isReady) return
  const startedAt = performance.now()
  console.log('[STT] 서버 워밍업 시작 (콜드 스타트 방지)...')
  try {
    await transcribeBlob(createSilentWav())
    const ms = Math.round(performance.now() - startedAt)
    console.log(`[STT] 서버 워밍업 완료 (${ms}ms). 이후 요청은 빠르게 처리됩니다.`)
  } catch {
    console.log('[STT] 서버 워밍업 완료 (오류 무시 — 서버가 깨어남).')
  }
}

/** 녹음된 오디오 Blob을 Modal STT API로 전송해 전사 텍스트를 받는다. */
export async function transcribeBlob(blob: Blob): Promise<string> {
  if (!isReady) throw new Error('STT client not initialized. Call loadWhisper() first.')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const startedAt = performance.now()

    const response = await fetch(MODAL_STT_ENDPOINT, {
      method: 'POST',
      body: blob,
      signal: controller.signal,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`STT API request failed (${response.status}): ${body.slice(0, 300)}`)
    }

    const data = (await response.json()) as TranscriptionResponse
    const text = (
      data.text ??
      data.transcript ??
      data.result?.text ??
      data.result?.transcript ??
      ''
    ).trim()

    const latencyMs = Math.round(performance.now() - startedAt)
    console.log(`[STT] Modal 전사 완료 (${latencyMs}ms):`, text)

    return text
  } finally {
    clearTimeout(timeout)
  }
}
