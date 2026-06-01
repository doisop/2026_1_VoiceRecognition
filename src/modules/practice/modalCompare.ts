/**
 * voice_compare Modal API 클라이언트.
 *
 * 정답 wav + 사용자 wav + 발화 텍스트를 보내면 5개 분석기(formants, mfcc_dtw,
 * pitch, energy, vot) 점수 + 음절별 진단 + alignment를 JSON으로 받는다.
 *
 * 응답을 UI 3카테고리(발음하는 방법 / 음의 높낮이 / 말의 속도)로 집계하고
 * 0~1 점수를 100점 만점으로 환산한다.
 */

import type { PronunciationPracticeResult } from '../../types'

const MODAL_COMPARE_ENDPOINT =
  ((import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.VITE_MODAL_COMPARE_URL) ??
  'https://kang-minseokk--voice-compare-fastapi-app.modal.run'

const REQUEST_TIMEOUT_MS = 180_000 // 콜드스타트 대비 (모델 로딩 ~30s)

interface PerSyllable {
  char: string
  score: number
  details: Record<string, unknown>
}

interface AnalyzerBlock {
  score: number
  details: Record<string, unknown>
  per_syllable: PerSyllable[]
}

interface AlignmentSpan {
  char: string
  start_frame: number
  end_frame: number
  start_sec: number
  end_sec: number
}

interface UserFeedback {
  summary?: string
  diagnosis?: string[]
  coaching?: string[]
  targeted_tips?: string[]
}

interface CompareResponse {
  overall_score: number
  analyzers: {
    formants: AnalyzerBlock
    mfcc_dtw: AnalyzerBlock
    pitch: AnalyzerBlock
    energy: AnalyzerBlock
    vot: AnalyzerBlock
    coda?: AnalyzerBlock        // 받침 분석기 (서버 신버전)
  }
  alignment: {
    gt: AlignmentSpan[]
    sample: AlignmentSpan[]
  }
  feedback?: UserFeedback
  input_text?: string
}

const REF_CACHE = new Map<string, Blob>()

async function loadReferenceBlob(scenarioId: string, stepId: number): Promise<Blob | null> {
  const key = `${scenarioId}_${stepId}`
  const cached = REF_CACHE.get(key)
  if (cached) return cached

  const path = `/audio/practice/${key}_ref.wav`
  try {
    const res = await fetch(path)
    if (!res.ok) {
      console.warn(`[ModalCompare] 정답 오디오 없음: ${path}`)
      return null
    }
    const blob = await res.blob()
    REF_CACHE.set(key, blob)
    return blob
  } catch (err) {
    console.warn('[ModalCompare] 정답 오디오 로드 실패:', err)
    return null
  }
}

async function postCompare(
  refBlob: Blob,
  userBlob: Blob,
  text: string,
): Promise<CompareResponse> {
  const form = new FormData()
  form.append('gt_audio', refBlob, 'ref.wav')
  form.append('sample_audio', userBlob, 'user.webm')
  form.append('text', text)

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${MODAL_COMPARE_ENDPOINT}/compare`, {
      method: 'POST',
      body: form,
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`Modal compare HTTP ${res.status}: ${detail.slice(0, 200)}`)
    }
    return (await res.json()) as CompareResponse
  } finally {
    clearTimeout(timer)
  }
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

function toPercent(score: number): number {
  return Math.round(clamp01(score) * 100)
}

/** alignment span 총 길이(첫 음절 시작 ~ 마지막 음절 끝). */
function totalDurationSec(spans: AlignmentSpan[]): number {
  if (spans.length === 0) return 0
  const start = spans[0].start_sec
  const end = spans[spans.length - 1].end_sec
  return Math.max(0, end - start)
}

/** alignment 기반 속도 비율 계산: sample / gt (1.0 = 동일 속도). */
function computeSpeedRatio(resp: CompareResponse): number {
  const gtDur = totalDurationSec(resp.alignment.gt)
  const smDur = totalDurationSec(resp.alignment.sample)
  if (gtDur <= 0 || smDur <= 0) return 1.0
  return smDur / gtDur
}

/** 속도 비율 → 100점 환산. 1.0에서 멀어질수록 감점. */
function speedRatioToScore(ratio: number): number {
  // |log2(ratio)|: 같으면 0, 2배/절반이면 1
  const deviation = Math.abs(Math.log2(ratio))
  // 0.2 (~15% off) 까지는 거의 만점, 0.7 (~60% off) 에서 0점
  return toPercent(1 - Math.max(0, (deviation - 0.05) / 0.65))
}

/** 발음 방법 카테고리 — 분석기 가중 평균 (coda 있으면 포함). */
function aggregatePronunciationScore(resp: CompareResponse): number {
  const a = resp.analyzers
  // formants(모음 품질) + mfcc_dtw(전반 스펙트럼) 위주, vot/energy/coda는 보조
  const hasCoda = a.coda != null
  if (hasCoda) {
    return toPercent(
      a.formants.score * 0.30 +
        a.mfcc_dtw.score * 0.30 +
        a.vot.score * 0.13 +
        a.energy.score * 0.12 +
        (a.coda?.score ?? 0) * 0.15,
    )
  }
  return toPercent(
    a.formants.score * 0.35 +
      a.mfcc_dtw.score * 0.35 +
      a.vot.score * 0.15 +
      a.energy.score * 0.15,
  )
}

/** per_syllable 중 점수 가장 낮은 N개 char 추출. */
function worstSyllables(items: PerSyllable[], n: number, threshold: number): string[] {
  return [...items]
    .filter((s) => s.score < threshold)
    .sort((a, b) => a.score - b.score)
    .slice(0, n)
    .map((s) => s.char)
}

function buildPronunciationFeedback(resp: CompareResponse): string {
  const a = resp.analyzers
  const score = aggregatePronunciationScore(resp)

  // 가장 약한 분석기 식별 → 그쪽 음절별 worst syllable 골라내기
  const subs: Array<{ name: string; label: string; tip: string; block: AnalyzerBlock }> = [
    {
      name: 'formants',
      label: '모음',
      tip: '입 모양을 더 분명히 해서 모음을 또렷하게',
      block: a.formants,
    },
    {
      name: 'mfcc_dtw',
      label: '전반 발음',
      tip: '정답 음성을 천천히 들어보고 그대로 따라',
      block: a.mfcc_dtw,
    },
    {
      name: 'vot',
      label: '자음(된소리/거센소리)',
      tip: 'ㄲ, ㅃ, ㅉ 같은 된소리는 더 강하게, ㅋ, ㅍ, ㅊ 같은 거센소리는 숨을 더 내며',
      block: a.vot,
    },
    {
      name: 'energy',
      label: '강세',
      tip: '문장 안에서 힘주는 부분을 정답과 맞춰서',
      block: a.energy,
    },
  ]

  const weakest = subs.reduce((m, s) => (s.block.score < m.block.score ? s : m), subs[0])

  if (score >= 85) return '발음이 매우 자연스럽습니다. 잘하고 있어요!'

  const bad = worstSyllables(weakest.block.per_syllable, 3, 0.5)
  const focusPhrase =
    bad.length > 0
      ? `특히 '${bad.join("', '")}' 음절에서 ${weakest.label} 부분을 신경 써보세요.`
      : `${weakest.label} 부분에 더 신경 써보세요.`

  if (score >= 65) {
    return `발음이 대체로 자연스럽습니다. ${focusPhrase} ${weakest.tip} 발음해보세요.`
  }
  return `발음을 조금 더 다듬어야 합니다. ${focusPhrase} ${weakest.tip} 연습해보세요.`
}

function buildPitchFeedback(resp: CompareResponse): string {
  const pitch = resp.analyzers.pitch
  const score = toPercent(pitch.score)
  const d = pitch.details as {
    gt_median_hz?: number | null
    sample_median_hz?: number | null
    gt_tail_slope_st_per_sec?: number | null
    sample_tail_slope_st_per_sec?: number | null
  }

  if (score >= 85) return '음의 높낮이가 정답과 잘 맞습니다!'

  const gtSlope = d.gt_tail_slope_st_per_sec
  const smSlope = d.sample_tail_slope_st_per_sec
  // 문장 끝 억양(상승/하강) 차이 진단
  if (gtSlope != null && smSlope != null) {
    const diff = smSlope - gtSlope
    if (Math.abs(diff) > 4) {
      if (gtSlope < -2 && smSlope > gtSlope + 4) {
        return '문장 끝을 더 내리며 말해보세요. 정답에 비해 끝을 너무 올리고 있어요.'
      }
      if (gtSlope > 2 && smSlope < gtSlope - 4) {
        return '문장 끝을 더 올리며 말해보세요. 정답에 비해 끝을 너무 내리고 있어요.'
      }
    }
  }

  // 전반 톤 차이
  const gtMed = d.gt_median_hz
  const smMed = d.sample_median_hz
  if (gtMed && smMed) {
    const ratio = smMed / gtMed
    if (ratio > 1.15) return '전반적으로 너무 높게 말하고 있어요. 정답과 비슷한 톤으로 낮춰보세요.'
    if (ratio < 0.87) return '전반적으로 너무 낮게 말하고 있어요. 정답과 비슷한 톤으로 올려보세요.'
  }

  if (score >= 65) return '음의 높낮이가 대체로 자연스럽습니다. 정답 음성의 억양을 한 번 더 들어보세요.'
  return '음의 높낮이가 정답과 차이가 있습니다. 정답 음성을 따라 억양을 모방해보세요.'
}

function buildSpeedFeedback(speedRatio: number, score: number): string {
  if (score >= 85) return '말의 속도가 자연스럽습니다!'
  if (speedRatio > 1.3) return '말의 속도가 너무 빠릅니다. 더 천천히 또박또박 말해보세요.'
  if (speedRatio > 1.15) return '말의 속도가 조금 빠릅니다. 정답 음성을 참고해 천천히 말해보세요.'
  if (speedRatio < 0.7) return '말의 속도가 너무 느립니다. 조금 더 자연스럽게 빠르게 말해보세요.'
  if (speedRatio < 0.85) return '말의 속도가 조금 느립니다. 정답 음성처럼 더 자연스럽게 말해보세요.'
  return '말의 속도가 정답과 비슷합니다.'
}

// ── 러시아어 피드백 ────────────────────────────────────────────────────────────

function buildPronunciationFeedbackRu(resp: CompareResponse): string {
  const a = resp.analyzers
  const score = aggregatePronunciationScore(resp)

  const subs: Array<{ label: string; tip: string; block: AnalyzerBlock }> = [
    {
      label: 'гласных звуков',
      tip: 'Произносите гласные чётче, придавая губам более выраженную форму.',
      block: a.formants,
    },
    {
      label: 'общего произношения',
      tip: 'Прослушайте образец медленно и повторите в точности.',
      block: a.mfcc_dtw,
    },
    {
      label: 'согласных (твёрдых/придыхательных)',
      tip: 'Твёрдые (ㄲ, ㅃ, ㅉ) произносите с напором, придыхательные (ㅋ, ㅍ, ㅊ) — с выдохом.',
      block: a.vot,
    },
    {
      label: 'ударения',
      tip: 'Согласуйте силу ударения в предложении с образцом.',
      block: a.energy,
    },
  ]

  const weakest = subs.reduce((m, s) => (s.block.score < m.block.score ? s : m), subs[0])

  if (score >= 85) return 'Произношение звучит очень естественно. Отлично!'

  const bad = worstSyllables(weakest.block.per_syllable, 3, 0.5)
  const focusPhrase =
    bad.length > 0
      ? `Обратите особое внимание на ${weakest.label} в слогах '${bad.join("', '")}'.`
      : `Уделите больше внимания ${weakest.label}.`

  if (score >= 65) return `Произношение в целом естественное. ${focusPhrase} ${weakest.tip}`
  return `Произношению нужна дополнительная работа. ${focusPhrase} ${weakest.tip}`
}

function buildPitchFeedbackRu(resp: CompareResponse): string {
  const pitch = resp.analyzers.pitch
  const score = toPercent(pitch.score)
  const d = pitch.details as {
    gt_median_hz?: number | null
    sample_median_hz?: number | null
    gt_tail_slope_st_per_sec?: number | null
    sample_tail_slope_st_per_sec?: number | null
  }

  if (score >= 85) return 'Высота тона хорошо совпадает с образцом!'

  const gtSlope = d.gt_tail_slope_st_per_sec
  const smSlope = d.sample_tail_slope_st_per_sec
  if (gtSlope != null && smSlope != null && Math.abs(smSlope - gtSlope) > 4) {
    if (gtSlope < -2 && smSlope > gtSlope + 4)
      return 'Попробуйте понижать голос в конце предложения — по сравнению с образцом вы поднимаете его слишком высоко.'
    if (gtSlope > 2 && smSlope < gtSlope - 4)
      return 'Попробуйте повышать голос в конце предложения — по сравнению с образцом вы опускаете его слишком низко.'
  }

  const gtMed = d.gt_median_hz
  const smMed = d.sample_median_hz
  if (gtMed && smMed) {
    const ratio = smMed / gtMed
    if (ratio > 1.15) return 'В целом вы говорите слишком высоко. Попробуйте понизить тон, чтобы он был похож на образец.'
    if (ratio < 0.87) return 'В целом вы говорите слишком низко. Попробуйте повысить тон, чтобы он был похож на образец.'
  }

  if (score >= 65) return 'Высота тона в целом естественная. Ещё раз прослушайте интонацию образца.'
  return 'Высота тона заметно отличается от образца. Попробуйте подражать интонации образца.'
}

function buildSpeedFeedbackRu(speedRatio: number, score: number): string {
  if (score >= 85) return 'Темп речи естественный!'
  if (speedRatio > 1.3) return 'Вы говорите слишком быстро. Произносите слова медленнее и чётче.'
  if (speedRatio > 1.15) return 'Вы говорите немного быстро. Ориентируйтесь на образец и говорите медленнее.'
  if (speedRatio < 0.7) return 'Вы говорите слишком медленно. Постарайтесь говорить немного быстрее и естественнее.'
  if (speedRatio < 0.85) return 'Вы говорите немного медленно. Постарайтесь говорить так же естественно, как в образце.'
  return 'Ваш темп речи близок к образцу.'
}

/** 6개 분석기 per_syllable 중 최하점이 threshold 미만이면 교정 필요 음절로 분류한다. */
function computeBadChars(resp: CompareResponse, threshold = 0.20): string[] {
  const a = resp.analyzers
  const blocks = [a.formants, a.mfcc_dtw, a.pitch, a.energy, a.vot, a.coda].filter(
    (b): b is AnalyzerBlock => b != null && b.per_syllable.length > 0,
  )
  if (blocks.length === 0) return []

  const numSyllables = blocks[0].per_syllable.length
  const bad: string[] = []

  for (let i = 0; i < numSyllables; i++) {
    const scores = blocks
      .filter((b) => b.per_syllable[i] !== undefined)
      .map((b) => b.per_syllable[i].score)
    if (scores.length === 0) continue
    const min = Math.min(...scores)
    if (min < threshold) bad.push(blocks[0].per_syllable[i].char)
  }
  return bad
}

/** 종합점수 — 발음(50%) + 음높이(30%) + 속도(20%). */
function aggregateOverall(pron: number, pitch: number, speed: number): number {
  return Math.round(pron * 0.5 + pitch * 0.3 + speed * 0.2)
}

function buildResultFromResponse(resp: CompareResponse): PronunciationPracticeResult {
  const pronScore = aggregatePronunciationScore(resp)
  const pitchScore = toPercent(resp.analyzers.pitch.score)
  const speedRatio = computeSpeedRatio(resp)
  const speedScore = speedRatioToScore(speedRatio)

  return {
    overall_score: aggregateOverall(pronScore, pitchScore, speedScore),
    pronunciation_feedback: buildPronunciationFeedback(resp),
    pitch_feedback: buildPitchFeedback(resp),
    speed_feedback: buildSpeedFeedback(speedRatio, speedScore),
    feedback_ru: {
      pronunciation: buildPronunciationFeedbackRu(resp),
      pitch: buildPitchFeedbackRu(resp),
      speed: buildSpeedFeedbackRu(speedRatio, speedScore),
    },
    bad_chars: computeBadChars(resp),
    targeted_tips: resp.feedback?.targeted_tips ?? [],
    source_text: resp.input_text ?? '',
    _scores: {
      pronunciation: pronScore,
      pitch: pitchScore,
      speed: speedScore,
    },
    _raw: {
      dtwDistance: Number(
        (resp.analyzers.mfcc_dtw.details as { dtw_distance?: number }).dtw_distance ?? 0,
      ),
      pitchDivergentRatio: 1 - clamp01(resp.analyzers.pitch.score),
      speedRatio,
    },
  }
}

function buildNoReferenceFallback(): PronunciationPracticeResult {
  return {
    overall_score: 0,
    pronunciation_feedback: '정답 음성을 찾을 수 없어 비교 분석을 건너뜁니다.',
    pitch_feedback: '정답 음성이 없어 음조 비교가 불가능합니다.',
    speed_feedback: '정답 음성이 없어 속도 비교가 불가능합니다.',
    _scores: { pronunciation: 0, pitch: 0, speed: 0 },
    _raw: { dtwDistance: 0, pitchDivergentRatio: 0, speedRatio: 1 },
  }
}

function buildErrorFallback(err: unknown): PronunciationPracticeResult {
  const msg = err instanceof Error ? err.message : String(err)
  return {
    overall_score: 0,
    pronunciation_feedback: `분석 서버 호출에 실패했어요 (${msg.slice(0, 80)}). 다시 시도해주세요.`,
    pitch_feedback: '분석을 완료하지 못했습니다.',
    speed_feedback: '분석을 완료하지 못했습니다.',
    _scores: { pronunciation: 0, pitch: 0, speed: 0 },
    _raw: { dtwDistance: 0, pitchDivergentRatio: 1, speedRatio: 1 },
  }
}

/** Modal voice_compare 서버 콜드 스타트 방지용 워밍업 — 앱 로드 시 백그라운드에서 호출 */
export async function warmUpCompare(): Promise<void> {
  const startedAt = performance.now()
  console.log('[ModalCompare] 서버 워밍업 시작 (콜드 스타트 방지)...')
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 30_000)
    const res = await fetch(`${MODAL_COMPARE_ENDPOINT}/health`, { signal: ctrl.signal })
    clearTimeout(timer)
    const ms = Math.round(performance.now() - startedAt)
    if (res.ok) {
      console.log(`[ModalCompare] 서버 워밍업 완료 (${ms}ms). 이후 요청은 빠르게 처리됩니다.`)
    }
  } catch {
    console.log('[ModalCompare] 서버 워밍업 완료 (오류 무시 — 서버가 깨어남).')
  }
}

/**
 * 사용자 녹음 + 시나리오 ref 오디오 + 발화 텍스트를 Modal에 보내고
 * UI가 바로 표시할 수 있는 PronunciationPracticeResult로 변환한다.
 */
export async function compareViaModal(
  userBlob: Blob,
  scenarioId: string,
  stepId: number,
  modelText: string,
): Promise<PronunciationPracticeResult> {
  const refBlob = await loadReferenceBlob(scenarioId, stepId)
  if (!refBlob) return buildNoReferenceFallback()

  const startedAt = performance.now()
  try {
    const resp = await postCompare(refBlob, userBlob, modelText)
    const latencyMs = Math.round(performance.now() - startedAt)
    const result = buildResultFromResponse(resp)
    console.log(
      `[ModalCompare] 완료 (${latencyMs}ms) — 종합:${result.overall_score} ` +
        `발음:${result._scores?.pronunciation} 음조:${result._scores?.pitch} 속도:${result._scores?.speed}`,
    )
    return result
  } catch (err) {
    console.error('[ModalCompare] 호출 실패:', err)
    return buildErrorFallback(err)
  }
}
