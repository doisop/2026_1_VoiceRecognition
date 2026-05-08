export interface MonoAudio {
  samples: Float32Array
  sampleRate: number
  durationSec: number
}

export interface MFCCResult {
  score: number          // 0–100
  dtwDistance: number    // 정규화된 DTW 거리
  hasReference: boolean
}

export interface PitchResult {
  score: number          // 0–100
  divergentRatio: number // 발산 비율 0–1
  divergentRegions: [number, number][]
  hasReference: boolean
  feedbackText: string   // pitchAnalysis.ts 생성 피드백
}

export interface SpeedResult {
  score: number          // 0–100
  speedRatio: number     // userRate / refRate (1.0 = 동일 속도)
  hasReference: boolean
}
