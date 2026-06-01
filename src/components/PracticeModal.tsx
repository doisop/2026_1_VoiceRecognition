import { useState, useRef, useEffect } from 'react'
import type { PronunciationPracticeResult } from '../types'
import { AudioRecorder } from '../modules/audio'
import { analyzePronunciationPractice } from '../modules/pronunciationAnalysis'
import { Mic, MicOff, Volume2, Square } from 'lucide-react'


interface Props {
  modelText: string
  scenarioId: string
  stepId: number
  onClose: () => void
}

type ModalState = 'prompt' | 'recording' | 'processing' | 'result'

export default function PracticeModal({ modelText, scenarioId, stepId, onClose }: Props) {
  const [modalState, setModalState] = useState<ModalState>('prompt')
  const [result, setResult] = useState<PronunciationPracticeResult | null>(null)
  const [lang, setLang] = useState<'ko' | 'ru'>('ko')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const recorderRef = useRef<AudioRecorder | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => () => { stopAll() }, [])

  function stopAll() {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    window.speechSynthesis.cancel()
    setPlayingId(null)
  }

  function playRef() {
    stopAll()
    const audio = new Audio(`/audio/practice/${scenarioId}_${stepId}_ref.wav`)
    audio.volume = 1.0
    audioRef.current = audio
    setPlayingId('ref')
    audio.onended = () => setPlayingId(null)
    audio.play()
  }

  function playTTS(id: string, text: string) {
    stopAll()
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = lang === 'ko' ? 'ko-KR' : 'ru-RU'
    setPlayingId(id)
    utter.onend = () => setPlayingId(null)
    window.speechSynthesis.speak(utter)
  }

  function PlayBtn({ id, onPlay }: { id: string; onPlay: () => void }) {
    const active = playingId === id
    return (
      <button
        onClick={() => active ? stopAll() : onPlay()}
        className="p-1.5 rounded-full hover:bg-white/10 transition-colors flex-shrink-0"
      >
        {active
          ? <Square className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
          : <Volume2 className="w-3.5 h-3.5 text-white/40" />}
      </button>
    )
  }

  async function handleToggleRecording() {
    if (modalState === 'prompt') {
      setModalState('recording')
      recorderRef.current = new AudioRecorder()
      await recorderRef.current.start()
    } else if (modalState === 'recording') {
      setModalState('processing')
      const blob = await recorderRef.current!.stop()

      const analysisResult = await analyzePronunciationPractice(blob, scenarioId, stepId, modelText)

      setResult(analysisResult)
      setModalState('result')
    }
  }

  function handleRetry() {
    setResult(null)
    setModalState('prompt')
  }

  const scoreColor = (score: number) =>
    score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-rose-400'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-4/5 max-h-[80vh] bg-gray-900 border border-white/15 rounded-2xl flex flex-col overflow-hidden shadow-2xl">

        {/* ── 로딩 오버레이 (processing) ── */}
        {modalState === 'processing' && (
          <div className="absolute inset-0 z-10 bg-gray-900/80 flex flex-col items-center justify-center gap-4 rounded-2xl">
            <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
            <p className="text-white/80 text-sm">분석 중...</p>
          </div>
        )}

        {/* ── 결과 화면 ── */}
        {modalState === 'result' && result ? (
          <>
            {/* 종합 점수 */}
            <div className="px-6 pt-6 pb-4 border-b border-white/10 text-center">
              <p className="text-white/50 text-xs mb-1">종합 점수</p>
              <p className={`text-5xl font-bold ${scoreColor(result.overall_score)}`}>
                {result.overall_score}
                <span className="text-2xl font-normal text-white/40 ml-1">점</span>
              </p>
            </div>

            {/* 피드백 섹션 */}
            <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
              {/* 목표 문장 + WAV 플레이 버튼 */}
              {(() => {
                const badChars = new Set(result.bad_chars ?? [])
                return (
                  <div className="flex items-center gap-2 py-2">
                    <p className="flex-1 text-xl font-bold tracking-wide leading-relaxed text-center">
                      {[...modelText].map((ch, i) =>
                        badChars.has(ch)
                          ? <span key={i} className="text-rose-400">{ch}</span>
                          : <span key={i} className="text-white">{ch}</span>
                      )}
                    </p>
                    <PlayBtn id="ref" onPlay={playRef} />
                  </div>
                )
              })()}

              {/* 언어 토글 */}
              <div className="flex justify-center">
                <div className="flex bg-white/10 rounded-lg p-0.5 gap-0.5">
                  {(['ko', 'ru'] as const).map((l) => (
                    <button
                      key={l}
                      onClick={() => { stopAll(); setLang(l) }}
                      className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                        lang === l ? 'bg-white text-gray-900' : 'text-white/60 hover:text-white'
                      }`}
                    >
                      {l === 'ko' ? '한국어' : 'Русский'}
                    </button>
                  ))}
                </div>
              </div>

              {(() => {
                const ru = result.feedback_ru
                const items =
                  lang === 'ko'
                    ? [
                        { id: 'pron',  label: '발음하는 방법', text: result.pronunciation_feedback },
                        { id: 'pitch', label: '음의 높낮이',   text: result.pitch_feedback },
                        { id: 'speed', label: '말의 속도',     text: result.speed_feedback },
                      ]
                    : [
                        { id: 'pron',  label: 'Произношение', text: ru?.pronunciation ?? result.pronunciation_feedback },
                        { id: 'pitch', label: 'Высота тона',  text: ru?.pitch ?? result.pitch_feedback },
                        { id: 'speed', label: 'Темп речи',    text: ru?.speed ?? result.speed_feedback },
                      ]
                return items.map(({ id, label, text }) => (
                  <div key={id} className="bg-white/5 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-white/50 text-xs">📌 {label}</p>
                      <PlayBtn id={id} onPlay={() => playTTS(id, text)} />
                    </div>
                    <p className="text-white text-sm leading-relaxed">{text}</p>
                  </div>
                ))
              })()}
            </div>

            {/* 하단 버튼 */}
            <div className="px-6 py-4 border-t border-white/10 flex gap-3">
              <button
                onClick={handleRetry}
                className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/70 text-sm hover:bg-white/10 transition-colors"
              >
                다시 시도
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-[#1B34B8] hover:bg-[#1B34B8]/90 text-white text-sm font-semibold transition-colors"
              >
                다음으로
              </button>
            </div>
          </>
        ) : (
          <>
            {/* ── 발음 연습 화면 (prompt / recording / processing) ── */}
            <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-6">
              <p className="text-white/50 text-xs">따라 말해보세요</p>

              {/* 예시 문장 */}
              <div className={`w-full bg-white/8 rounded-2xl px-6 py-5 text-center transition-opacity ${
                modalState === 'processing' ? 'opacity-30' : 'opacity-100'
              }`}>
                <p className="text-white text-2xl font-bold tracking-wide leading-relaxed">
                  {modelText}
                </p>
              </div>
            </div>

            {/* 하단 버튼 */}
            <div className="px-6 py-4 border-t border-white/10 flex gap-3">
              <button
                onClick={onClose}
                disabled={modalState === 'processing'}
                className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/70 text-sm hover:bg-white/10 transition-colors disabled:opacity-30"
              >
                건너뛰기
              </button>

              <button
                onClick={handleToggleRecording}
                disabled={modalState === 'processing'}
                className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-30 ${
                  modalState === 'recording'
                    ? 'bg-red-500 hover:bg-red-400 animate-pulse'
                    : 'bg-[#1B34B8] hover:bg-[#1B34B8]/90'
                }`}
              >
                {modalState === 'recording' ? (
                  <><MicOff className="w-4 h-4" /> 녹음 정지</>
                ) : (
                  <><Mic className="w-4 h-4" /> 녹음 시작</>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
