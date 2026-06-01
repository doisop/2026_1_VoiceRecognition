/**
 * Step 2 발음 연습 분석 — Modal voice_compare 백엔드 호출.
 *
 * 사용자 녹음 Blob + 시나리오/스텝 + 모범 발화 텍스트를 받아:
 *   1) 정답 wav (`/audio/practice/{scenarioId}_{stepId}_ref.wav`) 로드
 *   2) Modal 서버(/compare)로 두 wav + 텍스트 전송
 *   3) 5축 분석 결과를 3카테고리(발음 방법/음높이/속도) + 100점으로 환산해 반환
 */

import type { PronunciationPracticeResult } from '../../types'
import { compareViaModal } from './modalCompare'

/**
 * 고려인 한국어 학습자 발음을 분석한다.
 *
 * @param userBlob   - PracticeModal에서 녹음된 사용자 오디오
 * @param scenarioId - 'hospital' | 'bank' | 'government'
 * @param stepId     - 0, 1, 2, ...
 * @param modelText  - 따라 말한 모범 발화 텍스트
 */
export async function analyzePronunciationPractice(
  userBlob: Blob,
  scenarioId: string,
  stepId: number,
  modelText: string,
): Promise<PronunciationPracticeResult> {
  return compareViaModal(userBlob, scenarioId, stepId, modelText)
}
