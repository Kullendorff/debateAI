import { DebateSession } from '../types'
import './CompareView.css'

interface Props {
  sessions: DebateSession[]
  onClose: () => void
}

export default function CompareView({ sessions, onClose }: Props) {
  if (sessions.length < 2) {
    return (
      <div className="compare-view">
        <div className="compare-header">
          <h2>Jämför debatter</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        <div className="compare-empty">
          <p>Välj minst 2 debatter att jämföra</p>
        </div>
      </div>
    )
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

  const getLastConsensus = (session: DebateSession) => {
    const lastRound = session.rounds[session.rounds.length - 1]
    return lastRound ? (lastRound.consensus_score * 100).toFixed(1) : '0'
  }

  const getAvgConfidence = (session: DebateSession) => {
    const lastRound = session.rounds[session.rounds.length - 1]
    if (!lastRound) return 0
    return (
      (lastRound.responses.openai.confidence +
        lastRound.responses.claude.confidence +
        lastRound.responses.gemini.confidence) / 3
    ).toFixed(1)
  }

  const getConsensusChange = (session: DebateSession) => {
    if (session.rounds.length < 2) return 0
    const first = session.rounds[0].consensus_score * 100
    const last = session.rounds[session.rounds.length - 1].consensus_score * 100
    return last - first
  }

  // Find best/worst for highlighting
  const consensusValues = sessions.map(s => parseFloat(getLastConsensus(s)))
  const maxConsensus = Math.max(...consensusValues)
  const minConsensus = Math.min(...consensusValues)

  const costValues = sessions.map(s => s.current_cost_usd)
  const minCost = Math.min(...costValues)
  const maxCost = Math.max(...costValues)

  return (
    <div className="compare-view">
      <div className="compare-header">
        <h2>Jämför {sessions.length} debatter</h2>
        <button className="close-button" onClick={onClose}>×</button>
      </div>

      <div className="compare-grid" style={{ gridTemplateColumns: `repeat(${sessions.length}, 1fr)` }}>
        {sessions.map((session, index) => (
          <div key={session.id} className="compare-column">
            <div className="compare-card">
              <div className="compare-card-header">
                <span className="compare-index">#{index + 1}</span>
                <span className="compare-status">
                  {getStatusIcon(session.status)} {session.status}
                </span>
              </div>

              <h3 className="compare-question">{session.question}</h3>

              <div className="compare-stats">
                <div className={`stat-row ${parseFloat(getLastConsensus(session)) === maxConsensus ? 'highlight-best' : parseFloat(getLastConsensus(session)) === minConsensus && sessions.length > 2 ? 'highlight-worst' : ''}`}>
                  <span className="stat-label">Konsensus</span>
                  <span className="stat-value">{getLastConsensus(session)}%</span>
                </div>

                <div className="stat-row">
                  <span className="stat-label">Förändring</span>
                  <span className={`stat-value ${getConsensusChange(session) > 0 ? 'positive' : getConsensusChange(session) < 0 ? 'negative' : ''}`}>
                    {getConsensusChange(session) > 0 ? '+' : ''}{getConsensusChange(session).toFixed(1)}%
                  </span>
                </div>

                <div className="stat-row">
                  <span className="stat-label">Snitt konfidens</span>
                  <span className="stat-value">{getAvgConfidence(session)}%</span>
                </div>

                <div className="stat-row">
                  <span className="stat-label">Rundor</span>
                  <span className="stat-value">{session.rounds.length}</span>
                </div>

                <div className={`stat-row ${session.current_cost_usd === minCost ? 'highlight-best' : session.current_cost_usd === maxCost && sessions.length > 2 ? 'highlight-worst' : ''}`}>
                  <span className="stat-label">Kostnad</span>
                  <span className="stat-value">${session.current_cost_usd.toFixed(4)}</span>
                </div>

                <div className="stat-row">
                  <span className="stat-label">Datum</span>
                  <span className="stat-value">{new Date(session.created_at).toLocaleDateString('sv-SE')}</span>
                </div>
              </div>

              {/* AI Confidence per round */}
              <div className="compare-ai-section">
                <h4>AI Konfidens (sista rundan)</h4>
                {session.rounds.length > 0 && (
                  <div className="ai-confidence-bars">
                    <div className="confidence-bar">
                      <span className="ai-label gpt">GPT</span>
                      <div className="bar-container">
                        <div
                          className="bar gpt"
                          style={{ width: `${session.rounds[session.rounds.length - 1].responses.openai.confidence}%` }}
                        />
                      </div>
                      <span className="bar-value">{session.rounds[session.rounds.length - 1].responses.openai.confidence}%</span>
                    </div>

                    <div className="confidence-bar">
                      <span className="ai-label claude">Claude</span>
                      <div className="bar-container">
                        <div
                          className="bar claude"
                          style={{ width: `${session.rounds[session.rounds.length - 1].responses.claude.confidence}%` }}
                        />
                      </div>
                      <span className="bar-value">{session.rounds[session.rounds.length - 1].responses.claude.confidence}%</span>
                    </div>

                    <div className="confidence-bar">
                      <span className="ai-label gemini">Gemini</span>
                      <div className="bar-container">
                        <div
                          className="bar gemini"
                          style={{ width: `${session.rounds[session.rounds.length - 1].responses.gemini.confidence}%` }}
                        />
                      </div>
                      <span className="bar-value">{session.rounds[session.rounds.length - 1].responses.gemini.confidence}%</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Consensus progression */}
              <div className="compare-progression">
                <h4>Konsensus per runda</h4>
                <div className="progression-chart">
                  {session.rounds.map((round, i) => (
                    <div key={i} className="progression-bar">
                      <div
                        className="progression-fill"
                        style={{
                          height: `${round.consensus_score * 100}%`,
                          backgroundColor: round.consensus_score > 0.7 ? 'var(--color-success)' :
                                          round.consensus_score > 0.4 ? 'var(--color-warning)' :
                                          'var(--color-danger)'
                        }}
                      />
                      <span className="progression-label">R{round.round_number}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary comparison */}
      <div className="compare-summary">
        <h3>Sammanfattning</h3>
        <div className="summary-grid">
          <div className="summary-item">
            <span className="summary-label">Högst konsensus</span>
            <span className="summary-value">
              #{consensusValues.indexOf(maxConsensus) + 1} ({maxConsensus.toFixed(1)}%)
            </span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Lägst kostnad</span>
            <span className="summary-value">
              #{costValues.indexOf(minCost) + 1} (${minCost.toFixed(4)})
            </span>
          </div>
          <div className="summary-item">
            <span className="summary-label">Flest rundor</span>
            <span className="summary-value">
              #{sessions.map(s => s.rounds.length).indexOf(Math.max(...sessions.map(s => s.rounds.length))) + 1} ({Math.max(...sessions.map(s => s.rounds.length))} rundor)
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
