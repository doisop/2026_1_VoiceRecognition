import { useState, useRef, useEffect } from 'react'
import type { Scenario, FeedbackResult } from '../types'
import { evaluateExpression } from '../modules/expressionEval'
import { AudioRecorder } from '../modules/audio'
import { loadWhisper, transcribeBlob, isWhisperLoaded } from '../modules/stt'
import { analyzePitch } from '../modules/pitchAnalysis'
import { speak, stopSpeaking, initVoices, warmUpAudio } from '../modules/tts'
import AvatarCharacter, { type AvatarState } from './AvatarCharacter'
import { Mic, MicOff, X } from 'lucide-react'

interface Props {
  scenario: Scenario
  onFeedback: (result: FeedbackResult) => void
  onBack: () => void
}

type StepState = 'speaking' | 'idle' | 'recording' | 'processing'

interface DialogLine {
  speaker: string
  text: string
  score?: number
}

export default function RoleplayScreen({ scenario, onFeedback, onBack }: Props) {
  const [stepIndex, setStepIndex] = useState(0)
  const [stepState, setStepState] = useState<StepState>('speaking')
  const [dialogLine, setDialogLine] = useState<DialogLine>({
    speaker: scenario.character.name,
    text: '...',
  })
  const [avatarState, setAvatarState] = useState<AvatarState>('idle')
  const recorderRef = useRef<AudioRecorder | null>(null)

  const scoresRef = useRef<number[]>([])
  const feedbackRef = useRef<string[]>([])
  const lastPitchRef = useRef<Omit<FeedbackResult, 'transcript' | 'expressionScore' | 'expressionFeedback'>>({
    pitchContourUser: [],
    pitchContourRef: [],
    pitchFeedback: '',
    pitchDivergentRegions: [],
  })

  const step = scenario.steps[stepIndex]
  const progress = (stepIndex / scenario.steps.length) * 100

  useEffect(() => {
    initVoices()
    warmUpAudio().then(() => {
      if (!isWhisperLoaded()) {
        loadWhisper().then(() => speakStep(0))
      } else {
        speakStep(0)
      }
    })
    return () => stopSpeaking()
  }, [])

  function speakStep(idx: number) {
    const aiText = scenario.steps[idx].aiText
    setDialogLine({ speaker: scenario.character.name, text: aiText })
    setAvatarState('talking')
    setStepState('speaking')
    speak(aiText, {
      voice: scenario.voice as import('../modules/tts').GoogleVoice,
      onEnd: () => {
        setAvatarState('listening')
        setStepState('idle')
      },
    })
  }

  async function startRecording() {
    if (stepState !== 'idle') return
    stopSpeaking()
    setAvatarState('idle')
    setStepState('recording')
    setDialogLine({ speaker: '나', text: '말하는 중...' })
    recorderRef.current = new AudioRecorder()
    await recorderRef.current.start()
  }

  async function stopRecording() {
    if (!recorderRef.current) return
    setStepState('processing')
    setAvatarState('thinking')
    setDialogLine({ speaker: '나', text: '분석 중...' })

    const blob = await recorderRef.current.stop()

    const [transcript, pitchResult] = await Promise.all([
      transcribeBlob(blob).catch(() => ''),
      step.isLast
        ? analyzePitch(blob, step.referenceAudio)
        : Promise.resolve({ contourUser: [] as number[], contourRef: null, feedback: '', divergentRegions: [] as [number, number][] }),
    ])

    const evalResult = evaluateExpression(transcript, step)
    scoresRef.current.push(evalResult.score)
    feedbackRef.current.push(...evalResult.feedback)
    lastPitchRef.current = {
      pitchContourUser: pitchResult.contourUser,
      pitchContourRef: pitchResult.contourRef ?? [],
      pitchFeedback: pitchResult.feedback,
      pitchDivergentRegions: pitchResult.divergentRegions,
    }

    setDialogLine({ speaker: '나', text: transcript || '(인식 실패)', score: evalResult.score })

    if (step.isLast) {
      const avgScore = Math.round(
        scoresRef.current.reduce((a, b) => a + b, 0) / scoresRef.current.length
      )
      setTimeout(() => onFeedback({
        transcript,
        expressionScore: avgScore,
        expressionFeedback: feedbackRef.current,
        ...lastPitchRef.current,
      }), 1200)
    } else {
      setTimeout(() => {
        const next = stepIndex + 1
        setStepIndex(next)
        speakStep(next)
      }, 1200)
    }
  }

  function handleChipClick(phrase: string) {
    if (stepState !== 'idle') return
    stopSpeaking()
    const evalResult = evaluateExpression(phrase, step)
    scoresRef.current.push(evalResult.score)
    feedbackRef.current.push(...evalResult.feedback)
    setDialogLine({ speaker: '나', text: phrase, score: evalResult.score })

    if (step.isLast) {
      const avgScore = Math.round(
        scoresRef.current.reduce((a, b) => a + b, 0) / scoresRef.current.length
      )
      setTimeout(() => onFeedback({
        transcript: phrase,
        expressionScore: avgScore,
        expressionFeedback: feedbackRef.current,
        pitchContourUser: [],
        pitchContourRef: [],
        pitchFeedback: '힌트 선택 — 음조 분석 없음',
        pitchDivergentRegions: [],
      }), 900)
    } else {
      setTimeout(() => {
        const next = stepIndex + 1
        setStepIndex(next)
        speakStep(next)
      }, 900)
    }
  }

  const isUserTurn = stepState === 'idle'

  return (
    <div
      className="h-screen relative overflow-hidden"
      style={{ backgroundImage: `url('${scenario.image}')`, backgroundSize: 'cover', backgroundPosition: 'center top' }}
    >
      {/* ── Background scrim ── */}
      <div className="absolute inset-0 bg-black/20 pointer-events-none" />

      {/* ── Header ── */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-5 py-3">
        <button
          onClick={() => { stopSpeaking(); onBack() }}
          className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/80 hover:text-white hover:bg-black/60 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex-1 mx-4 h-1 bg-white/20 rounded-full overflow-hidden">
          <div className="h-full bg-white/70 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>

        <span className="text-xs text-white/80 bg-black/40 backdrop-blur-sm px-2.5 py-1 rounded-full">
          {stepIndex + 1} / {scenario.steps.length}
        </span>
      </div>

      {/* ── Avatar ── */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[26%] z-10"
           style={{ height: '72%', aspectRatio: '3/4' }}>
        <AvatarCharacter state={avatarState} className="w-full h-full" />
      </div>

      {/* ── VN Dialog box ── */}
      <div className="absolute bottom-0 left-0 right-0 z-20" style={{ height: '28%' }}>
        <div className="h-full bg-black/65 backdrop-blur-md border-t border-white/15 flex flex-col px-6 py-4 gap-2">

          {/* Speaker name + state dot */}
          <div className="flex items-center gap-3">
            <span className={`text-sm font-bold px-3 py-0.5 rounded ${
              dialogLine.speaker === '나'
                ? 'bg-indigo-600/80 text-white'
                : 'bg-white/15 text-white'
            }`}>
              {dialogLine.speaker}
            </span>

            {dialogLine.score !== undefined && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                dialogLine.score >= 80 ? 'bg-emerald-500/80 text-white' :
                dialogLine.score >= 50 ? 'bg-amber-500/80 text-white' :
                'bg-rose-500/80 text-white'
              }`}>
                {dialogLine.score}점
              </span>
            )}

            <div className={`w-1.5 h-1.5 rounded-full ml-auto ${
              stepState === 'recording'  ? 'bg-red-400 animate-pulse' :
              stepState === 'speaking'   ? 'bg-indigo-400 animate-pulse' :
              stepState === 'processing' ? 'bg-amber-400 animate-pulse' :
              'bg-green-400'
            }`} />
          </div>

          {/* Dialog text */}
          <p className="text-white text-sm leading-relaxed flex-1">
            {dialogLine.text}
          </p>

          {/* Controls (idle) */}
          {isUserTurn && (
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5 flex-1 flex-wrap">
                {step.targetExpressions.slice(0, 2).map((expr) => (
                  <button
                    key={expr}
                    onClick={() => handleChipClick(expr)}
                    className="text-xs text-white/70 border border-white/25 rounded-full px-2.5 py-1 hover:bg-white/15 hover:text-white transition-colors"
                  >
                    {expr}
                  </button>
                ))}
              </div>
              <button
                onClick={startRecording}
                className="w-11 h-11 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg transition-colors flex-shrink-0"
              >
                <Mic className="w-5 h-5" />
              </button>
            </div>
          )}

          {/* Recording stop button */}
          {stepState === 'recording' && (
            <div className="flex justify-end">
              <button
                onClick={stopRecording}
                className="w-11 h-11 rounded-full bg-red-500 hover:bg-red-400 text-white flex items-center justify-center shadow-lg animate-pulse transition-colors"
              >
                <MicOff className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
