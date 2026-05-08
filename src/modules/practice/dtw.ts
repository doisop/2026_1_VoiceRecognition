/**
 * 두 MFCC 프레임 시퀀스 간 DTW 거리를 계산한다 (정규화된 값 반환).
 *
 * TODO: 현재 기본 DTW 구현. 정확도 향상 시 다음 개선 고려:
 *   - Sakoe-Chiba band 제약 추가 (윈도우 크기 제한 → 비현실적 정렬 방지)
 *   - 프레임 간 거리를 유클리드 대신 코사인 유사도로 교체
 *   - DTW_THRESHOLD(scoreCalculator.ts)는 실제 사용자 데이터로 캘리브레이션 필요
 */
export function computeDTW(a: number[][], b: number[][]): number {
  const n = a.length
  const m = b.length
  if (n === 0 || m === 0) return Infinity

  const dp: number[][] = Array.from({ length: n }, () => new Array(m).fill(Infinity))
  dp[0][0] = euclidean(a[0], b[0])

  for (let i = 1; i < n; i++) dp[i][0] = dp[i - 1][0] + euclidean(a[i], b[0])
  for (let j = 1; j < m; j++) dp[0][j] = dp[0][j - 1] + euclidean(a[0], b[j])

  for (let i = 1; i < n; i++) {
    for (let j = 1; j < m; j++) {
      dp[i][j] = euclidean(a[i], b[j]) + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }

  // 경로 길이로 정규화 → 발화 길이 차이 영향 제거
  return dp[n - 1][m - 1] / Math.max(n, m)
}

function euclidean(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2
  return Math.sqrt(sum)
}
