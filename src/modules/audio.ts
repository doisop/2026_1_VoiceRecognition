/**
 * AudioRecorder
 * Wraps MediaRecorder to capture microphone input as a Blob.
 * Used as the audio input layer — the Blob is later passed to
 * STT (Whisper ONNX) and pitch analysis modules.
 */
export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private chunks: Blob[] = []

  async start(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.chunks = []
    this.mediaRecorder = new MediaRecorder(stream)

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }

    this.mediaRecorder.start()
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        resolve(new Blob())
        return
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: 'audio/webm' })
        // Stop all tracks to release the microphone
        this.mediaRecorder?.stream.getTracks().forEach((t) => t.stop())
        console.log('[Audio] 마이크 입력 종료 —', new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
        resolve(blob)
      }

      this.mediaRecorder.stop()
    })
  }
}
