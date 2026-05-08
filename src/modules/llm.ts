/**
 * LLM module — Whisper transcript를 Gemini API로 전달하고 응답을 받는다.
 *
 * 엔드포인트: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent
 * API 키: VITE_GEMINI_API_KEY 환경변수 또는 하드코딩된 기본값
 * 요청/응답은 모두 콘솔에 로깅된다.
 */

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"

const GEMINI_API_KEY = (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_GEMINI_API_KEY

const REQUEST_TIMEOUT_MS = 60_000

export type LLMContext = {
  scenarioTitle: string       // e.g. "병원"
  characterName: string       // e.g. "이주연 간호사"
  characterRole: string       // e.g. "병원 접수 담당"
  aiText: string              // AI가 방금 한 말
  targetExpressions: string[] // 정답 표현 목록
}

export interface UtteranceAnalysis {
  expressionFeedback: string  // 표현 적절성 피드백 (1~2문장)
  intendedText: string        // STT 발음 오류를 수정한 의도 텍스트 (오류 없으면 transcript 그대로)
}

/** Gemini API를 단일 호출로 표현 피드백과 발음 의도 텍스트를 함께 반환한다. */
export async function analyzeUtterance(
  transcript: string,
  context: LLMContext
): Promise<UtteranceAnalysis> {
  if (!GEMINI_API_KEY) {
    throw new Error('[LLM] VITE_GEMINI_API_KEY 환경변수가 설정되지 않았습니다.')
  }

  const prompt = `
당신은 고려인 학습자의 한국어 발화를 분석하는 교사입니다.
아래 대화 상황에서 학습자의 발화(STT 전사)를 분석하고 JSON으로만 응답하세요.

상황: ${context.scenarioTitle} — ${context.characterRole}(${context.characterName})과의 대화
AI 발화: "${context.aiText}"
정답 표현 예시: ${context.targetExpressions.join(', ')}
학습자 발화(STT): "${transcript}"

다음 JSON 형식으로만 응답하세요 (다른 텍스트 없이):
{
  "expressionFeedback": "표현 적절성 피드백 — 20자 이내 한 문장 (적절하면 짧은 칭찬, 아니면 핵심 개선 한 가지)",
  "intendedText": "발음 오류를 수정한 실제 의도 텍스트. 외국인 발음 실수로 STT가 잘못 전사된 경우 올바른 텍스트를 반환. 오류가 없으면 STT 텍스트 그대로 반환."
}
`.trim()

  const url = `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`
  const body = { contents: [{ parts: [{ text: prompt }] }] }

  console.log('[LLM] 발화 분석 요청 →', { transcript, scenarioTitle: context.scenarioTitle })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const startedAt = performance.now()

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const rawText = await response.text()
    const latencyMs = Math.round(performance.now() - startedAt)

    console.log(`[LLM] 응답 (${response.status}, ${latencyMs}ms)`)

    if (!response.ok) {
      throw new Error(`Gemini API request failed (${response.status}): ${rawText.slice(0, 300)}`)
    }

    const data = JSON.parse(rawText)
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    // JSON 파싱 (Gemini가 마크다운 코드블록으로 감쌀 수 있으므로 정규식으로 추출)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { expressionFeedback: text.trim(), intendedText: transcript }
    }

    const parsed = JSON.parse(jsonMatch[0]) as Partial<UtteranceAnalysis>
    return {
      expressionFeedback: parsed.expressionFeedback ?? '',
      intendedText: parsed.intendedText ?? transcript,
    }
  } finally {
    clearTimeout(timeout)
  }
}
