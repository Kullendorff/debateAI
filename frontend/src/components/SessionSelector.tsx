import { useState, useMemo } from 'react'
import { SessionSummary } from '../types'
import './SessionSelector.css'

interface Props {
  sessions: SessionSummary[]
  onSelectSession: (id: string) => void
}

type SortOption = 'newest' | 'oldest' | 'highest_consensus' | 'lowest_consensus' | 'most_rounds' | 'highest_cost'
type StatusFilter = 'all' | 'consensus' | 'deadlock' | 'paused' | 'active'
type ConsensusFilter = 'all' | 'high' | 'medium' | 'low'

export default function SessionSelector({ sessions, onSelectSession }: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [consensusFilter, setConsensusFilter] = useState<ConsensusFilter>('all')
  const [sortBy, setSortBy] = useState<SortOption>('newest')

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

  // Filter and sort sessions
  const filteredSessions = useMemo(() => {
    let result = [...sessions]

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(s =>
        s.question.toLowerCase().includes(query)
      )
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(s => s.status === statusFilter)
    }

    // Consensus filter
    if (consensusFilter !== 'all') {
      result = result.filter(s => {
        const consensus = s.consensus * 100
        switch (consensusFilter) {
          case 'high': return consensus >= 70
          case 'medium': return consensus >= 40 && consensus < 70
          case 'low': return consensus < 40
          default: return true
        }
      })
    }

    // Sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        case 'highest_consensus':
          return b.consensus - a.consensus
        case 'lowest_consensus':
          return a.consensus - b.consensus
        case 'most_rounds':
          return b.rounds - a.rounds
        case 'highest_cost':
          return b.cost - a.cost
        default:
          return 0
      }
    })

    return result
  }, [sessions, searchQuery, statusFilter, consensusFilter, sortBy])

  const clearFilters = () => {
    setSearchQuery('')
    setStatusFilter('all')
    setConsensusFilter('all')
    setSortBy('newest')
  }

  const hasActiveFilters = searchQuery || statusFilter !== 'all' || consensusFilter !== 'all' || sortBy !== 'newest'

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

      {/* Search and Filter Bar */}
      <div className="filter-bar">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Sök i frågor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button className="clear-search" onClick={() => setSearchQuery('')}>×</button>
          )}
        </div>

        <div className="filter-group">
          <label>Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="filter-select"
          >
            <option value="all">Alla</option>
            <option value="consensus">✅ Konsensus</option>
            <option value="deadlock">🚨 Deadlock</option>
            <option value="paused">⏸️ Pausad</option>
            <option value="active">🔄 Aktiv</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Konsensus:</label>
          <select
            value={consensusFilter}
            onChange={(e) => setConsensusFilter(e.target.value as ConsensusFilter)}
            className="filter-select"
          >
            <option value="all">Alla</option>
            <option value="high">Hög (70%+)</option>
            <option value="medium">Medel (40-70%)</option>
            <option value="low">Låg (&lt;40%)</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Sortera:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="filter-select"
          >
            <option value="newest">Nyast först</option>
            <option value="oldest">Äldst först</option>
            <option value="highest_consensus">Högst konsensus</option>
            <option value="lowest_consensus">Lägst konsensus</option>
            <option value="most_rounds">Flest rundor</option>
            <option value="highest_cost">Högst kostnad</option>
          </select>
        </div>

        {hasActiveFilters && (
          <button className="clear-filters" onClick={clearFilters}>
            Rensa filter
          </button>
        )}
      </div>

      {/* Results count */}
      <div className="results-count">
        Visar {filteredSessions.length} av {sessions.length} debatter
      </div>

      {/* Session Grid */}
      {filteredSessions.length === 0 ? (
        <div className="no-results">
          <p>Inga debatter matchar dina filter</p>
          <button onClick={clearFilters}>Rensa filter</button>
        </div>
      ) : (
        <div className="session-grid">
          {filteredSessions.map((session) => (
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
      )}
    </div>
  )
}
