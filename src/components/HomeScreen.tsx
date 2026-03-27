import type { Scenario } from '../types'
import { scenarios } from '../data/scenarios'

interface Props {
  onSelect: (sc: Scenario) => void
}

const difficultyLabel: Record<string, { ko: string; ru: string; color: string }> = {
  '초급': { ko: '초급', ru: 'Начальный', color: 'bg-emerald-500/90' },
  '중급': { ko: '중급', ru: 'Средний',   color: 'bg-amber-500/90'   },
  '고급': { ko: '고급', ru: 'Высший',    color: 'bg-rose-500/90'    },
}

export default function HomeScreen({ onSelect }: Props) {
  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="px-5 pt-12 pb-6">
        <p className="text-xs font-semibold tracking-widest text-indigo-400 uppercase mb-2">
          알이랑 우리랑
        </p>
        <h1 className="text-3xl font-extrabold leading-tight text-white">
          한국어 발음 연습
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Тренировка произношения корейского языка
        </p>
        <p className="text-slate-500 text-xs mt-3 leading-relaxed">
          실생활 상황을 직접 연습하며 자연스러운 한국어를 익혀보세요.
        </p>
      </div>

      {/* ── Section label ──────────────────────────────────── */}
      <div className="px-5 mb-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
          상황 선택 · Выбор ситуации
        </p>
      </div>

      {/* ── Scenario cards ─────────────────────────────────── */}
      <div className="px-5 pb-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {scenarios.map((sc) => (
          <ScenarioCard key={sc.id} scenario={sc} onSelect={onSelect} />
        ))}
      </div>
    </div>
  )
}

function ScenarioCard({ scenario: sc, onSelect }: { scenario: Scenario; onSelect: (sc: Scenario) => void }) {
  const diff = difficultyLabel[sc.difficulty]

  return (
    <button
      onClick={() => onSelect(sc)}
      className="group w-full text-left rounded-3xl overflow-hidden relative focus:outline-none"
      style={{ height: 200 }}
    >
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
        style={{ backgroundImage: `url('${sc.image}')` }}
      />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10" />

      {/* Difficulty badge */}
      <div className="absolute top-4 right-4">
        <span className={`text-xs font-bold text-white px-2.5 py-1 rounded-full backdrop-blur-sm ${diff.color}`}>
          {diff.ko} · {diff.ru}
        </span>
      </div>

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 p-5">
        {/* Title */}
        <div className="flex items-baseline gap-2 mb-1">
          <h2 className="text-2xl font-extrabold text-white leading-none">{sc.title}</h2>
          <span className="text-base font-medium text-white/70">{sc.titleSub}</span>
        </div>

        {/* Description */}
        <p className="text-sm text-white/80 leading-snug mb-3">{sc.description}</p>

        {/* Footer row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            <span className="text-xs text-white/60">{sc.character.name}</span>
            <span className="text-white/30 text-xs">·</span>
            <span className="text-xs text-white/60">{sc.steps.length}단계</span>
          </div>

          {/* Arrow button */}
          <div className="flex items-center gap-1 bg-white/20 backdrop-blur-sm group-hover:bg-indigo-500 transition-colors rounded-full px-3 py-1">
            <span className="text-xs font-semibold text-white">시작</span>
            <span className="text-white text-xs">→</span>
          </div>
        </div>
      </div>
    </button>
  )
}
