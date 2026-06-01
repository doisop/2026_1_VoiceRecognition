import type { Scenario } from '../types'
import { scenarios } from '../data/scenarios'

interface Props {
  onSelect: (sc: Scenario) => void
}

const difficultyRu: Record<string, string> = {
  '초급': 'Начальный',
  '중급': 'Средний',
  '고급': 'Высший',
}

const scenarioAccent: Record<string, string> = {
  hospital:   '#C73B28',
  bank:       '#1B34B8',
  government: '#1B6B4A',
}

const serifFont = { fontFamily: "'Noto Serif KR', serif" }

export default function HomeScreen({ onSelect }: Props) {
  return (
    <div className="min-h-screen bg-background">

      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden px-6 pt-12 pb-10 max-w-5xl mx-auto">
        <div
          className="absolute right-0 top-0 select-none pointer-events-none leading-none"
          style={{ fontSize: '22rem', opacity: 0.03, ...serifFont }}
          aria-hidden
        >
          語
        </div>

        <div className="relative">
          <p
            className="text-xs font-bold tracking-[0.2em] uppercase mb-6"
            style={{ color: '#1B34B8' }}
          >
            알이랑 우리랑
          </p>
          <h1
            className="text-5xl sm:text-6xl font-bold text-foreground leading-tight"
            style={serifFont}
          >
            한국어
            <br />
            발음 연습
          </h1>
          <div className="w-12 h-0.5 my-5" style={{ backgroundColor: '#1B34B8' }} />
          <p className="text-base text-muted-foreground italic">
            Тренировка произношения корейского языка
          </p>
          <p className="text-sm mt-3 max-w-md leading-relaxed text-muted-foreground/75">
            실생활 속 핵심 상황을 롤플레잉으로 연습하고,
            발음과 음조에 대한 시각적 피드백을 받아보세요.
          </p>
        </div>
      </div>

      {/* ── Scenario grid ────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-6 pb-12">
        <p className="text-xs tracking-[0.18em] uppercase text-muted-foreground mb-5">
          상황 선택 · Выбор ситуации
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {scenarios.map((sc, i) => (
            <ScenarioCard key={sc.id} scenario={sc} index={i} onSelect={onSelect} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ScenarioCard({
  scenario: sc,
  index,
  onSelect,
}: {
  scenario: Scenario
  index: number
  onSelect: (sc: Scenario) => void
}) {
  const accent = scenarioAccent[sc.id] ?? '#C84B31'
  const num = String(index + 1).padStart(2, '0')

  return (
    <button
      onClick={() => onSelect(sc)}
      className="group text-left overflow-hidden border border-border bg-card transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ borderTopColor: accent, borderTopWidth: '4px' }}
    >
      {/* Top meta strip */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span
          className="text-2xl font-bold tabular-nums"
          style={{ color: accent, opacity: 0.55 }}
        >
          {num}
        </span>
        <span className="text-xs tracking-widest uppercase text-muted-foreground">
          {sc.difficulty} · {difficultyRu[sc.difficulty]}
        </span>
      </div>

      {/* Image */}
      <div className="h-40 overflow-hidden">
        <div
          className="w-full h-full bg-cover bg-center transition-transform duration-500 group-hover:scale-[1.04]"
          style={{ backgroundImage: `url('${sc.image}')` }}
        />
      </div>

      {/* Card body */}
      <div className="px-4 pt-4 pb-4">
        <p
          className="text-xl font-bold text-foreground leading-none"
          style={serifFont}
        >
          {sc.title}
        </p>
        <p className="text-sm text-muted-foreground mt-0.5">{sc.titleSub}</p>

        <p className="text-sm text-muted-foreground leading-relaxed mt-3">
          {sc.description}
        </p>

        <hr className="my-3 border-border" />

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {sc.character.name} · {sc.steps.length}단계
          </span>
          <span
            className="text-xs font-semibold transition-opacity duration-200 group-hover:opacity-100 opacity-70"
            style={{ color: accent }}
          >
            연습 시작 →
          </span>
        </div>
      </div>
    </button>
  )
}
