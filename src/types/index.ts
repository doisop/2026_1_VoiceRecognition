export type Screen = 'home' | 'roleplay' | 'feedback'

export interface ScenarioStep {
  id: number
  aiText: string
  targetExpressions: string[]
  keywords: string[]
  referenceAudio: string
  isLast: boolean
  modelUtterance?: string   // Step 2 발음 연습용 모범 발화 텍스트
}

export interface PronunciationPracticeResult {
  overall_score: number
  pronunciation_feedback: string  // 발음하는 방법 (된소리 vs 평음 등)
  pitch_feedback: string          // 음의 높낮이
  speed_feedback: string          // 말의 속도
  feedback_ru?: {                 // 러시아어 피드백
    pronunciation: string
    pitch: string
    speed: string
  }
  // 서버 rule-based 피드백 — 음절 단위 빨간색 강조 렌더링용
  bad_chars?: string[]            // 6개 분석기 per_syllable 평균 점수 기준 교정 필요 음절
  targeted_tips?: string[]        // "'문장'에서 '음절' 발음이 ..." 형태의 문장들
  source_text?: string            // 비교 기준 텍스트 (input_text)
  // 추후 LLM 피드백 확장용 수치 데이터 (선택)
  _scores?: { pronunciation: number; pitch: number; speed: number }
  _raw?: { dtwDistance: number; pitchDivergentRatio: number; speedRatio: number }
}

export interface Scenario {
  id: string
  title: string
  titleSub: string
  description: string
  difficulty: '초급' | '중급' | '고급'
  image: string
  voice: string   // Naver Clova Voice speaker ID
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
