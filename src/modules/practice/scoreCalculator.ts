import type { MFCCResult, PitchResult, SpeedResult } from './types'
import type { PronunciationPracticeResult } from '../../types'

// 가중치 — 인자로 주입 가능 (추후 조정 용이)
interface Weights {
  pronunciation: number  // MFCC 기반 발음 방법
  pitch: number          // F0 기반 음의 높낮이
  speed: number          // 발화 속도
}

const DEFAULT_WEIGHTS: Weights = {
  pronunciation: 0.50,
  pitch: 0.30,
  speed: 0.20,
}

// TODO: DTW_THRESHOLD는 실제 사용자 10명 이상 테스트 후 캘리브레이션 필요 (현재 임시값 2.0)
const DTW_THRESHOLD = 2.0

export function calcOverallScore(
  mfcc: MFCCResult,
  pitch: PitchResult,
  speed: SpeedResult,
  weights: Weights = DEFAULT_WEIGHTS
): number {
  return Math.round(
    mfcc.score  * weights.pronunciation +
    pitch.score * weights.pitch +
    speed.score * weights.speed
  )
}

export function generateFeedback(
  mfcc: MFCCResult,
  pitch: PitchResult,
  speed: SpeedResult
): PronunciationPracticeResult {
  const overall_score = calcOverallScore(mfcc, pitch, speed)

  return {
    overall_score,
    pronunciation_feedback: buildPronunciationFeedback(mfcc),
    pitch_feedback: buildPitchFeedback(pitch),
    speed_feedback: buildSpeedFeedback(speed),
    _scores: {
      pronunciation: mfcc.score,
      pitch: pitch.score,
      speed: speed.score,
    },
    _raw: {
      dtwDistance: mfcc.dtwDistance,
      pitchDivergentRatio: pitch.divergentRatio,
      speedRatio: speed.speedRatio,
    },
  }
}

function buildPronunciationFeedback(mfcc: MFCCResult): string {
  if (!mfcc.hasReference) return '정답 음성이 없어 발음 비교를 건너뜁니다.'
  const d = mfcc.dtwDistance
  if (d < DTW_THRESHOLD * 0.5) return '발음이 매우 정확합니다!'
  if (d < DTW_THRESHOLD * 0.75) return '발음이 대체로 자연스럽습니다. 된소리 발음을 조금 더 강하게 해보세요.'
  if (d < DTW_THRESHOLD) return '된소리(ㅃ, ㅉ, ㄲ 등) 발음을 더 또렷하게 연습해보세요.'
  return '발음을 다시 연습해보세요. 된소리와 모음 구분에 집중해주세요.'
}

function buildPitchFeedback(pitch: PitchResult): string {
  if (!pitch.hasReference) return '정답 음성이 없어 음조 비교를 건너뜁니다.'
  // pitchAnalysis.ts에서 생성된 한국어 피드백 재사용
  return pitch.feedbackText || '음조 분석 결과를 가져올 수 없습니다.'
}

function buildSpeedFeedback(speed: SpeedResult): string {
  const r = speed.speedRatio
  if (r < 0.7) return '발음 속도가 너무 느립니다. 조금 더 빠르게 말해보세요.'
  if (r > 1.3) return '발음 속도가 너무 빠릅니다. 조금 더 천천히 말해보세요.'
  if (r < 0.85) return '발음 속도가 조금 느립니다. 정답 음성을 참고해 연습해보세요.'
  if (r > 1.15) return '발음 속도가 조금 빠릅니다. 정답 음성을 참고해 연습해보세요.'
  return '말의 속도가 자연스럽습니다!'
}
