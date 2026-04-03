/**
 * LLM module — Whisper transcript를 Gemini API로 전달하고 응답을 받는다.
 *
 * 엔드포인트: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent
 * API 키: VITE_GEMINI_API_KEY 환경변수 또는 하드코딩된 기본값
 * 요청/응답은 모두 콘솔에 로깅된다.
 */

const GEMINI_MODEL = "gemini-2.5-pro";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"

const GEMINI_API_KEY =
  ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_GEMINI_API_KEY) ??
  "AIzaSyC670oAp_pyY72K-w5gexFrTo0SbmBO3m0"

const REQUEST_TIMEOUT_MS = 60_000

export type LLMContext = {
  scenarioTitle: string       // e.g. "병원"
  characterName: string       // e.g. "이주연 간호사"
  characterRole: string       // e.g. "병원 접수 담당"
  aiText: string              // AI가 방금 한 말
  targetExpressions: string[] // 정답 표현 목록
}

/**
 * 현재 시나리오 컨텍스트와 사용자 발화를 Gemini에게 전달해
 * 표현의 적절성에 대한 피드백을 받는다.
 *
 * @param transcript - Whisper STT 전사 텍스트
 * @param context    - 현재 시나리오/스텝 정보
 * @returns Gemini 피드백 문자열
 */
export async function sendToLLM(transcript: string, context: LLMContext): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('[LLM] VITE_GEMINI_API_KEY 환경변수가 설정되지 않았습니다.')
  }

  const prompt = `
당신은 고려인 학습자의 한국어 표현을 평가하는 교사입니다.
아래 상황에서 학습자가 한 말이 적절한지 판단하고, 한국어로 짧게(1~2문장) 피드백해 주세요.

상황: ${context.scenarioTitle} — ${context.characterRole}(${context.characterName})과의 대화
AI 발화: "${context.aiText}"
정답 표현 예시: ${context.targetExpressions.join(', ')}
학습자 발화: "${transcript}"

피드백 (적절한 표현이면 칭찬, 아니면 더 자연스러운 표현 제안):
`.trim()

  const url = `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
  }

  console.log('[LLM] 요청 →', { transcript, context })

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

    console.log(`[LLM] 응답 (${response.status}, ${latencyMs}ms) ←`, rawText)

    if (!response.ok) {
      throw new Error(`Gemini API request failed (${response.status}): ${rawText.slice(0, 300)}`)
    }

    const data = JSON.parse(rawText)
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    return text.trim()
  } finally {
    clearTimeout(timeout)
  }
}
