/**
 * targeted_tips 한 줄을 받아 교정 대상 음절을 빨간색으로 강조해서 렌더링한다.
 *
 * 서버는 이런 문장을 보낸다:
 *   "'자꾸 배가 아프고 속이 쓰려요'에서 '이' 발음이 기준과 다릅니다. ..."
 *
 * view_feedback.py의 _highlight_tip_sentence/_pick_target_from_tip 로직을 그대로 옮긴 것:
 *   1) 따옴표로 감싼 부분을 모두 찾는다.
 *   2) 첫 번째 길이가 긴(한글 4자 이상) 따옴표 안 내용 = 원문 문장 → target 음절을 그 안에서 빨갛게.
 *   3) 짧은 따옴표(한글 1~3자) = target 음절 자체.
 *   4) 그 외 부분은 평문 그대로.
 */

const QUOTED_RE = /(['"‘’“”])([^'"‘’“”]+)(['"‘’“”])/g
const HANGUL_CHAR_RE = /[가-힣]/g

function hangulCount(s: string): number {
  return (s.match(HANGUL_CHAR_RE) || []).length
}

interface Match {
  start: number
  end: number
  open: string
  inner: string
  close: string
}

function findQuotedSpans(tip: string): Match[] {
  const out: Match[] = []
  // 정규식 상태 초기화 (전역 플래그라 별도 인스턴스 사용)
  const re = new RegExp(QUOTED_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(tip)) !== null) {
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      open: m[1],
      inner: m[2],
      close: m[3],
    })
  }
  return out
}

/** 두 번째 이후의 짧은 따옴표(한글 1~3자) 안에서 target 음절을 찾는다. */
function pickTarget(matches: Match[]): string | null {
  if (matches.length < 2) return null
  for (const m of matches.slice(1)) {
    const chars = m.inner.match(HANGUL_CHAR_RE) || []
    const first = chars[0]
    if (first && chars.length <= 3) return first
  }
  return null
}

interface Props {
  tip: string
  className?: string
}

export default function HighlightedTip({ tip, className }: Props) {
  const matches = findQuotedSpans(tip)
  if (matches.length === 0) {
    return <span className={className}>{tip}</span>
  }

  const target = pickTarget(matches)
  const nodes: React.ReactNode[] = []
  let lastEnd = 0
  let sentenceHighlighted = false
  let key = 0

  for (const m of matches) {
    // 인용 사이의 평문
    if (m.start > lastEnd) {
      nodes.push(<span key={key++}>{tip.slice(lastEnd, m.start)}</span>)
    }

    if (!sentenceHighlighted && hangulCount(m.inner) >= 4) {
      // 원문 문장 — target 음절만 빨갛게
      nodes.push(<span key={key++}>{m.open}</span>)
      for (let i = 0; i < m.inner.length; i++) {
        const ch = m.inner[i]
        if (target && ch === target) {
          nodes.push(
            <span
              key={key++}
              className="text-rose-400 font-bold underline decoration-rose-400 decoration-2 underline-offset-2"
            >
              {ch}
            </span>,
          )
        } else {
          nodes.push(<span key={key++}>{ch}</span>)
        }
      }
      nodes.push(<span key={key++}>{m.close}</span>)
      sentenceHighlighted = true
    } else {
      // 짧은 따옴표 (target 음절 자체 등) — 그대로 평문
      nodes.push(<span key={key++}>{m.open + m.inner + m.close}</span>)
    }

    lastEnd = m.end
  }

  if (lastEnd < tip.length) {
    nodes.push(<span key={key++}>{tip.slice(lastEnd)}</span>)
  }

  return <span className={className}>{nodes}</span>
}
