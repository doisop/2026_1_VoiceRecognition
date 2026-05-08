import type { SpeedResult } from './types'

const FRAME_SIZE = 512
const RMS_THRESHOLD = 0.01  // 유성음 판정 에너지 임계값

/**
 * 사용자와 정답의 발화 속도(유성음 구간 비율)를 비교한다.
 *
 * TODO: 현재 RMS 에너지 기반 VAD로 유성음 구간 추정. 정확도 향상 시:
 *   - F0 기반 유성음 검출로 교체 (pitchAnalysis.ts의 detectF0 재사용 가능)
 *   - 음절 경계 검출(Onset Detection) 추가 → 음절/초 직접 측정
 *   - naturalRate(6.0) 및 speedRatio 허용 범위(0.7~1.3)는 실측 데이터로 조정 필요
 */
export function analyzeSpeed(
  userSamples: Float32Array,
  refSamples: Float32Array | null,
): SpeedResult {
  const userRatio = calcVoicedRatio(userSamples)
  const userRate = userSamples.length > 0 ? userRatio / (userSamples.length / 16000) : 0

  if (!refSamples) {
    // 레퍼런스 없음: 자연스러운 한국어 속도(약 5~7음절/초) 기준 절대 판단
    const naturalRate = 6.0
    const ratio = naturalRate > 0 ? userRate / naturalRate : 1
    return {
      score: calcSpeedScore(ratio),
      speedRatio: ratio,
      hasReference: false,
    }
  }

  const refRatio = calcVoicedRatio(refSamples)
  const refRate = refSamples.length > 0 ? refRatio / (refSamples.length / 16000) : 1
  const ratio = refRate > 0 ? userRate / refRate : 1

  return {
    score: calcSpeedScore(ratio),
    speedRatio: ratio,
    hasReference: true,
  }
}

function calcVoicedRatio(samples: Float32Array): number {
  let voiced = 0
  let total = 0
  for (let i = 0; i + FRAME_SIZE <= samples.length; i += FRAME_SIZE) {
    let rms = 0
    for (let j = i; j < i + FRAME_SIZE; j++) rms += samples[j] ** 2
    if (Math.sqrt(rms / FRAME_SIZE) > RMS_THRESHOLD) voiced++
    total++
  }
  return total > 0 ? voiced / total : 0
}

// ratio 1.0 = 정답과 동일 속도, 0.7~1.3 = 정상 범위
function calcSpeedScore(ratio: number): number {
  return Math.round(100 * Math.max(0, 1 - Math.abs(ratio - 1) / 0.5))
}
