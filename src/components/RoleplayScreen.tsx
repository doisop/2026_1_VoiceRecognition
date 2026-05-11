import { useState, useRef, useEffect } from 'react'
import type { Scenario, FeedbackResult, ScenarioStep, StepFeedbackResult } from '../types'
import { evaluateExpression } from '../modules/expressionEval'
import { AudioRecorder } from '../modules/audio'
import { loadWhisper, transcribeBlob, isWhisperLoaded } from '../modules/stt'
import { analyzePitch } from '../modules/pitchAnalysis'

interface Props {
  scenario: Scenario
  onFeedback: (result: FeedbackResult) => void
  onBack: () => void
}

type StepState = 'loading' | 'idle' | 'recording' | 'processing'

export default function RoleplayScreen({ scenario, onFeedback, onBack }: Props) {
  const [stepIndex, setStepIndex] = useState(0)
  const [stepState, setStepState] = useState<StepState>(
    isWhisperLoaded() ? 'idle' : 'loading'
  )
  const [loadPct, setLoadPct] = useState(0)
  const [transcript, setTranscript] = useState('')
  const recorderRef = useRef<AudioRecorder | null>(null)
  const stepResultsRef = useRef<StepFeedbackResult[]>([])

  const step: ScenarioStep = scenario.steps[stepIndex]
  const progress = (stepIndex / scenario.steps.length) * 100

  // Load Whisper model as soon as screen opens
  useEffect(() => {
    if (isWhisperLoaded()) return
    loadWhisper((pct) => setLoadPct(Math.round(pct)))
      .then(() => setStepState('idle'))
      .catch((err) => {
        console.error('Whisper load failed:', err)
        setStepState('idle') // fall back gracefully
      })
  }, [])

  async function startRecording() {
    setTranscript('')
    setStepState('recording')
    recorderRef.current = new AudioRecorder()
    await recorderRef.current.start()
  }

  async function stopRecording() {
    if (!recorderRef.current) return
    setStepState('processing')

    const blob = await recorderRef.current.stop()

    const text = await transcribeBlob(blob).catch(() => '')
    setTranscript(text)

    const finalEval = evaluateExpression(text, step)
    const finalMatchedIndex = finalEval.matchedExpressionIndex
    const targetAudios = step.targetExpressionAudio ?? []
    const candidateRefAudios = [
      ...(finalMatchedIndex !== null ? [targetAudios[finalMatchedIndex] ?? null] : []),
      ...targetAudios,
      step.referenceAudio,
    ].filter((path): path is string => Boolean(path))

    const pitchResult = await analyzePitch(blob, candidateRefAudios)

    const stepResult: StepFeedbackResult = {
      stepId: step.id,
      aiText: step.aiText,
      transcript: text,
      expressionScore: finalEval.score,
      expressionFeedback: finalEval.feedback,
      pitchContourUser: pitchResult.contourUser,
      pitchContourRef: pitchResult.contourRef ?? [],
      pitchFeedback: pitchResult.feedback,
      pitchDivergentRegions: pitchResult.divergentRegions,
    }
    stepResultsRef.current = [...stepResultsRef.current, stepResult]

    if (step.isLast) {
      const allStepResults = stepResultsRef.current
      const avgExpressionScore = Math.round(
        allStepResults.reduce((sum, item) => sum + item.expressionScore, 0) / allStepResults.length
      )
      const result: FeedbackResult = {
        transcript: stepResult.transcript,
        expressionScore: avgExpressionScore,
        expressionFeedback: stepResult.expressionFeedback,
        pitchContourUser: stepResult.pitchContourUser,
        pitchContourRef: stepResult.pitchContourRef,
        pitchFeedback: stepResult.pitchFeedback,
        pitchDivergentRegions: stepResult.pitchDivergentRegions,
        stepResults: allStepResults,
      }
      onFeedback(result)
    } else {
      setTimeout(() => {
        setStepIndex((i) => i + 1)
        setStepState('idle')
        setTranscript('')
      }, 1800)
    }
  }

  function handleChipClick(phrase: string) {
    if (stepState !== 'idle') return
    const evalResult = evaluateExpression(phrase, step)
    const stepResult: StepFeedbackResult = {
      stepId: step.id,
      aiText: step.aiText,
      transcript: phrase,
      expressionScore: evalResult.score,
      expressionFeedback: evalResult.feedback,
      pitchContourUser: [],
      pitchContourRef: [],
      pitchFeedback: '힌트 선택 — 음조 분석 없음',
      pitchDivergentRegions: [],
    }
    stepResultsRef.current = [...stepResultsRef.current, stepResult]
    if (step.isLast) {
      const allStepResults = stepResultsRef.current
      const avgExpressionScore = Math.round(
        allStepResults.reduce((sum, item) => sum + item.expressionScore, 0) / allStepResults.length
      )
      const result: FeedbackResult = {
        transcript: stepResult.transcript,
        expressionScore: avgExpressionScore,
        expressionFeedback: stepResult.expressionFeedback,
        pitchContourUser: stepResult.pitchContourUser,
        pitchContourRef: stepResult.pitchContourRef,
        pitchFeedback: stepResult.pitchFeedback,
        pitchDivergentRegions: stepResult.pitchDivergentRegions,
        stepResults: allStepResults,
      }
      onFeedback(result)
    } else {
      setTimeout(() => {
        setStepIndex((i) => i + 1)
        setTranscript('')
      }, 1000)
    }
  }

  return (
    <div
      className="flex flex-col h-screen bg-gray-900 relative"
      style={{
        backgroundImage: `url('${scenario.image}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
      }}
    >
      {/* Scrim */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-black/80 pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 flex items-center gap-3 px-4 py-3 bg-black/40 backdrop-blur-md">
        <button onClick={onBack} className="text-white text-xl px-1">←</button>
        <div className="flex-1">
          <p className="text-white font-bold text-sm">{scenario.title}</p>
          <p className="text-white/60 text-xs">{scenario.character.name} · {scenario.character.role}</p>
        </div>
        <span className="text-white/80 text-xs bg-white/20 px-3 py-1 rounded-full">
          {stepIndex + 1} / {scenario.steps.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative z-10 h-1 bg-white/20">
        <div
          className="h-full bg-white/70 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Chat area */}
      <div className="relative z-10 flex-1 flex flex-col justify-end px-4 pb-4 gap-3">
        {/* AI bubble */}
        <div className="flex items-end gap-2">
          <div className="bg-white/90 backdrop-blur rounded-2xl rounded-bl-sm px-4 py-3 max-w-[80%] shadow">
            <p className="text-xs text-gray-500 mb-1">{scenario.character.name}</p>
            <p className="text-gray-900 text-sm font-medium">{step.aiText}</p>
          </div>
        </div>

        {/* User transcript bubble */}
        {transcript && (
          <div className="flex justify-end">
            <div className="bg-indigo-600 text-white rounded-2xl rounded-br-sm px-4 py-3 max-w-[80%] shadow text-sm">
              {transcript}
            </div>
          </div>
        )}
      </div>

      {/* Bottom panel */}
      <div className="relative z-10 bg-black/70 backdrop-blur-xl border-t border-white/10 px-4 pt-3 pb-8">

        {/* STT client initialization */}
        {stepState === 'loading' && (
          <div className="mb-4">
            <div className="flex justify-between text-xs text-white/60 mb-1">
              <span>STT 서버 연결 준비 중...</span>
              <span>{loadPct}%</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-400 transition-all duration-300"
                style={{ width: `${loadPct}%` }}
              />
            </div>
            <p className="text-xs text-white/40 mt-1">녹음된 음성은 Modal Whisper 서버로 전송되어 처리됩니다</p>
          </div>
        )}

        {/* Hint chips */}
        {stepState !== 'loading' && (
          <div className="flex flex-wrap gap-2 mb-4">
            {step.targetExpressions.slice(0, 3).map((expr) => (
              <button
                key={expr}
                onClick={() => handleChipClick(expr)}
                disabled={stepState !== 'idle'}
                className="text-xs text-white/80 border border-white/30 rounded-full px-3 py-1.5 hover:bg-white/20 transition-colors disabled:opacity-40"
              >
                {expr}
              </button>
            ))}
          </div>
        )}

        {/* Mic button */}
        <div className="flex flex-col items-center gap-2">
          {stepState === 'idle' && (
            <button
              onClick={startRecording}
              className="w-16 h-16 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white text-2xl shadow-lg transition-colors"
            >
              🎤
            </button>
          )}
          {stepState === 'recording' && (
            <button
              onClick={stopRecording}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 text-white text-2xl shadow-lg animate-pulse"
            >
              ⏹
            </button>
          )}
          {(stepState === 'processing' || stepState === 'loading') && (
            <div className="w-16 h-16 rounded-full bg-gray-600 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}
          <p className="text-white/50 text-xs text-center">
            {stepState === 'idle' && '마이크를 눌러 말하세요'}
            {stepState === 'recording' && '말하는 중… 멈추려면 누르세요'}
            {stepState === 'processing' && 'STT · 음조 분석 중…'}
            {stepState === 'loading' && '잠시만 기다려 주세요'}
          </p>
        </div>
      </div>
    </div>
  )
}
