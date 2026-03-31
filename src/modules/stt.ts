/**
 * STT module — Web Speech API SpeechRecognition
 *
 * Chrome 내장 음성인식 (Google 음성 서버 사용).
 * 인터넷 연결 필요 / Chrome 전용.
 * 언어: ko-KR (한국어)
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSpeechRecognitionCtor(): any {
  if (typeof window === 'undefined') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function isSpeechRecognitionSupported(): boolean {
  return !!getSpeechRecognitionCtor()
}

// ── Backward-compat stubs (이전 Whisper API와 인터페이스 유지) ────────────────
export function isWhisperLoaded(): boolean { return true }
export async function loadWhisper(_onProgress?: (pct: number) => void): Promise<void> {}

// ── SpeechRecognizer ──────────────────────────────────────────────────────────

export class SpeechRecognizer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private recognition: any = null
  private resolveStop: ((text: string) => void) | null = null
  private rejectStop: ((err: Error) => void) | null = null
  private finalTranscript = ''

  /** 녹음 시작. AudioRecorder.start()와 동시에 호출하세요. */
  start(lang = 'ko-KR'): void {
    const SR = getSpeechRecognitionCtor()
    if (!SR) throw new Error('SpeechRecognition을 지원하지 않는 브라우저입니다. Chrome을 사용하세요.')

    this.finalTranscript = ''
    this.recognition = new SR()
    this.recognition.lang = lang
    this.recognition.continuous = true
    this.recognition.interimResults = false
    this.recognition.maxAlternatives = 1

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.recognition.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          this.finalTranscript += e.results[i][0].transcript
        }
      }
    }

    this.recognition.onend = () => {
      const text = this.finalTranscript.trim()
      console.log('[STT] Web Speech API 전사 완료:', text)
      this.resolveStop?.(text)
      this.resolveStop = null
      this.rejectStop = null
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.recognition.onerror = (e: any) => {
      // 'no-speech'는 사용자가 말하지 않은 경우 — 빈 문자열로 처리
      if (e.error === 'no-speech') {
        console.warn('[STT] 음성 미감지 (no-speech)')
        this.resolveStop?.('')
      } else {
        console.error('[STT] SpeechRecognition 오류:', e.error)
        this.rejectStop?.(new Error(e.error))
      }
      this.resolveStop = null
      this.rejectStop = null
    }

    this.recognition.start()
    console.log(`[STT] Web Speech API 시작 (${lang})`)
  }

  /** 녹음 종료 후 최종 transcript를 반환. */
  stop(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.resolveStop = resolve
      this.rejectStop = reject
      if (this.recognition) {
        this.recognition.stop()
      } else {
        resolve('')
      }
    })
  }

  /** 결과 없이 강제 중단. */
  abort(): void {
    this.recognition?.abort()
    this.recognition = null
    this.resolveStop = null
    this.rejectStop = null
  }
}
