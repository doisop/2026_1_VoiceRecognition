/**
 * pronunciationAnalysis — STT 전사 결과 vs 목표 표현의 음절 단위 비교로 발음 오류를 감지한다.
 *
 * 원리: Whisper STT는 사용자가 실제로 발화한 소리를 전사하므로,
 * 목표 표현과의 음절 차이가 곧 발음 오류를 나타낸다.
 * 예) 목표 "머리가 아파요" → STT "메리가 아파요" → '머'→'메' = 모음(ㅓ→ㅔ) 오류
 */

export type ErrorType = 'vowel' | 'initial' | 'final' | 'final_missing'

export interface SyllableError {
  position: number    // 음절 인덱스 (공백 제거 기준)
  target: string      // 목표 음절
  actual: string      // 실제 발화 음절
  errorType: ErrorType
}

export interface PronunciationResult {
  hasError: boolean
  errorSyllables: SyllableError[]
  feedback: string      // 한국어 피드백 문자열
  closestTarget: string // 비교 기준으로 사용된 targetExpression
}

/** 한국어 음절을 초성/중성/종성 인덱스로 분해한다 (유니코드 수식 기반). */
function decomposeJamo(char: string): { initial: number; vowel: number; final: number } | null {
  const code = char.charCodeAt(0)
  if (code < 0xAC00 || code > 0xD7A3) return null
  const offset = code - 0xAC00
  return {
    final:   offset % 28,
    vowel:   Math.floor(offset / 28) % 21,
    initial: Math.floor(offset / (28 * 21)),
  }
}

/** 두 음절을 비교해 어느 자모(초성/중성/종성)에서 오류가 발생했는지 분류한다. */
function classifyError(target: string, actual: string): ErrorType {
  const t = decomposeJamo(target)
  const a = decomposeJamo(actual)
  if (!t || !a) return 'vowel'
  if (t.final !== 0 && a.final === 0) return 'final_missing'
  if (t.final !== a.final) return 'final'
  if (t.vowel !== a.vowel) return 'vowel'
  return 'initial'
}

/** 두 문자열 사이의 편집 거리(Levenshtein distance)를 계산한다. */
function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

/**
 * 고려인 한국어 학습자가 어려워하는 발음 포인트를 중점 분석하는 함수.
 *
 * 분석 항목:
 *   - 음의 높낮이 (pitch_score): 한국어 억양 패턴 일치도
 *   - 된소리 vs 평음 구분 (tense_consonant_score): ㄱ/ㄲ, ㅂ/ㅃ, ㅅ/ㅆ 등 구분 능력
 *   - 말 속도 (speed_score): 음절 발화 속도의 자연스러움
 *
 * TODO: 실제 분석 로직 구현 예정
 *   - 음향 특징 추출 (MFCC, ZCR, 에너지 등)
 *   - 모범 발화(TTS) 와 사용자 발화의 DTW 정렬
 *   - 된소리 감지: 초성 VOT(Voice Onset Time) 분석
 *   - 말 속도: 유성음 구간 길이 / 총 발화 길이
 */
export { analyzePronunciationPractice } from './practice/index'

/**
 * STT 전사 텍스트와 목표 표현들을 비교해 발음 오류를 분석한다.
 *
 * @param transcript       - Whisper STT 결과 텍스트
 * @param targetExpressions - 시나리오 스텝의 목표 표현 목록
 */
export function analyzePronunciation(
  transcript: string,
  targetExpressions: string[]
): PronunciationResult {
  const empty: PronunciationResult = {
    hasError: false,
    errorSyllables: [],
    feedback: '',
    closestTarget: '',
  }

  if (!transcript || targetExpressions.length === 0) return empty

  const normTranscript = normalize(transcript)

  // 1단계: 편집 거리가 가장 짧은 targetExpression 선택
  let closestTarget = targetExpressions[0]
  let minDist = levenshtein(normTranscript, normalize(targetExpressions[0]))
  for (const expr of targetExpressions.slice(1)) {
    const d = levenshtein(normTranscript, normalize(expr))
    if (d < minDist) {
      minDist = d
      closestTarget = expr
    }
  }

  // 편집 거리가 목표 길이의 80% 초과 → 표현 자체가 다름 (발음 오류 분석 불가)
  if (minDist > closestTarget.replace(/\s/g, '').length * 0.8) {
    return { ...empty, closestTarget }
  }

  // 2단계: 공백 제거 후 음절 단위 비교
  const targetClean = normalize(closestTarget).replace(/\s/g, '')
  const actualClean = normTranscript.replace(/\s/g, '')
  const minLen = Math.min(targetClean.length, actualClean.length)

  const errors: SyllableError[] = []
  for (let i = 0; i < minLen; i++) {
    if (targetClean[i] !== actualClean[i]) {
      // 한국어 음절인 경우에만 오류로 분류
      if (decomposeJamo(targetClean[i]) && decomposeJamo(actualClean[i])) {
        errors.push({
          position: i,
          target: targetClean[i],
          actual: actualClean[i],
          errorType: classifyError(targetClean[i], actualClean[i]),
        })
      }
    }
  }

  if (errors.length === 0) {
    return { hasError: false, errorSyllables: [], feedback: '', closestTarget }
  }

  // 3단계: 한국어 피드백 생성
  const errorTypeLabel: Record<ErrorType, string> = {
    vowel:         '모음 오류',
    initial:       '자음 오류',
    final:         '받침 오류',
    final_missing: '받침 탈락',
  }

  const descriptions = errors.slice(0, 3).map(
    (e) => `'${e.target}' → '${e.actual}' (${errorTypeLabel[e.errorType]})`
  )

  const feedback = `발음 확인: ${descriptions.join(', ')}. "${closestTarget}"을(를) 다시 말해보세요.`

  return { hasError: true, errorSyllables: errors, feedback, closestTarget }
}
