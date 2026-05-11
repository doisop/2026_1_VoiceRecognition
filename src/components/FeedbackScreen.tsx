import type { FeedbackResult, Scenario } from '../types'
import PitchGraph from './PitchGraph'

interface Props {
  result: FeedbackResult
  scenario: Scenario
  onRetry: () => void
  onHome: () => void
}

export default function FeedbackScreen({ result, scenario, onRetry, onHome }: Props) {
  const stepResults = result.stepResults && result.stepResults.length > 0
    ? result.stepResults
    : [{
        stepId: -1,
        aiText: '단일 결과',
        transcript: result.transcript,
        expressionScore: result.expressionScore,
        expressionFeedback: result.expressionFeedback,
        pitchContourUser: result.pitchContourUser,
        pitchContourRef: result.pitchContourRef,
        pitchFeedback: result.pitchFeedback,
        pitchDivergentRegions: result.pitchDivergentRegions,
      }]

  const expressionScore = Math.round(
    stepResults.reduce((sum, stepResult) => sum + stepResult.expressionScore, 0) / stepResults.length
  )

  const scoreColor =
    expressionScore >= 80 ? 'text-green-500' :
    expressionScore >= 50 ? 'text-yellow-400' :
    'text-red-400'

  const scoreLabel =
    expressionScore >= 80 ? '훌륭해요!' :
    expressionScore >= 50 ? '잘 했어요' :
    '다시 해봐요'

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-4">

      {/* Score header */}
      <div className="text-center">
        <p className="text-sm text-gray-400 mb-1">{scenario.title} 완료</p>
        <p className={`text-6xl font-bold ${scoreColor}`}>{expressionScore}</p>
        <p className="text-lg font-semibold text-gray-300 mt-1">{scoreLabel}</p>
      </div>

      {stepResults.map((stepResult, index) => {
        const hasPitchData = stepResult.pitchContourUser.length > 0
        return (
          <div key={`${stepResult.stepId}-${index}`} className="bg-gray-800 rounded-2xl p-4 space-y-3">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
              문장 {index + 1}
            </p>

            <div>
              <p className="text-[11px] text-gray-500 mb-1">상대방 문장</p>
              <p className="text-sm text-gray-300">{stepResult.aiText}</p>
            </div>

            <div>
              <p className="text-[11px] text-gray-500 mb-1">내가 말한 내용</p>
              <p className="text-white font-medium text-sm">
                {stepResult.transcript || '(인식된 내용 없음)'}
              </p>
            </div>

            <div>
              <p className="text-[11px] text-gray-500 mb-1">표현 평가 ({stepResult.expressionScore}점)</p>
              {stepResult.expressionFeedback.length > 0 ? (
                <ul className="space-y-1.5">
                  {stepResult.expressionFeedback.map((fb, i) => (
                    <li key={i} className="text-sm text-gray-300 flex gap-2">
                      <span className="text-yellow-400 flex-shrink-0">•</span>
                      <span>{fb}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-green-400 font-medium">
                  핵심 표현을 정확하게 사용했어요!
                </p>
              )}
            </div>

            <div>
              <p className="text-[11px] text-gray-500 mb-2">음조 분석 (Pitch Contour)</p>
              {hasPitchData ? (
                <>
                  <PitchGraph
                    contourUser={stepResult.pitchContourUser}
                    contourRef={stepResult.pitchContourRef?.length ? stepResult.pitchContourRef : null}
                    divergentRegions={stepResult.pitchDivergentRegions}
                  />
                  <p className="text-sm text-gray-300 mt-3">{stepResult.pitchFeedback}</p>
                  {stepResult.pitchDivergentRegions.length > 0 && (
                    <p className="text-xs text-red-400 mt-1">
                      붉은 구간: 기준 음성과 억양 차이가 큰 부분
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-500">{stepResult.pitchFeedback}</p>
              )}
            </div>
          </div>
        )
      })}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={onRetry}
          className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-500 transition-colors"
        >
          다시 하기
        </button>
        <button
          onClick={onHome}
          className="flex-1 py-3 rounded-xl bg-gray-700 text-gray-200 font-semibold hover:bg-gray-600 transition-colors"
        >
          홈으로
        </button>
      </div>
    </div>
  )
}
