import { AIResponse } from '../types'
import './AIResponseCard.css'

interface Props {
  ai: 'gpt' | 'claude' | 'gemini'
  response: AIResponse
  previousConfidence?: number
}

const AI_CONFIG = {
  gpt: {
    name: 'GPT-4o',
    icon: '🤖',
    color: 'var(--color-gpt)',
    bgColor: 'var(--color-gpt-bg)'
  },
  claude: {
    name: 'Claude Sonnet 4',
    icon: '🧠',
    color: 'var(--color-claude)',
    bgColor: 'var(--color-claude-bg)'
  },
  gemini: {
    name: 'Gemini',
    icon: '🌟',
    color: 'var(--color-gemini)',
    bgColor: 'var(--color-gemini-bg)'
  }
}

export default function AIResponseCard({ ai, response, previousConfidence }: Props) {
  const config = AI_CONFIG[ai]

  const getConfidenceChange = () => {
    if (previousConfidence === undefined) return null
    const change = response.confidence - previousConfidence
    if (Math.abs(change) < 2) return null
    return {
      value: change,
      direction: change > 0 ? 'up' : 'down',
      text: `${change > 0 ? '+' : ''}${change.toFixed(0)}%`
    }
  }

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'var(--color-success)'
    if (confidence >= 60) return 'var(--color-warning)'
    return 'var(--color-danger)'
  }

  const confidenceChange = getConfidenceChange()

  return (
    <div
      className={`ai-response-card ai-${ai}`}
      style={{
        borderColor: config.color,
        background: config.bgColor
      }}
    >
      <div className="card-header">
        <div className="ai-name">
          <span className="ai-icon">{config.icon}</span>
          <span className="ai-title">{config.name}</span>
        </div>
        <div className="confidence-badge" style={{ color: getConfidenceColor(response.confidence) }}>
          {response.confidence}%
          {confidenceChange && (
            <span className={`confidence-change ${confidenceChange.direction}`}>
              {confidenceChange.direction === 'up' ? '↑' : '↓'}
              {Math.abs(confidenceChange.value) >= 5 && (confidenceChange.direction === 'up' ? '↑' : '↓')}
            </span>
          )}
        </div>
      </div>

      <div className="card-content">
        <p className="response-text">{response.content}</p>
      </div>

      <div className="card-footer">
        <span className="model-name">{response.model}</span>
        <span className="token-count">{response.tokens_used.toLocaleString()} tokens</span>
        <span className="cost">${response.cost_usd.toFixed(6)}</span>
      </div>
    </div>
  )
}
