import { DebateRound } from '../types'
import AIResponseCard from './AIResponseCard'
import './RoundView.css'

interface Props {
  round: DebateRound
  roundIndex: number
  totalRounds: number
  previousRound?: DebateRound
}

export default function RoundView({ round, roundIndex, totalRounds, previousRound }: Props) {
  const getRoundTitle = () => {
    if (roundIndex === 0) return 'Grundläggande positioner'
    if (roundIndex === totalRounds - 1) return 'Slutgiltig konsensus'
    return `Fördjupad analys`
  }

  const getConsensusChange = () => {
    if (!previousRound) return null
    const change = (round.consensus_score - previousRound.consensus_score) * 100
    if (Math.abs(change) < 1) return null
    return {
      value: change,
      direction: change > 0 ? 'up' : 'down',
      text: `${change > 0 ? '+' : ''}${change.toFixed(1)}%`
    }
  }

  const getConsensusColor = (score: number) => {
    if (score >= 0.85) return 'var(--color-success)'
    if (score >= 0.6) return 'var(--color-warning)'
    return 'var(--color-danger)'
  }

  const consensusChange = getConsensusChange()
  const avgConfidence = (
    round.responses.openai.confidence +
    round.responses.claude.confidence +
    round.responses.gemini.confidence
  ) / 3

  return (
    <div className="round-view">
      <div className="round-header">
        <div className="round-title-section">
          <h4 className="round-title">
            Runda {round.round_number}: {getRoundTitle()}
          </h4>
          <div className="round-timestamp">
            {new Date(round.timestamp).toLocaleString('sv-SE', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </div>
        </div>

        <div className="round-stats">
          <div className="stat">
            <span className="stat-label">Konsensus</span>
            <span
              className="stat-value consensus-value"
              style={{ color: getConsensusColor(round.consensus_score) }}
            >
              {(round.consensus_score * 100).toFixed(1)}%
              {consensusChange && (
                <span className={`consensus-change ${consensusChange.direction}`}>
                  {consensusChange.direction === 'up' ? '↑' : '↓'} {consensusChange.text}
                </span>
              )}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Avg. Konfidens</span>
            <span className="stat-value">{avgConfidence.toFixed(1)}%</span>
          </div>
          <div className="stat">
            <span className="stat-label">Kostnad</span>
            <span className="stat-value">${round.cost_usd.toFixed(4)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Tokens</span>
            <span className="stat-value">{round.tokens_used.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="responses-grid">
        <AIResponseCard
          ai="gpt"
          response={round.responses.openai}
          previousConfidence={previousRound?.responses.openai.confidence}
        />
        <AIResponseCard
          ai="claude"
          response={round.responses.claude}
          previousConfidence={previousRound?.responses.claude.confidence}
        />
        <AIResponseCard
          ai="gemini"
          response={round.responses.gemini}
          previousConfidence={previousRound?.responses.gemini.confidence}
        />
      </div>
    </div>
  )
}
