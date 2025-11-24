import { DebateSession } from '../types'
import ConsensusChart from './ConsensusChart'
import RoundView from './RoundView'
import './DebateView.css'

interface Props {
  session: DebateSession
}

export default function DebateView({ session }: Props) {
  const lastRound = session.rounds[session.rounds.length - 1]
  const finalConsensus = lastRound ? lastRound.consensus_score * 100 : 0

  const getStatusColor = () => {
    if (session.status === 'consensus') return 'var(--color-success)'
    if (session.status === 'deadlock') return 'var(--color-danger)'
    if (session.status === 'paused') return 'var(--color-warning)'
    return 'var(--color-primary)'
  }

  const getStatusText = () => {
    const statusMap: Record<string, string> = {
      'consensus': '✅ Konsensus uppnådd',
      'deadlock': '🚨 Oenighet',
      'paused': '⏸️ Pausad',
      'active': '🔄 Pågående',
      'user_accepted': '👤 Användaren accepterade',
      'manually_resolved': '🤝 Manuellt löst',
      'failed': '❌ Misslyckades'
    }
    return statusMap[session.status] || session.status
  }

  return (
    <div className="debate-view">
      {/* Header */}
      <div className="debate-header">
        <div className="debate-title-section">
          <h2 className="debate-question">{session.question}</h2>
          {session.context && (
            <p className="debate-context">{session.context}</p>
          )}
        </div>

        <div className="debate-status-bar">
          <div
            className="status-badge"
            style={{ borderColor: getStatusColor(), color: getStatusColor() }}
          >
            {getStatusText()}
          </div>
          <div className="consensus-badge">
            Konsensus: {finalConsensus.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="debate-meta">
        <div className="meta-card">
          <div className="meta-label">Rundor</div>
          <div className="meta-value">{session.rounds.length} / {session.max_rounds}</div>
        </div>
        <div className="meta-card">
          <div className="meta-label">Total kostnad</div>
          <div className="meta-value">${session.current_cost_usd.toFixed(4)}</div>
        </div>
        <div className="meta-card">
          <div className="meta-label">Budget</div>
          <div className="meta-value">${session.max_cost_usd.toFixed(2)}</div>
        </div>
        <div className="meta-card">
          <div className="meta-label">Strategi</div>
          <div className="meta-value">{session.strategy}</div>
        </div>
        <div className="meta-card">
          <div className="meta-label">Startad</div>
          <div className="meta-value">
            {new Date(session.created_at).toLocaleString('sv-SE', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </div>
        </div>
      </div>

      {/* Consensus Chart */}
      {session.rounds.length > 0 && (
        <ConsensusChart rounds={session.rounds} />
      )}

      {/* Rounds */}
      <div className="rounds-container">
        <h3 className="rounds-title">Debattens förlopp</h3>
        {session.rounds.map((round, index) => (
          <RoundView
            key={round.round_number}
            round={round}
            roundIndex={index}
            totalRounds={session.rounds.length}
            previousRound={index > 0 ? session.rounds[index - 1] : undefined}
          />
        ))}
      </div>
    </div>
  )
}
