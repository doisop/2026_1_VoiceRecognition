/**
 * TTS module — Naver Clova Voice
 *
 * 한국어 자연스러운 발화를 위해 Naver Clova Voice API 사용.
 * API 키는 .env.local의 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET.
 * 브라우저에서 /api/tts (Vite proxy) 를 통해 호출 → CORS 우회.
 *
 * API 키 미설정 시 Web Speech API로 자동 폴백.
 */

export interface TTSOptions {
  speaker?: ClovaVoice   // 기본값: 'nara'
  speed?: number         // -5 ~ 5, 기본값 0
  pitch?: number         // -5 ~ 5, 기본값 0
  onStart?: () => void
  onEnd?: () => void
}

// Naver Clova 주요 한국어 음성
export type ClovaVoice =
  | 'nara'       // 여성, 표준 (기본)
  | 'njiyun'     // 여성, 차분
  | 'ndain'      // 여성, 감성적
  | 'nsunhee'    // 여성, 밝음
  | 'nminsang'   // 남성, 표준
  | 'ndonghyun'  // 남성, 젊음
  | 'njooahn'    // 남성, 차분
  | 'npilot'     // 남성, 안내방송

// ─── Audio playback state ─────────────────────────────────────────────────────

let audioCtx: AudioContext | null = null
let currentSource: AudioBufferSourceNode | null = null

function getAudioCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

// ─── Naver Clova Voice API ────────────────────────────────────────────────────

async function fetchClovaAudio(text: string, opts: TTSOptions): Promise<ArrayBuffer> {
  const body = new URLSearchParams({
    speaker: opts.speaker ?? 'nara',
    text,
    volume: '0',
    speed: String(opts.speed ?? 0),
    pitch: String(opts.pitch ?? 0),
    format: 'mp3',
  })

  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) throw new Error(`Clova TTS API 오류: ${res.status}`)
  return res.arrayBuffer()
}

// ─── Web Speech API fallback ──────────────────────────────────────────────────

function speakFallback(text: string, opts: TTSOptions): void {
  console.warn('[TTS] Clova 폴백 → Web Speech API 사용')
  speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'ko-KR'
  utterance.rate = 0.95

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

/** 텍스트를 한국어로 발화 (Naver Clova Voice). 실패 시 Web Speech API 폴백. */
export function speak(text: string, options: TTSOptions = {}): void {
  stopSpeaking()

  fetchClovaAudio(text, options)
    .then((arrayBuffer) => {
      const ctx = getAudioCtx()
      return ctx.decodeAudioData(arrayBuffer)
    })
    .then((decoded) => {
      const ctx = getAudioCtx()
      const source = ctx.createBufferSource()
      source.buffer = decoded
      source.connect(ctx.destination)
      source.onended = () => {
        currentSource = null
        options.onEnd?.()
      }
      currentSource = source
      options.onStart?.()
      source.start()
      console.log('[TTS] Clova Voice 재생 시작:', text.slice(0, 20))
    })
    .catch((err) => {
      console.error('[TTS] Clova Voice 실패:', err)
      speakFallback(text, options)
    })
}

/** 현재 재생 중인 발화를 즉시 중단. */
export function stopSpeaking(): void {
  if (currentSource) {
    try { currentSource.stop() } catch { /* already stopped */ }
    currentSource = null
  }
  speechSynthesis.cancel() // 폴백 중인 경우도 중단
}

export function isSpeaking(): boolean {
  return currentSource !== null || speechSynthesis.speaking
}

/** Clova Voice는 사전 초기화 불필요. Web Speech API 폴백을 위해 음성 목록만 로드. */
export function initVoices(): void {
  if (speechSynthesis.getVoices().length === 0) {
    speechSynthesis.onvoiceschanged = () => {} // 목록 강제 로드
  }
}
