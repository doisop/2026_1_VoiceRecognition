import type { ScenarioStep } from '../types'

export interface EvalResult {
  score: number          // 0–100
  feedback: string[]
  matchedExpressionIndex: number | null
}

/**
 * Evaluates a transcript against the scenario step's target expressions and keywords.
 * Score breakdown:
 *   - Any keyword present: +60 base
 *   - Each additional keyword: proportional bonus (up to 80)
 *   - Exact/close match to a target expression: 100
 */
export function evaluateExpression(transcript: string, step: ScenarioStep): EvalResult {
  const normalized = normalize(transcript)
  const feedback: string[] = []

  // Exact match check
  for (let i = 0; i < step.targetExpressions.length; i++) {
    const expr = step.targetExpressions[i]
    if (normalize(expr) === normalized) {
      return { score: 100, feedback: [], matchedExpressionIndex: i }
    }
  }

  // Close match (contains full target expression)
  for (let i = 0; i < step.targetExpressions.length; i++) {
    const expr = step.targetExpressions[i]
    if (normalized.includes(normalize(expr))) {
      return { score: 95, feedback: [], matchedExpressionIndex: i }
    }
  }

  // Keyword matching
  const matchedKeywords = step.keywords.filter((kw) => normalized.includes(normalize(kw)))
  const missedKeywords = step.keywords.filter((kw) => !normalized.includes(normalize(kw)))

  if (matchedKeywords.length === 0) {
    feedback.push(`핵심 표현을 다시 확인해 보세요: "${step.targetExpressions[0]}"`)
    return { score: 20, feedback, matchedExpressionIndex: null }
  }

  const keywordScore = Math.min(80, Math.round((matchedKeywords.length / step.keywords.length) * 80))

  if (missedKeywords.length > 0) {
    feedback.push(`누락된 표현: ${missedKeywords.join(', ')}`)
  }
  feedback.push(`목표 표현 예시: "${step.targetExpressions[0]}"`)

  return { score: keywordScore, feedback, matchedExpressionIndex: null }
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}
