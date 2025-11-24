import { useState, useEffect } from 'react'
import SessionSelector from './components/SessionSelector'
import DebateView from './components/DebateView'
import CompareView from './components/CompareView'
import { DebateSession, SessionSummary } from './types'
import './App.css'

type Theme = 'dark' | 'light'
type ViewMode = 'list' | 'detail' | 'compare'

function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [selectedSession, setSelectedSession] = useState<DebateSession | null>(null)
  const [compareSessions, setCompareSessions] = useState<DebateSession[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('list')
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
      setViewMode('detail')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const handleCompare = async (ids: string[]) => {
    try {
      setLoading(true)
      const sessionPromises = ids.map(id =>
        fetch(`/api/sessions/${id}`).then(res => res.json())
      )
      const loadedSessions = await Promise.all(sessionPromises)
      setCompareSessions(loadedSessions)
      setViewMode('compare')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    setSelectedSession(null)
    setCompareSessions([])
    setViewMode('list')
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

          {!loading && !error && viewMode === 'list' && (
            <SessionSelector
              sessions={sessions}
              onSelectSession={loadSession}
              onCompare={handleCompare}
            />
          )}

          {viewMode === 'detail' && selectedSession && (
            <>
              <button
                className="back-button"
                onClick={handleBack}
              >
                ← Back to sessions
              </button>
              <DebateView session={selectedSession} />
            </>
          )}

          {viewMode === 'compare' && compareSessions.length > 0 && (
            <CompareView
              sessions={compareSessions}
              onClose={handleBack}
            />
          )}
        </div>
      </main>
    </div>
  )
}

export default App
