import Meyda from 'meyda'

const FRAME_SIZE = 512   // 2의 거듭제곱 (Meyda 요구사항)
const HOP_SIZE = 256
const NUM_COEFFS = 13
const MAX_FRAMES = 500   // 계산량 상한 (~8초 발화 기준)

/**
 * PCM Float32Array에서 MFCC 프레임 시퀀스를 추출한다.
 *
 * TODO: 현재 Meyda.js 기반 구현. 정확도 부족 시 직접 구현으로 교체 필요.
 *   - 멜 필터뱅크 구성 (삼각 필터, 26개 권장)
 *   - 로그 에너지 → DCT → 13~20개 계수 추출
 *   - Delta-MFCC(1차 미분) 추가 시 된소리/평음 구분 정확도 향상 가능
 *   - 참고: 직접 구현 시 audioPreprocess.ts의 decodeToMono와 연계
 */
export function extractMFCC(samples: Float32Array, sampleRate: number): number[][] {
  Meyda.sampleRate = sampleRate
  Meyda.numberOfMFCCCoefficients = NUM_COEFFS

  const frames: number[][] = []
  const maxSample = Math.min(samples.length - FRAME_SIZE, HOP_SIZE * MAX_FRAMES)

  for (let i = 0; i + FRAME_SIZE <= maxSample; i += HOP_SIZE) {
    const frame = samples.slice(i, i + FRAME_SIZE)
    try {
      const features = Meyda.extract(['mfcc'], frame) as { mfcc?: number[] | Float32Array } | null
      if (features?.mfcc) {
        frames.push(Array.from(features.mfcc).slice(0, NUM_COEFFS))
      }
    } catch {
      // 프레임 처리 오류는 건너뜀
    }
  }

  return frames
}
