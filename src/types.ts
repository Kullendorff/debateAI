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
  timestamp: Date;
}

export interface DisagreementReport {
  core_conflict: string;
  disagreement_type: 'factual' | 'interpretive' | 'philosophical';
  resolvability_score: number;
  key_differences: string[];
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

export interface PhoneAFriendParams {
  question: string;
  context?: string;
  max_rounds?: number;
  max_cost_usd?: number;
  strategy?: 'debate' | 'synthesize' | 'tournament';
  models?: {
    openai?: string;
    gemini?: string;
    anthropic?: string;
  };
}

export interface PhoneAFriendResult {
  status: 'consensus' | 'deadlock' | 'intervention_needed' | 'user_accepted' | 'manually_resolved';
  final_answer?: string;
  debate_log: DebateRound[];
  cost_summary: CostBreakdown;
  disagreement_summary?: DisagreementReport;
  session_id: string;
}

export interface ContinueDebateParams {
  session_id: string;
  instruction: 'continue_2_rounds' | 'continue_until_consensus' | 'accept_answer' | 'synthesize_and_stop';
  selected_ai?: 'openai' | 'gemini' | 'claude';
}

export interface AnalyzeDisagreementParams {
  session_id: string;
}

export interface ModelPricing {
  input: number;  // per 1K tokens
  output: number; // per 1K tokens
}

export interface AIClient {
  generateResponse(prompt: string, model?: string): Promise<AIResponse>;
  getAvailableModels(): string[];
  calculateCost(inputTokens: number, outputTokens: number, model: string): number;
}

export interface DebateSession {
  id: string;
  question: string;
  context?: string;
  rounds: DebateRound[];
  status: 'active' | 'consensus' | 'deadlock' | 'paused' | 'failed' | 'user_accepted' | 'manually_resolved';
  created_at: Date;
  updated_at: Date;
  max_rounds: number;
  max_cost_usd: number;
  current_cost_usd: number;
  strategy: 'debate' | 'synthesize' | 'tournament';
}