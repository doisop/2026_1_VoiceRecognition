import { useState, useRef, useEffect } from 'react'
import type { Scenario, FeedbackResult } from '../types'
import { evaluateExpression } from '../modules/expressionEval'
import { AudioRecorder } from '../modules/audio'
import { transcribeBlob } from '../modules/stt'
import { analyzeUtterance } from '../modules/llm'
import { analyzePitch } from '../modules/pitchAnalysis'
import { analyzePronunciation } from '../modules/pronunciationAnalysis'
import { speak, stopSpeaking, warmUpAudio, synthesizeToBlob } from '../modules/tts'
import { practiceUtterances } from '../data/practiceUtterances'
import AvatarCharacter, { type AvatarState } from './AvatarCharacter'
import PracticeModal from './PracticeModal'
import { Mic, MicOff, X } from 'lucide-react'

// ─── 타이밍 측정 헬퍼 ─────────────────────────────────────────────────────────
function perfTs(): string { return new Date().toISOString().slice(11, 23) }
function perfLog(segment: string, status: 'START' | 'END' | 'INFO', msg: string, ms?: number): void {
  const msStr = ms !== undefined ? ` (소요시간: ${ms}ms)` : ''
  console.log(`[${perfTs()}] [${segment}] ${status} ${msg}${msStr}`)
}
// ─────────────────────────────────────────────────────────────────────────────

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
  pronunciationFeedback?: string
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

  const [showPracticeModal, setShowPracticeModal] = useState(false)
  const [practiceModelText, setPracticeModelText] = useState('')
  const practiceResolveRef = useRef<(() => void) | null>(null)

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
    warmUpAudio().then(() => speakStep(0))
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

  // ── Step 2: 발음 연습 모달 ────────────────────────────────────────────────────

  async function enterPracticeMode(modelText: string): Promise<void> {
    setPracticeModelText(modelText)
    setShowPracticeModal(true)
    return new Promise<void>((resolve) => {
      practiceResolveRef.current = resolve
    })
  }

  function handlePracticeClose() {
    setShowPracticeModal(false)
    practiceResolveRef.current?.()
    practiceResolveRef.current = null
  }

  // ─────────────────────────────────────────────────────────────────────────────

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

    const cycleStart = performance.now()
    perfLog('CYCLE', 'START', '발화 처리 사이클 시작')

    setStepState('processing')
    setAvatarState('thinking')
    setDialogLine({ speaker: '나', text: '분석 중...' })

    const blob = await recorderRef.current.stop()

    // ── STT ──────────────────────────────────────────────────────────────────────
    const sttStart = performance.now()
    perfLog('STT_INFER', 'START', 'STT 추론 시작 (Modal Whisper API 요청)')

    const [transcript, pitchResult] = await Promise.all([
      transcribeBlob(blob).catch(() => ''),
      step.isLast
        ? analyzePitch(blob, step.referenceAudio)
        : Promise.resolve({ contourUser: [] as number[], contourRef: null, feedback: '', divergentRegions: [] as [number, number][] }),
    ])

    const sttMs = Math.round(performance.now() - sttStart)
    perfLog('STT_INFER', 'END', `STT 추론 완료: "${transcript}"`, sttMs)

    const evalResult = evaluateExpression(transcript, step)
    scoresRef.current.push(evalResult.score)
    feedbackRef.current.push(...evalResult.feedback)

    lastPitchRef.current = {
      pitchContourUser: pitchResult.contourUser,
      pitchContourRef: pitchResult.contourRef ?? [],
      pitchFeedback: pitchResult.feedback,
      pitchDivergentRegions: pitchResult.divergentRegions,
    }

    setDialogLine({
      speaker: '나',
      text: transcript || '(인식 실패)',
      score: evalResult.score,
    })

    // ── LLM ──────────────────────────────────────────────────────────────────────
    const llmContext = {
      scenarioTitle: scenario.title,
      characterName: scenario.character.name,
      characterRole: scenario.character.role,
      aiText: step.aiText,
      targetExpressions: step.targetExpressions,
    }

    const llmStart = performance.now()
    perfLog('LLM_REQ', 'START', 'LLM 상황 적합성 판정 요청 (Gemini API)')

    const { expressionFeedback, intendedText } = transcript
      ? await analyzeUtterance(transcript, llmContext).catch((err) => {
          console.warn('[LLM] 분석 실패:', err)
          return { expressionFeedback: '', intendedText: transcript }
        })
      : { expressionFeedback: '', intendedText: '' }

    const llmMs = Math.round(performance.now() - llmStart)
    perfLog('LLM_REQ', 'END', `LLM 응답 수신. feedback: "${expressionFeedback.slice(0, 30)}"`, llmMs)

    // ── 발음 분석 (의도 텍스트 ≠ STT) ──────────────────────────────────────────
    let pronFeedback = ''
    if (transcript && intendedText && intendedText !== transcript) {
      perfLog('PRON', 'INFO', `발음 오류 감지: "${transcript}" → "${intendedText}"`)

      const pronResult = analyzePronunciation(transcript, [intendedText])
      if (pronResult.hasError) {
        pronFeedback = pronResult.feedback
        feedbackRef.current.push(`[발음 피드백] ${pronFeedback}`)
      }

      // 피치 비교는 background — 메인 흐름 blocking 없음
      synthesizeToBlob(intendedText, scenario.voice as import('../modules/tts').GoogleVoice)
        .then((refBlob) => analyzePitch(blob, refBlob))
        .then((pitchCmp) => {
          if (pitchCmp.feedback) feedbackRef.current.push(`[억양 피드백] ${pitchCmp.feedback}`)
          lastPitchRef.current = {
            pitchContourUser: pitchCmp.contourUser,
            pitchContourRef: pitchCmp.contourRef ?? [],
            pitchFeedback: pitchCmp.feedback,
            pitchDivergentRegions: pitchCmp.divergentRegions,
          }
        })
        .catch((err) => console.warn('[발음] 피치 비교 실패:', err))
    }

    // ── Step 1 TTS (LLM 피드백 발화) ─────────────────────────────────────────────
    if (expressionFeedback) {
      feedbackRef.current.push(`[표현 피드백] ${expressionFeedback}`)
    }
    const combinedFeedback = [expressionFeedback, pronFeedback].filter(Boolean).join(' ')

    let step1TtsMs = 0
    if (combinedFeedback) {
      const step1TtsStart = performance.now()
      perfLog('STEP1_TTS', 'START', `Step1 피드백 TTS 요청: "${combinedFeedback.slice(0, 30)}"`)

      setAvatarState('talking')
      setDialogLine({
        speaker: scenario.character.name,
        text: combinedFeedback,
        pronunciationFeedback: pronFeedback || undefined,
      })
      await new Promise<void>((resolve) => {
        speak(combinedFeedback, {
          voice: scenario.voice as import('../modules/tts').GoogleVoice,
          onEnd: resolve,
        })
      })
      step1TtsMs = Math.round(performance.now() - step1TtsStart)
      perfLog('STEP1_TTS', 'END', 'Step1 TTS 재생 완료 (네트워크+재생 합산)', step1TtsMs)
    }

    // ── Step 2: "다음 문장을 읽고 따라 말해보세요" TTS + 모달 ─────────────────────
    const practiceText = practiceUtterances[`${scenario.id}_${step.id}`]
    let step2TtsMs = 0
    let modalMs = 0

    if (practiceText) {
      const step2TtsStart = performance.now()
      perfLog('STEP2_TTS', 'START', '"다음 문장을 읽고 따라 말해보세요" TTS 요청')
      speak('다음 문장을 읽고 따라 말해보세요.', {
        voice: scenario.voice as import('../modules/tts').GoogleVoice,
        onEnd: () => {
          step2TtsMs = Math.round(performance.now() - step2TtsStart)
          perfLog('STEP2_TTS', 'END', 'Step2 안내 TTS 재생 완료', step2TtsMs)
        },
      })

      const modalStart = performance.now()
      perfLog('MODAL', 'START', 'Step2 모달 표시')
      await enterPracticeMode(practiceText)
      modalMs = Math.round(performance.now() - modalStart)
      perfLog('MODAL', 'END', '모달 종료 (사용자 클릭)', modalMs)
    }

    // ── 사이클 요약 (모달 사용자 대기 시간 제외) ───────────────────────────────────
    const totalExModal = Math.round(performance.now() - cycleStart) - modalMs
    const otherMs = Math.max(0, totalExModal - sttMs - llmMs - step1TtsMs)
    perfLog('SUMMARY', 'INFO', `=== 발화 사이클 요약 (시나리오: ${scenario.id}, step: ${step.id}) ===`)
    console.log(`[SUMMARY] STT 추론:              ${String(sttMs).padStart(6)}ms`)
    console.log(`[SUMMARY] LLM 판정:              ${String(llmMs).padStart(6)}ms`)
    console.log(`[SUMMARY] Step1 TTS (합계):      ${String(step1TtsMs).padStart(6)}ms`)
    console.log(`[SUMMARY] Step2 안내 TTS (비동기):${String(step2TtsMs).padStart(5)}ms`)
    console.log(`[SUMMARY] 기타/전환:             ${String(otherMs).padStart(6)}ms`)
    console.log(`[SUMMARY] ─────────────────────────`)
    console.log(`[SUMMARY] 총 소요시간 (모달 제외): ${String(totalExModal).padStart(5)}ms`)

    if (step.isLast) {
      const avgScore = Math.round(
        scoresRef.current.reduce((a, b) => a + b, 0) / scoresRef.current.length
      )
      onFeedback({
        transcript,
        expressionScore: avgScore,
        expressionFeedback: feedbackRef.current,
        ...lastPitchRef.current,
      })
    } else {
      const next = stepIndex + 1
      setStepIndex(next)
      speakStep(next)
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

      {/* ── Step 2 발음 연습 모달 ── */}
      {showPracticeModal && (
        <PracticeModal
          modelText={practiceModelText}
          scenarioId={scenario.id}
          stepId={step.id}
          onClose={handlePracticeClose}
        />
      )}

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
          <p className="text-white text-lg leading-relaxed flex-1 whitespace-pre-wrap">
            {dialogLine.text}
          </p>

          {/* 발음 피드백 */}
          {dialogLine.pronunciationFeedback && (
            <p className="text-amber-300 text-xs leading-snug border-t border-white/10 pt-1.5">
              {dialogLine.pronunciationFeedback}
            </p>
          )}

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
