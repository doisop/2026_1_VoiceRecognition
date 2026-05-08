import { analyzePitch } from '../pitchAnalysis'
import type { PitchResult } from './types'

/**
 * 기존 pitchAnalysis.ts를 재사용해 사용자 발화와 정답 오디오의 음조를 비교한다.
 *
 * TODO: 현재 자기상관(ACF) 기반 F0 비교. 정확도 부족 시 직접 구현으로 교체:
 *   - YIN 또는 CREPE 알고리즘으로 F0 검출 정확도 향상
 *   - 음절 단위 피치 패턴 비교 (현재는 프레임 단위 z-score 비교)
 *   - 고려인 특유의 억양 오류 패턴(문장 끝 상승 등) 특화 규칙 추가
 *   - pitchAnalysis.ts 내부 DIVERGE_THRESHOLD(1.2) 값도 캘리브레이션 필요
 */
export async function comparePitch(
  userBlob: Blob,
  refPath: string | null
): Promise<PitchResult> {
  const result = await analyzePitch(userBlob, refPath)

  const totalFrames = Math.max(result.contourUser.length, 1)
  const divergedFrames = result.divergentRegions.reduce((sum, [a, b]) => sum + (b - a), 0)
  const divergentRatio = Math.min(divergedFrames / totalFrames, 1)

  return {
    score: Math.round(100 * (1 - divergentRatio)),
    divergentRatio,
    divergentRegions: result.divergentRegions,
    hasReference: refPath !== null && result.contourRef !== null,
    feedbackText: result.feedback,
  }
}
