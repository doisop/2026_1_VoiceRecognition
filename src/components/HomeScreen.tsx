import { MapPin, ChevronRight, Mic } from 'lucide-react'
import type { Scenario } from '../types'
import { scenarios } from '../data/scenarios'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface Props {
  onSelect: (sc: Scenario) => void
}

const difficultyVariant: Record<string, 'emerald' | 'amber' | 'rose'> = {
  '초급': 'emerald',
  '중급': 'amber',
  '고급': 'rose',
}

const difficultyRu: Record<string, string> = {
  '초급': 'Начальный',
  '중급': 'Средний',
  '고급': 'Высший',
}

export default function HomeScreen({ onSelect }: Props) {
  return (
    <div className="min-h-screen bg-background">

      {/* ── Hero header ──────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-background to-background" />
        <div className="relative px-6 pt-12 pb-10 max-w-5xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Mic className="w-4 h-4 text-white" />
            </div>
            <span className="text-xs font-bold tracking-widest text-primary uppercase">
              알이랑 우리랑
            </span>
          </div>
          <h1 className="text-4xl font-extrabold text-foreground leading-tight">
            한국어 발음 연습
          </h1>
          <p className="text-muted-foreground mt-1 text-base">
            Тренировка произношения корейского языка
          </p>
          <p className="text-muted-foreground/70 text-sm mt-3 max-w-lg leading-relaxed">
            실생활 속 핵심 상황을 롤플레잉으로 연습하고,
            발음과 음조에 대한 시각적 피드백을 받아보세요.
          </p>
        </div>
      </div>

      {/* ── Scenario grid ────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
            상황 선택 · Выбор ситуации
          </h2>
          <span className="text-xs text-muted-foreground">{scenarios.length}개 시나리오</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {scenarios.map((sc) => (
            <ScenarioCard key={sc.id} scenario={sc} onSelect={onSelect} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ScenarioCard({
  scenario: sc,
  onSelect,
}: {
  scenario: Scenario
  onSelect: (sc: Scenario) => void
}) {
  return (
    <button
      onClick={() => onSelect(sc)}
      className="group text-left rounded-2xl overflow-hidden border border-border bg-card hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* Image area */}
      <div className="relative h-44 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
          style={{ backgroundImage: `url('${sc.image}')` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        {/* Difficulty badge */}
        <div className="absolute top-3 right-3">
          <Badge variant={difficultyVariant[sc.difficulty]} className="backdrop-blur-sm shadow text-xs">
            {sc.difficulty} · {difficultyRu[sc.difficulty]}
          </Badge>
        </div>

        {/* Title overlay */}
        <div className="absolute bottom-3 left-4">
          <p className="text-2xl font-extrabold text-white leading-none">{sc.title}</p>
          <p className="text-sm text-white/70 mt-0.5">{sc.titleSub}</p>
        </div>
      </div>

      {/* Card body */}
      <div className="p-4">
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          {sc.description}
        </p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3" />
            <span>{sc.character.name}</span>
            <span className="text-border">·</span>
            <span>{sc.steps.length}단계</span>
          </div>

          <Button variant="glass" size="sm" className="gap-1 pointer-events-none">
            시작
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </button>
  )
}
