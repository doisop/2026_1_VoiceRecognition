import { useState } from 'react'
import type { Screen, Scenario, FeedbackResult } from './types'
import HomeScreen from './components/HomeScreen'
import RoleplayScreen from './components/RoleplayScreen'
import FeedbackScreen from './components/FeedbackScreen'

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [feedback, setFeedback] = useState<FeedbackResult | null>(null)

  function handleSelectScenario(sc: Scenario) {
    setScenario(sc)
    setScreen('roleplay')
  }

  function handleFeedback(result: FeedbackResult) {
    setFeedback(result)
    setScreen('feedback')
  }

  function handleRetry() {
    setFeedback(null)
    setScreen('roleplay')
  }

  function handleHome() {
    setScenario(null)
    setFeedback(null)
    setScreen('home')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {screen === 'home' && (
        <HomeScreen onSelect={handleSelectScenario} />
      )}
      {screen === 'roleplay' && scenario && (
        <RoleplayScreen
          scenario={scenario}
          onFeedback={handleFeedback}
          onBack={handleHome}
        />
      )}
      {screen === 'feedback' && feedback && scenario && (
        <FeedbackScreen
          result={feedback}
          scenario={scenario}
          onRetry={handleRetry}
          onHome={handleHome}
        />
      )}
    </div>
  )
}
