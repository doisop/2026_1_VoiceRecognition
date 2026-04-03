/**
 * TTS module — Google Cloud Text-to-Speech (Neural2)
 *
 * 한국어 자연스러운 발화를 위해 Google Cloud TTS Neural2 사용.
 * API 키는 .env.local의 GOOGLE_TTS_API_KEY.
 * 브라우저에서 /api/tts (Vite proxy) 를 통해 호출 → CORS 우회 + 키 노출 방지.
 *
 * 무료 티어: Neural2 기준 월 1,000,000자
 * API 키 미설정 시 Web Speech API로 자동 폴백.
 */

export interface TTSOptions {
  voice?: GoogleVoice    // 기본값: 'ko-KR-Neural2-A'
  speed?: number         // 0.25 ~ 4.0, 기본값 1.0
  pitch?: number         // -20.0 ~ 20.0 semitones, 기본값 0
  onStart?: () => void
  onEnd?: () => void
}

export type GoogleVoice =
  | 'ko-KR-Neural2-A'   // 여성 (밝음)
  | 'ko-KR-Neural2-B'   // 여성 (차분)
  | 'ko-KR-Neural2-C'   // 남성 (표준)
  | 'ko-KR-Neural2-D'   // 남성 (깊음)

// ─── Audio playback state ─────────────────────────────────────────────────────

let audioCtx: AudioContext | null = null
let currentSource: AudioBufferSourceNode | null = null
let fetchController: AbortController | null = null

function getAudioCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

// ─── Google Cloud TTS API ─────────────────────────────────────────────────────

async function fetchGoogleAudio(text: string, opts: TTSOptions): Promise<ArrayBuffer> {
  const body = {
    input: { text },
    voice: { languageCode: 'ko-KR', name: opts.voice ?? 'ko-KR-Neural2-A' },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: opts.speed ?? 1.0,
      pitch: opts.pitch ?? 0,
    },
  }

  fetchController = new AbortController()
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: fetchController.signal,
  })

  if (!res.ok) throw new Error(`Google TTS API 오류: ${res.status}`)

  const data = await res.json() as { audioContent: string }
  // audioContent는 base64 인코딩된 MP3
  const binary = atob(data.audioContent)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

// ─── Web Speech API fallback ──────────────────────────────────────────────────

function speakFallback(text: string, opts: TTSOptions): void {
  console.warn('[TTS] Google TTS 폴백 → Web Speech API 사용')
  speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'ko-KR'
  utterance.rate = opts.speed ?? 0.95

  const voices = speechSynthesis.getVoices()
  const voice =
    voices.find((v) => v.lang === 'ko-KR' && v.localService) ??
    voices.find((v) => v.lang === 'ko-KR')
  if (voice) utterance.voice = voice

  utterance.onstart = () => opts.onStart?.()
  utterance.onend = () => opts.onEnd?.()

  speechSynthesis.speak(utterance)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** 텍스트를 한국어로 발화 (Google Cloud TTS Neural2). 실패 시 Web Speech API 폴백. */
export function speak(text: string, options: TTSOptions = {}): void {
  stopSpeaking()

  fetchGoogleAudio(text, options)
    .then((arrayBuffer) => getAudioCtx().decodeAudioData(arrayBuffer))
    .then(async (decoded) => {
      const ctx = getAudioCtx()
      await ctx.resume() // suspended 상태 해제 후 재생 — 앞부분 잘림 방지
      const source = ctx.createBufferSource()
      source.buffer = decoded
      source.connect(ctx.destination)
      source.onended = () => {
        currentSource = null
        options.onEnd?.()
      }
      currentSource = source
      options.onStart?.()
      source.start(ctx.currentTime + 0.2) // 200ms 오프셋 — 하드웨어 초기화 대기
      console.log('[TTS] Google Neural2 재생 시작:', text.slice(0, 20))
    })
    .catch((err: Error) => {
      if (err.name === 'AbortError') return  // stopSpeaking()으로 의도적 취소
      console.error('[TTS] Google TTS 실패:', err)
      speakFallback(text, options)
    })
}

/** 현재 재생 중인 발화 및 진행 중인 fetch 요청을 즉시 중단. */
export function stopSpeaking(): void {
  fetchController?.abort()
  fetchController = null
  if (currentSource) {
    try { currentSource.stop() } catch { /* already stopped */ }
    currentSource = null
  }
  speechSynthesis.cancel()
}

export function isSpeaking(): boolean {
  return currentSource !== null || speechSynthesis.speaking
}

export function initVoices(): void {
  if (speechSynthesis.getVoices().length === 0) {
    speechSynthesis.onvoiceschanged = () => {}
  }
}

/** 오디오 하드웨어를 미리 초기화. RoleplayScreen 진입 시 호출하면 첫 TTS 앞부분 잘림 방지. */
export async function warmUpAudio(): Promise<void> {
  const ctx = getAudioCtx()
  await ctx.resume()
  const buf = ctx.createBuffer(1, 5, ctx.sampleRate)
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(ctx.destination)
  src.start()
}

