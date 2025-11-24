import { SessionSummary } from '../types'
import './SessionSelector.css'

interface Props {
  sessions: SessionSummary[]
  onSelectSession: (id: string) => void
}

export default function SessionSelector({ sessions, onSelectSession }: Props) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'consensus': return 'var(--color-success)'
      case 'deadlock': return 'var(--color-danger)'
      case 'paused': return 'var(--color-warning)'
      default: return 'var(--color-text-secondary)'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'consensus': return '✅'
      case 'deadlock': return '🚨'
      case 'paused': return '⏸️'
      case 'active': return '🔄'
      default: return '📋'
    }
  }

  if (sessions.length === 0) {
    return (
      <div className="session-selector-empty">
        <div className="empty-state">
          <h2>Inga debatter ännu</h2>
          <p>Starta en debatt från MCP-servern för att se den här!</p>
        </div>
      </div>
    )
  }

  return (
    <div className="session-selector">
      <h2 className="selector-title">Välj en debatt att visa</h2>
      <div className="session-grid">
        {sessions.map((session) => (
          <div
            key={session.id}
            className="session-card"
            onClick={() => onSelectSession(session.id)}
          >
            <div className="session-header">
              <span
                className="session-status"
                style={{ color: getStatusColor(session.status) }}
              >
                {getStatusIcon(session.status)} {session.status}
              </span>
              <span className="session-consensus">
                {(session.consensus * 100).toFixed(0)}% konsensus
              </span>
            </div>

            <h3 className="session-question">{session.question}</h3>

            <div className="session-meta">
              <span>🔄 {session.rounds} rundor</span>
              <span>💰 ${session.cost.toFixed(4)}</span>
              <span>📅 {new Date(session.created_at).toLocaleDateString('sv-SE')}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
