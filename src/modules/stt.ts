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
    if (onProgress) onProgress(100)
    isReady = true
    console.log(`[STT] Modal STT 서버 사용: ${MODAL_STT_ENDPOINT}`)
  })()

  return loadPromise
}

export function isWhisperLoaded(): boolean {
  return isReady
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
