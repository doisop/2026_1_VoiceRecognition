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

// ─── Perf logging helper ──────────────────────────────────────────────────────

function tts_ts(): string { return new Date().toISOString().slice(11, 23) }
function ttsLog(segment: string, status: 'START' | 'END' | 'INFO', msg: string, ms?: number): void {
  const msStr = ms !== undefined ? ` (소요시간: ${ms}ms)` : ''
  console.log(`[${tts_ts()}] [${segment}] ${status} ${msg}${msStr}`)
}

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

  const ttsNetStart = performance.now()
  ttsLog('TTS_NET', 'START', `Google TTS 네트워크 요청: "${text.slice(0, 25)}"`)

  fetchGoogleAudio(text, options)
    .then((arrayBuffer) => {
      const ttsNetMs = Math.round(performance.now() - ttsNetStart)
      ttsLog('TTS_NET', 'END', 'Google TTS 응답 수신 완료', ttsNetMs)
      return getAudioCtx().decodeAudioData(arrayBuffer)
    })
    .then(async (decoded) => {
      const ctx = getAudioCtx()
      await ctx.resume() // suspended 상태 해제 후 재생 — 앞부분 잘림 방지
      const source = ctx.createBufferSource()
      source.buffer = decoded
      source.connect(ctx.destination)

      const ttsPlayStart = performance.now()

      source.onended = () => {
        const ttsPlayMs = Math.round(performance.now() - ttsPlayStart)
        ttsLog('TTS_PLAY', 'END', '오디오 재생 종료', ttsPlayMs)
        currentSource = null
        options.onEnd?.()
      }
      currentSource = source
      options.onStart?.()
      source.start(ctx.currentTime + 0.2) // 200ms 오프셋 — 하드웨어 초기화 대기
      ttsLog('TTS_PLAY', 'START', `오디오 재생 시작: "${text.slice(0, 25)}"`)
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
  console.log('[TTS] 음성 목록 로딩 시작.')
  if (speechSynthesis.getVoices().length === 0) {
    speechSynthesis.onvoiceschanged = () => {
      console.log(`[TTS] 음성 목록 로딩 완료. ${speechSynthesis.getVoices().length}개 음성 준비됨.`)
    }
  } else {
    console.log(`[TTS] 음성 목록 이미 로드됨 (${speechSynthesis.getVoices().length}개). 입력 수신 준비됨.`)
  }
}

/**
 * 텍스트를 Google TTS로 합성해 Blob으로 반환한다 (재생하지 않음).
 * 발음 분석용 레퍼런스 오디오 생성에 사용.
 */
export async function synthesizeToBlob(
  text: string,
  voice: GoogleVoice = 'ko-KR-Neural2-A'
): Promise<Blob> {
  const body = {
    input: { text },
    voice: { languageCode: 'ko-KR', name: voice },
    audioConfig: { audioEncoding: 'MP3', speakingRate: 1.0, pitch: 0 },
  }

  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`Google TTS API 오류: ${res.status}`)

  const data = await res.json() as { audioContent: string }
  const binary = atob(data.audioContent)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes.buffer], { type: 'audio/mp3' })
}

/** 오디오 하드웨어를 미리 초기화. RoleplayScreen 진입 시 호출하면 첫 TTS 앞부분 잘림 방지. */
export async function warmUpAudio(): Promise<void> {
  const startedAt = performance.now()
  console.log('[TTS] 오디오 하드웨어 초기화 시작.')
  try {
    const ctx = getAudioCtx()
    await ctx.resume()
    const buf = ctx.createBuffer(1, 5, ctx.sampleRate)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.start()
    const latencyMs = Math.round(performance.now() - startedAt)
    console.log(`[TTS] 오디오 하드웨어 초기화 완료 (${latencyMs}ms). 입력 수신 준비됨.`)
  } catch (err) {
    console.error('[TTS] 오디오 하드웨어 초기화 실패:', err)
    throw err
  }
}

