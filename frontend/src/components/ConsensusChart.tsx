import { DebateRound } from '../types'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts'
import './ConsensusChart.css'

interface Props {
  rounds: DebateRound[]
}

export default function ConsensusChart({ rounds }: Props) {
  const data = rounds.map((round) => ({
    round: `Runda ${round.round_number}`,
    roundNumber: round.round_number,
    consensus: (round.consensus_score * 100).toFixed(1),
    gpt: round.responses.openai.confidence,
    claude: round.responses.claude.confidence,
    gemini: round.responses.gemini.confidence,
    avgConfidence: (
      (round.responses.openai.confidence +
        round.responses.claude.confidence +
        round.responses.gemini.confidence) /
      3
    ).toFixed(1)
  }))

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="custom-tooltip">
          <p className="tooltip-title">{payload[0].payload.round}</p>
          <div className="tooltip-content">
            <div className="tooltip-item consensus">
              <span className="tooltip-label">Konsensus:</span>
              <span className="tooltip-value">{payload[0].value}%</span>
            </div>
            <div className="tooltip-divider" />
            <div className="tooltip-item gpt">
              <span className="tooltip-label">🤖 GPT-4o:</span>
              <span className="tooltip-value">{payload[1].value}%</span>
            </div>
            <div className="tooltip-item claude">
              <span className="tooltip-label">🧠 Claude:</span>
              <span className="tooltip-value">{payload[2].value}%</span>
            </div>
            <div className="tooltip-item gemini">
              <span className="tooltip-label">🌟 Gemini:</span>
              <span className="tooltip-value">{payload[3].value}%</span>
            </div>
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <div className="consensus-chart">
      <div className="chart-header">
        <h3 className="chart-title">Konsensus & Konfidensutveckling</h3>
        <div className="chart-legend">
          <div className="legend-item">
            <span className="legend-dot consensus" />
            <span>Konsensus</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot gpt" />
            <span>GPT-4o konfidens</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot claude" />
            <span>Claude konfidens</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot gemini" />
            <span>Gemini konfidens</span>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={400}>
        <LineChart
          data={data}
          margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
          <XAxis
            dataKey="round"
            stroke="#666"
            style={{ fontSize: '0.875rem' }}
          />
          <YAxis
            domain={[0, 100]}
            stroke="#666"
            style={{ fontSize: '0.875rem' }}
            label={{
              value: 'Procent (%)',
              angle: -90,
              position: 'insideLeft',
              style: { fill: '#666', fontSize: '0.875rem' }
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={85} stroke="#10b981" strokeDasharray="5 5" opacity={0.3} />
          <ReferenceLine y={60} stroke="#f59e0b" strokeDasharray="5 5" opacity={0.3} />

          <Line
            type="monotone"
            dataKey="consensus"
            stroke="#e0e0e0"
            strokeWidth={3}
            dot={{ r: 6, fill: '#e0e0e0', strokeWidth: 2 }}
            activeDot={{ r: 8 }}
          />
          <Line
            type="monotone"
            dataKey="gpt"
            stroke="#10a37f"
            strokeWidth={2}
            dot={{ r: 4, fill: '#10a37f' }}
            strokeDasharray="5 5"
          />
          <Line
            type="monotone"
            dataKey="claude"
            stroke="#d97706"
            strokeWidth={2}
            dot={{ r: 4, fill: '#d97706' }}
            strokeDasharray="5 5"
          />
          <Line
            type="monotone"
            dataKey="gemini"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 4, fill: '#3b82f6' }}
            strokeDasharray="5 5"
          />
        </LineChart>
      </ResponsiveContainer>

      <div className="chart-insights">
        <div className="insight">
          <span className="insight-label">Start konsensus:</span>
          <span className="insight-value">{data[0]?.consensus}%</span>
        </div>
        <div className="insight">
          <span className="insight-label">Slut konsensus:</span>
          <span className="insight-value">{data[data.length - 1]?.consensus}%</span>
        </div>
        <div className="insight">
          <span className="insight-label">Förändring:</span>
          <span className={`insight-value ${
            Number(data[data.length - 1]?.consensus) - Number(data[0]?.consensus) > 0
              ? 'positive'
              : 'negative'
          }`}>
            {Number(data[data.length - 1]?.consensus) - Number(data[0]?.consensus) > 0 ? '+' : ''}
            {(Number(data[data.length - 1]?.consensus) - Number(data[0]?.consensus)).toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  )
}
