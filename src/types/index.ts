export type Screen = 'home' | 'roleplay' | 'feedback'

export interface ScenarioStep {
  id: number
  aiText: string
  targetExpressions: string[]
  targetExpressionAudio?: Array<string | null>
  keywords: string[]
  referenceAudio?: string | null
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
  stepResults?: StepFeedbackResult[]
}

export interface StepFeedbackResult {
  stepId: number
  aiText: string
  transcript: string
  expressionScore: number
  expressionFeedback: string[]
  pitchContourUser: number[]
  pitchContourRef: number[]
  pitchFeedback: string
  pitchDivergentRegions: [number, number][]
}
