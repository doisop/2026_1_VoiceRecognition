import type { Scenario } from '../types'
import { scenarios } from '../data/scenarios'

interface Props {
  onSelect: (sc: Scenario) => void
}

const difficultyColor: Record<string, string> = {
  '초급': 'bg-green-100 text-green-700',
  '중급': 'bg-yellow-100 text-yellow-700',
  '고급': 'bg-red-100 text-red-700',
}

export default function HomeScreen({ onSelect }: Props) {
  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">알이랑 우리랑</h1>
        <p className="text-sm text-gray-500 mt-1">한국어 발음 롤플레잉 연습</p>
      </div>

      <div className="space-y-3">
        {scenarios.map((sc) => (
          <button
            key={sc.id}
            onClick={() => onSelect(sc)}
            className="w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-xl bg-cover bg-center flex-shrink-0 bg-gray-200"
                style={{ backgroundImage: `url('${sc.image}')` }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-gray-900">{sc.title}</span>
                  <span className="text-xs text-gray-400">{sc.titleSub}</span>
                  <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${difficultyColor[sc.difficulty]}`}>
                    {sc.difficulty}
                  </span>
                </div>
                <p className="text-sm text-gray-500 truncate">{sc.description}</p>
                <p className="text-xs text-gray-400 mt-1">{sc.steps.length}단계</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
