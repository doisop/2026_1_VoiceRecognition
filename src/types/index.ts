export type Screen = 'home' | 'roleplay' | 'feedback'

export interface ScenarioStep {
  id: number
  aiText: string
  targetExpressions: string[]
  keywords: string[]
  referenceAudio: string
  isLast: boolean
}

export interface Scenario {
  id: string
  title: string
  titleSub: string
  description: string
  difficulty: '초급' | '중급' | '고급'
  image: string
  character: {
    name: string
    role: string
  }
  steps: ScenarioStep[]
}

export interface FeedbackResult {
  transcript: string
  expressionScore: number          // 0–100
  expressionFeedback: string[]
  pitchContourUser: number[]
  pitchContourRef: number[]
  pitchFeedback: string
  pitchDivergentRegions: [number, number][]
}
