import { useState, useEffect } from 'react'
import SessionSelector from './components/SessionSelector'
import DebateView from './components/DebateView'
import { DebateSession, SessionSummary } from './types'
import './App.css'

function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [selectedSession, setSelectedSession] = useState<DebateSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadSessions()
  }, [])

  const loadSessions = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/sessions')
      if (!response.ok) throw new Error('Failed to load sessions')
      const data = await response.json()
      setSessions(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const loadSession = async (id: string) => {
    try {
      const response = await fetch(`/api/sessions/${id}`)
      if (!response.ok) throw new Error('Failed to load session')
      const data = await response.json()
      setSelectedSession(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="container">
          <h1>🤖 DebateAI</h1>
          <p>Live AI Panel Debate Visualizer</p>
        </div>
      </header>

      <main className="app-main">
        <div className="container">
          {loading && <div className="loading">Loading sessions...</div>}
          {error && <div className="error">{error}</div>}

          {!loading && !error && !selectedSession && (
            <SessionSelector
              sessions={sessions}
              onSelectSession={loadSession}
            />
          )}

          {selectedSession && (
            <>
              <button
                className="back-button"
                onClick={() => setSelectedSession(null)}
              >
                ← Back to sessions
              </button>
              <DebateView session={selectedSession} />
            </>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
