import { useState, useEffect } from 'react'
import SessionSelector from './components/SessionSelector'
import DebateView from './components/DebateView'
import { DebateSession, SessionSummary } from './types'
import './App.css'

type Theme = 'dark' | 'light'

function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [selectedSession, setSelectedSession] = useState<DebateSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [theme, setTheme] = useState<Theme>(() => {
    // Check localStorage or system preference
    const saved = localStorage.getItem('theme') as Theme | null
    if (saved) return saved
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }

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
          <div className="header-content">
            <h1>DebateAI</h1>
            <p>Live AI Panel Debate Visualizer</p>
          </div>
          <button className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? '☀️' : '🌙'}
            <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
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
