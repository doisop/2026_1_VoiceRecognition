import type { FeedbackResult, Scenario } from '../types'
import PitchGraph from './PitchGraph'

interface Props {
  result: FeedbackResult
  scenario: Scenario
  onRetry: () => void
  onHome: () => void
}

export default function FeedbackScreen({ result, scenario, onRetry, onHome }: Props) {
  const {
    expressionScore,
    expressionFeedback,
    transcript,
    pitchFeedback,
    pitchContourUser,
    pitchContourRef,
    pitchDivergentRegions,
  } = result

  const scoreColor =
    expressionScore >= 80 ? 'text-green-600' :
    expressionScore >= 50 ? 'text-yellow-600' :
    'text-red-600'

  const scoreLabel =
    expressionScore >= 80 ? '훌륭해요!' :
    expressionScore >= 50 ? '잘 했어요' :
    '다시 해봐요'

  const hasPitchData = pitchContourUser.length > 0

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-4">

      {/* Score header */}
      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-1">{scenario.title} 완료</p>
        <p className={`text-6xl font-bold ${scoreColor}`}>{expressionScore}</p>
        <p className="text-lg font-semibold text-foreground mt-1">{scoreLabel}</p>
      </div>

      {/* Transcript */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1">
          내가 말한 내용
        </p>
        <p className="text-foreground font-medium text-sm">
          {transcript || '(인식된 내용 없음)'}
        </p>
      </div>

      {/* Expression feedback */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-2">
          표현 평가
        </p>
        {expressionFeedback.length > 0 ? (
          <ul className="space-y-1.5">
            {expressionFeedback.map((fb, i) => (
              <li key={i} className="text-sm text-foreground flex gap-2">
                <span className="text-yellow-600 flex-shrink-0">•</span>
                <span>{fb}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-green-600 font-medium">
            핵심 표현을 정확하게 사용했어요!
          </p>
        )}
      </div>

      {/* Pitch analysis */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-3">
          음조 분석 (Pitch Contour)
        </p>

        {hasPitchData ? (
          <>
            <PitchGraph
              contourUser={pitchContourUser}
              contourRef={pitchContourRef?.length ? pitchContourRef : null}
              divergentRegions={pitchDivergentRegions}
            />
            <p className="text-sm text-foreground mt-3">{pitchFeedback}</p>
            {pitchDivergentRegions.length > 0 && (
              <p className="text-xs text-red-600 mt-1">
                붉은 구간: 기준 음성과 억양 차이가 큰 부분
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{pitchFeedback}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={onRetry}
          className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
        >
          다시 하기
        </button>
        <button
          onClick={onHome}
          className="flex-1 py-3 rounded-xl bg-secondary text-secondary-foreground font-semibold hover:bg-secondary/80 transition-colors"
        >
          홈으로
        </button>
      </div>
    </div>
  )
}
