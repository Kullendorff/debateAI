export interface AIResponse {
  content: string;
  confidence: number;
  model: string;
  tokens_used: number;
  cost_usd: number;
}

export interface DebateRound {
  round_number: number;
  responses: {
    openai: AIResponse;
    gemini: AIResponse;
    claude: AIResponse;
  };
  consensus_score: number;
  tokens_used: number;
  cost_usd: number;
  timestamp: string;
}

export interface CostBreakdown {
  total_cost_usd: number;
  by_model: {
    openai: number;
    gemini: number;
    claude: number;
  };
  by_round: number[];
  tokens_used: number;
}

export interface DebateSession {
  id: string;
  question: string;
  context?: string;
  rounds: DebateRound[];
  status: 'active' | 'consensus' | 'deadlock' | 'paused' | 'failed' | 'user_accepted' | 'manually_resolved';
  created_at: string;
  updated_at: string;
  max_rounds: number;
  max_cost_usd: number;
  current_cost_usd: number;
  strategy: 'debate' | 'synthesize' | 'tournament';
}

export interface SessionSummary {
  id: string;
  question: string;
  status: string;
  rounds: number;
  consensus: number;
  cost: number;
  created_at: string;
}
