import { useState, useEffect } from 'react'
import type { Scenario, FeedbackResult } from './types'
import HomeScreen from './components/HomeScreen'
import RoleplayScreen from './components/RoleplayScreen'
import FeedbackScreen from './components/FeedbackScreen'
import { loadWhisper, warmUpSTT } from './modules/stt'
import { initVoices } from './modules/tts'

type Screen = 'home' | 'roleplay' | 'feedback'

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')

  useEffect(() => {
    loadWhisper().then(() => warmUpSTT())
    initVoices()
  }, [])
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
    <div className="min-h-screen bg-background">
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
