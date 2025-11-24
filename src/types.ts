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
  // Nya fält för avancerade funktioner
  peer_reviews?: PeerReviewSummary[];
  consensus_breakdown?: ConsensusBreakdownSummary;
  chairman_synthesis?: ChairmanSynthesisSummary;
}

// === NYA TYPER FÖR AVANCERADE FUNKTIONER ===

/**
 * Sammanfattning av peer review för lagring i session
 */
export interface PeerReviewSummary {
  round_number: number;
  winner: 'openai' | 'gemini' | 'claude';
  consensus_on_winner: boolean;
  rankings: {
    provider: 'openai' | 'gemini' | 'claude';
    avg_position: number;
    votes_for_first: number;
  }[];
  cost_usd: number;
  timestamp: Date;
}

/**
 * Sammanfattning av konsensusanalys för lagring
 */
export interface ConsensusBreakdownSummary {
  round_number: number;
  overall_score: number;
  components: {
    semantic_similarity: number;
    factual_agreement: number;
    tonal_alignment: number;
    structural_similarity: number;
    confidence_alignment: number;
  };
  agreement_points: string[];
  disagreement_points: string[];
  timestamp: Date;
}

/**
 * Sammanfattning av ordförandesyntes för lagring
 */
export interface ChairmanSynthesisSummary {
  chairman: 'openai' | 'gemini' | 'claude';
  synthesized_answer: string;
  confidence: number;
  key_agreements: string[];
  key_disagreements: string[];
  cost_usd: number;
  timestamp: Date;
}