import {
  DebateRound,
  DebateSession,
  PhoneAFriendParams,
  PhoneAFriendResult,
  DisagreementReport,
  AIResponse,
  ContinueDebateParams
} from './types.js';
import { AIClientManager } from './ai-clients.js';
import { CostController } from './cost-controller.js';
import { SessionStore, FileSessionStore } from './session-store.js';

export class ConsensusEngine {
  private sessionStore: SessionStore;
  private aiManager: AIClientManager;
  private costController: CostController;
  private initialized: boolean = false;

  constructor(aiManager: AIClientManager, sessionStore?: SessionStore) {
    this.aiManager = aiManager;
    this.costController = new CostController();
    this.sessionStore = sessionStore || new FileSessionStore();
  }

  /**
   * Initialize the consensus engine (must be called before use)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.sessionStore.initialize();
    this.initialized = true;
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('ConsensusEngine not initialized. Call initialize() first.');
    }
  }

  /**
   * Clean up old sessions
   * @param maxAgeMs Maximum age of sessions to keep (default: 7 days)
   * @returns Number of sessions deleted
   */
  async cleanupOldSessions(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    this.ensureInitialized();
    const deletedCount = await this.sessionStore.cleanup(maxAgeMs);
    console.error(`Session cleanup: deleted ${deletedCount} old sessions`);
    return deletedCount;
  }

  async phoneAFriend(params: PhoneAFriendParams, progressCallback?: (update: string) => void, interactive = false): Promise<PhoneAFriendResult> {
    this.ensureInitialized();
    const sessionId = this.generateSessionId();
    const session = this.createSession(sessionId, params);
    await this.sessionStore.set(sessionId, session);

    try {
      this.costController.initializeSession(sessionId);
      
      // In interactive mode, only run one round initially
      const maxRounds = interactive ? 1 : session.max_rounds;
      
      for (let round = session.rounds.length + 1; round <= maxRounds; round++) {
        console.error(`Starting round ${round}/${session.max_rounds}`);
        progressCallback?.(`🔄 **Runda ${round}/${session.max_rounds}** - Samlar svar från AI-panelen...`);
        
        const roundResult = await this.conductRound(session, round, progressCallback);
        session.rounds.push(roundResult);
        session.updated_at = new Date();
        await this.sessionStore.set(sessionId, session);

        // Commentary after each round
        const consensus = roundResult.consensus_score;
        if (consensus > 0.85) {
          progressCallback?.(`✅ **Runda ${round} klar** - Stark konsensus nådd! (${(consensus*100).toFixed(1)}%)`);
        } else if (consensus > 0.6) {
          progressCallback?.(`🤔 **Runda ${round} klar** - Partiell enighet, men fortfarande meningsskiljaktigheter (${(consensus*100).toFixed(1)}%)`);
        } else {
          progressCallback?.(`⚡ **Runda ${round} klar** - AI:erna är oeniga, debatten fortsätter (${(consensus*100).toFixed(1)}%)`);
        }

        // In interactive mode, stop after each round to ask user
        if (interactive) {
          session.status = 'paused';
          session.updated_at = new Date();
          await this.sessionStore.set(sessionId, session);

          if (consensus >= 0.85) {
            return {
              status: 'consensus',
              final_answer: this.synthesizeFinalAnswer(roundResult),
              debate_log: session.rounds,
              cost_summary: this.costController.getCostBreakdown(sessionId)!,
              session_id: sessionId
            };
          } else {
            return {
              status: 'intervention_needed',
              debate_log: session.rounds,
              cost_summary: this.costController.getCostBreakdown(sessionId)!,
              disagreement_summary: this.analyzeDisagreement(session.rounds),
              session_id: sessionId
            };
          }
        }
        
        // Check budget limits
        const budgetCheck = this.costController.checkBudgetLimit(sessionId, session.max_cost_usd);
        
        // EMERGENCY BRAKE: Hard stop at $10 regardless of user settings
        if (budgetCheck.currentCost >= 10.0) {
          console.error(`🚨 EMERGENCY STOP: Hard limit $10 reached ($${budgetCheck.currentCost.toFixed(4)})`);
          session.status = 'failed';
          session.updated_at = new Date();
          await this.sessionStore.set(sessionId, session);
          throw new Error(`Emergency stop: Cost exceeded $10 safety limit ($${budgetCheck.currentCost.toFixed(4)})`);
        }
        
        if (!budgetCheck.withinBudget) {
          console.error(`Budget limit reached: $${budgetCheck.currentCost.toFixed(4)}`);
          break;
        }

        // Check for consensus
        if (roundResult.consensus_score >= 0.85) {
          session.status = 'consensus';
          session.updated_at = new Date();
          await this.sessionStore.set(sessionId, session);
          const finalAnswer = this.synthesizeFinalAnswer(roundResult);

          return {
            status: 'consensus',
            final_answer: finalAnswer,
            debate_log: session.rounds,
            cost_summary: this.costController.getCostBreakdown(sessionId)!,
            session_id: sessionId
          };
        }

        // Warning at 75% budget
        if (budgetCheck.warningThreshold && round < session.max_rounds) {
          console.error(`Warning: 75% of budget used ($${budgetCheck.currentCost.toFixed(4)})`);
        }
      }

      // No consensus reached
      session.status = 'deadlock';
      session.updated_at = new Date();
      await this.sessionStore.set(sessionId, session);
      const disagreementReport = this.analyzeDisagreement(session.rounds);

      return {
        status: 'intervention_needed',
        debate_log: session.rounds,
        cost_summary: this.costController.getCostBreakdown(sessionId)!,
        disagreement_summary: disagreementReport,
        session_id: sessionId
      };

    } catch (error) {
      console.error('Error in phoneAFriend:', error);
      throw error;
    }
  }

  async continueDebate(params: ContinueDebateParams): Promise<PhoneAFriendResult> {
    this.ensureInitialized();
    const session = await this.sessionStore.get(params.session_id);
    if (!session) {
      throw new Error(`Session ${params.session_id} not found`);
    }

    if (params.instruction === 'accept_answer' && params.selected_ai) {
      const lastRound = session.rounds[session.rounds.length - 1];
      if (!lastRound) {
        throw new Error('No rounds found in session');
      }

      const selectedResponse = lastRound.responses[params.selected_ai];
      session.status = 'consensus';
      session.updated_at = new Date();
      await this.sessionStore.set(params.session_id, session);

      return {
        status: 'consensus',
        final_answer: selectedResponse.content,
        debate_log: session.rounds,
        cost_summary: this.costController.getCostBreakdown(params.session_id)!,
        session_id: params.session_id
      };
    }

    if (params.instruction === 'synthesize_and_stop') {
      const lastRound = session.rounds[session.rounds.length - 1];
      const synthesized = this.synthesizeFinalAnswer(lastRound!);
      session.status = 'consensus';
      session.updated_at = new Date();
      await this.sessionStore.set(params.session_id, session);

      return {
        status: 'consensus',
        final_answer: synthesized,
        debate_log: session.rounds,
        cost_summary: this.costController.getCostBreakdown(params.session_id)!,
        session_id: params.session_id
      };
    }

    // Continue debate
    const additionalRounds = params.instruction === 'continue_2_rounds' ? 2 : 
                            params.instruction === 'continue_until_consensus' ? 10 : 0;
    
    const originalMaxRounds = session.max_rounds;
    session.max_rounds = session.rounds.length + additionalRounds;

    // Continue from where we left off
    for (let round = session.rounds.length + 1; round <= session.max_rounds; round++) {
      const roundResult = await this.conductRound(session, round);
      session.rounds.push(roundResult);
      session.updated_at = new Date();
      await this.sessionStore.set(params.session_id, session);

      if (roundResult.consensus_score >= 0.85) {
        session.status = 'consensus';
        session.updated_at = new Date();
        await this.sessionStore.set(params.session_id, session);
        return {
          status: 'consensus',
          final_answer: this.synthesizeFinalAnswer(roundResult),
          debate_log: session.rounds,
          cost_summary: this.costController.getCostBreakdown(params.session_id)!,
          session_id: params.session_id
        };
      }

      const budgetCheck = this.costController.checkBudgetLimit(params.session_id, session.max_cost_usd);
      
      // EMERGENCY BRAKE: Hard stop at $10
      if (budgetCheck.currentCost >= 10.0) {
        console.error(`🚨 EMERGENCY STOP: Hard limit $10 reached ($${budgetCheck.currentCost.toFixed(4)})`);
        session.status = 'failed';
        session.updated_at = new Date();
        await this.sessionStore.set(params.session_id, session);
        throw new Error(`Emergency stop: Cost exceeded $10 safety limit ($${budgetCheck.currentCost.toFixed(4)})`);
      }
      
      if (!budgetCheck.withinBudget) {
        break;
      }
    }

    // Still no consensus
    return {
      status: 'intervention_needed',
      debate_log: session.rounds,
      cost_summary: this.costController.getCostBreakdown(params.session_id)!,
      disagreement_summary: this.analyzeDisagreement(session.rounds),
      session_id: params.session_id
    };
  }

  async analyzeDisagreementForSession(sessionId: string): Promise<DisagreementReport | null> {
    this.ensureInitialized();
    const session = await this.sessionStore.get(sessionId);
    if (!session) {
      return null;
    }
    return this.analyzeDisagreement(session.rounds);
  }

  async continueRound(sessionId: string, action: 'next_round' | 'finish_debate' | 'auto_complete', progressCallback?: (update: string) => void): Promise<PhoneAFriendResult> {
    this.ensureInitialized();
    const session = await this.sessionStore.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (action === 'finish_debate') {
      // Synthesize current answers and finish
      const lastRound = session.rounds[session.rounds.length - 1];
      if (!lastRound) {
        throw new Error('No rounds found in session');
      }

      session.status = 'consensus';
      session.updated_at = new Date();
      await this.sessionStore.set(sessionId, session);
      return {
        status: 'consensus',
        final_answer: this.synthesizeFinalAnswer(lastRound),
        debate_log: session.rounds,
        cost_summary: this.costController.getCostBreakdown(sessionId)!,
        session_id: sessionId
      };
    }

    // Continue with more rounds
    const interactive = action === 'next_round';
    const maxRounds = interactive ? session.rounds.length + 1 : session.max_rounds;

    for (let round = session.rounds.length + 1; round <= maxRounds; round++) {
      console.error(`Starting round ${round}/${session.max_rounds}`);
      progressCallback?.(`🔄 **Runda ${round}/${session.max_rounds}** - Samlar svar från AI-panelen...`);
      
      const roundResult = await this.conductRound(session, round, progressCallback);
      session.rounds.push(roundResult);
      session.updated_at = new Date();
      await this.sessionStore.set(sessionId, session);

      const consensus = roundResult.consensus_score;
      if (consensus > 0.85) {
        progressCallback?.(`✅ **Runda ${round} klar** - Stark konsensus nådd! (${(consensus*100).toFixed(1)}%)`);

        // Consensus reached
        session.status = 'consensus';
        session.updated_at = new Date();
        await this.sessionStore.set(sessionId, session);
        return {
          status: 'consensus',
          final_answer: this.synthesizeFinalAnswer(roundResult),
          debate_log: session.rounds,
          cost_summary: this.costController.getCostBreakdown(sessionId)!,
          session_id: sessionId
        };
      } else if (consensus > 0.6) {
        progressCallback?.(`🤔 **Runda ${round} klar** - Partiell enighet, men fortfarande meningsskiljaktigheter (${(consensus*100).toFixed(1)}%)`);
      } else {
        progressCallback?.(`⚡ **Runda ${round} klar** - AI:erna är oeniga, debatten fortsätter (${(consensus*100).toFixed(1)}%)`);
      }

      // Budget check
      const budgetCheck = this.costController.checkBudgetLimit(sessionId, session.max_cost_usd);
      
      // EMERGENCY BRAKE: Hard stop at $10
      if (budgetCheck.currentCost >= 10.0) {
        console.error(`🚨 EMERGENCY STOP: Hard limit $10 reached ($${budgetCheck.currentCost.toFixed(4)})`);
        session.status = 'failed';
        session.updated_at = new Date();
        await this.sessionStore.set(sessionId, session);
        throw new Error(`Emergency stop: Cost exceeded $10 safety limit ($${budgetCheck.currentCost.toFixed(4)})`);
      }
      
      if (!budgetCheck.withinBudget) {
        console.error(`Budget limit reached: $${budgetCheck.currentCost.toFixed(4)}`);
        break;
      }

      // If interactive (next_round), stop after this round
      if (interactive) {
        return {
          status: 'intervention_needed',
          debate_log: session.rounds,
          cost_summary: this.costController.getCostBreakdown(sessionId)!,
          disagreement_summary: this.analyzeDisagreement(session.rounds),
          session_id: sessionId
        };
      }

      // Budget warning
      if (budgetCheck.warningThreshold && round < session.max_rounds) {
        console.error(`Warning: 75% of budget used ($${budgetCheck.currentCost.toFixed(4)})`);
      }
    }

    // No consensus reached after all rounds
    session.status = 'deadlock';
    session.updated_at = new Date();
    await this.sessionStore.set(sessionId, session);
    return {
      status: 'intervention_needed',
      debate_log: session.rounds,
      cost_summary: this.costController.getCostBreakdown(sessionId)!,
      disagreement_summary: this.analyzeDisagreement(session.rounds),
      session_id: sessionId
    };
  }

  private async conductRound(session: DebateSession, roundNumber: number, progressCallback?: (update: string) => void): Promise<DebateRound> {
    const prompt = this.generatePromptForRound(session, roundNumber);
    const providers = this.aiManager.getAvailableProviders();
    
    if (providers.length < 3) {
      throw new Error('Need at least 3 AI providers configured');
    }

    const responses: Partial<DebateRound['responses']> = {};
    let totalCost = 0;
    let totalTokens = 0;

    // Get responses from all AI providers in parallel
    const providerNames = { openai: 'GPT-4o', gemini: 'Gemini', claude: 'Claude Sonnet 4' };
    
    const responsePromises = providers.slice(0, 3).map(async (provider) => {
      const client = this.aiManager.getClient(provider);
      if (!client) throw new Error(`Client for ${provider} not available`);

      console.error(`[DEBUG] ConsensusEngine: Starting request to ${provider} for round ${roundNumber}`);

      try {
        progressCallback?.(`🤖 Väntar på svar från ${providerNames[provider as keyof typeof providerNames]}...`);
        console.error(`[DEBUG] ConsensusEngine: Calling ${provider}.generateResponse()...`);

        const response = await client.generateResponse(prompt);

        console.error(`[DEBUG] ConsensusEngine: ${provider} responded successfully! Confidence: ${response.confidence}%, Tokens: ${response.tokens_used}, Cost: $${response.cost_usd.toFixed(6)}`);
        progressCallback?.(`✅ ${providerNames[provider as keyof typeof providerNames]} svarade (${response.confidence}% säkerhet)`);

        this.costController.addCost(
          session.id,
          provider,
          response.cost_usd,
          response.tokens_used,
          roundNumber
        );
        return { provider, response };
      } catch (error: any) {
        console.error(`[DEBUG] ConsensusEngine: ${provider} FAILED!`);
        console.error(`[DEBUG] ConsensusEngine: Error from ${provider}:`, error?.message || error);
        progressCallback?.(`❌ ${providerNames[provider as keyof typeof providerNames]} kunde inte svara - fel: ${error?.message || error}`);
        // Return a fallback response
        return {
          provider,
          response: {
            content: `Error: Unable to get response from ${provider}`,
            confidence: 0,
            model: 'error',
            tokens_used: 0,
            cost_usd: 0
          }
        };
      }
    });

    const results = await Promise.all(responsePromises);

    // Map results to the expected format and count failures
    let failedProviders = 0;
    results.forEach(({ provider, response }) => {
      // Check if this is an error response
      if (response.confidence === 0 && response.model === 'error') {
        failedProviders++;
      }

      switch (provider) {
        case 'openai':
          responses.openai = response;
          break;
        case 'gemini':
          responses.gemini = response;
          break;
        case 'claude':
          responses.claude = response;
          break;
      }
      totalCost += response.cost_usd;
      totalTokens += response.tokens_used;
    });

    // Require at least 2 out of 3 providers to succeed
    if (failedProviders > 1) {
      throw new Error(
        `Too many AI providers failed (${failedProviders}/3). Cannot continue debate without at least 2 working providers.`
      );
    }

    // If exactly 1 provider failed, log a warning
    if (failedProviders === 1) {
      console.error(`Warning: 1 AI provider failed. Continuing with 2 providers.`);
      progressCallback?.(`⚠️ En AI-provider failade, fortsätter med 2 providers...`);
    }

    // Ensure all required responses are present
    const roundResponses = {
      openai: responses.openai!,
      gemini: responses.gemini!,
      claude: responses.claude!
    };

    const consensusScore = await this.calculateConsensusScore(roundResponses);

    session.current_cost_usd += totalCost;
    session.updated_at = new Date();

    return {
      round_number: roundNumber,
      responses: roundResponses,
      consensus_score: consensusScore,
      tokens_used: totalTokens,
      cost_usd: totalCost,
      timestamp: new Date()
    };
  }

  private generatePromptForRound(session: DebateSession, roundNumber: number): string {
    if (roundNumber === 1) {
      let prompt = `You are participating in an AI consensus panel to answer this question:

**Question:** ${session.question}`;

      if (session.context) {
        prompt += `\n\n**Context:** ${session.context}`;
      }

      prompt += `\n\nPlease provide your best answer to this question. Be thorough but concise. If you have a confidence level in your answer, please indicate it as a percentage.`;

      return prompt;
    }

    const lastRound = session.rounds[roundNumber - 2]; // -2 because array is 0-indexed and we want previous round
    if (!lastRound) {
      throw new Error('Previous round not found');
    }

    const instruction = this.getDebateInstruction(roundNumber);
    
    return `You are in round ${roundNumber} of an AI consensus panel discussing this question:

**Question:** ${session.question}

**Previous responses from round ${roundNumber - 1}:**

**OpenAI (GPT):** ${lastRound.responses.openai.content}
(Confidence: ${lastRound.responses.openai.confidence}%)

**Google (Gemini):** ${lastRound.responses.gemini.content}
(Confidence: ${lastRound.responses.gemini.confidence}%)

**Anthropic (Claude):** ${lastRound.responses.claude.content}
(Confidence: ${lastRound.responses.claude.confidence}%)

**Instructions for this round:**
${instruction}

Please provide your response, addressing the other AIs' points where relevant. Include your confidence level as a percentage.`;
  }

  private getDebateInstruction(round: number): string {
    const instructions: Record<number, string> = {
      2: "Analyze the other responses. Where do you agree or disagree? Provide evidence or reasoning for your position. Focus on identifying the strongest arguments.",
      3: "This is the final round. Push toward consensus by finding common ground, or clearly state your fundamental disagreement and why it cannot be resolved.",
      4: "Focus on synthesis. What can all parties agree on? Try to build a unified answer that incorporates the best insights from all perspectives.",
      5: "Last chance for consensus. Either converge on a unified answer or clearly articulate why the disagreement is irreconcilable."
    };
    
    return instructions[round] || instructions[3];
  }

  private async calculateConsensusScore(responses: DebateRound['responses']): Promise<number> {
    return await this.calculateSemanticConsensus(responses);
  }

  private async calculateSemanticConsensus(responses: DebateRound['responses']): Promise<number> {
    // Filter out error responses
    const validResponses = [
      { name: 'openai', response: responses.openai },
      { name: 'gemini', response: responses.gemini },
      { name: 'claude', response: responses.claude }
    ].filter(({ response }) => response.confidence > 0 && response.model !== 'error');

    if (validResponses.length < 2) {
      console.error('Not enough valid responses for consensus calculation');
      return 0;
    }

    const contents = validResponses.map(({ response }) => response.content);

    try {
      // Use Python-based semantic consensus engine
      const { spawn } = require('child_process');
      const path = require('path');
      
      const pythonScript = path.join(__dirname, 'smart_consensus.py');
      const python = spawn('python', [pythonScript]);
      
      let result = '';
      let error = '';

      const input = JSON.stringify({ responses: contents });
      
      return new Promise<number>((resolve) => {
        python.stdin.write(input);
        python.stdin.end();

        python.stdout.on('data', (data: Buffer) => {
          result += data.toString();
        });

        python.stderr.on('data', (data: Buffer) => {
          error += data.toString();
        });

        python.on('close', (code: number) => {
          if (code !== 0) {
            console.error('Smart consensus error:', error);
            // Fallback to old algorithm if Python fails
            resolve(this.calculateJaccardFallback(responses));
            return;
          }

          try {
            const parsed = JSON.parse(result);
            const score = parsed.consensus_score || 0;
            resolve(score);
          } catch (parseError) {
            console.error('Failed to parse consensus result:', parseError);
            resolve(this.calculateJaccardFallback(responses));
          }
        });

        python.on('error', (err: Error) => {
          console.error('Python process error:', err);
          resolve(this.calculateJaccardFallback(responses));
        });
      });

    } catch (error) {
      console.error('Semantic consensus failed:', error);
      return this.calculateJaccardFallback(responses);
    }
  }

  private calculateJaccardFallback(responses: DebateRound['responses']): number {
    // Filter out error responses
    const validResponses = [
      responses.openai,
      responses.gemini,
      responses.claude
    ].filter(response => response.confidence > 0 && response.model !== 'error');

    if (validResponses.length < 2) {
      console.error('Not enough valid responses for Jaccard fallback');
      return 0;
    }

    // Original Jaccard algorithm as fallback
    const contents = validResponses.map(r => r.content.toLowerCase());

    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < contents.length; i++) {
      for (let j = i + 1; j < contents.length; j++) {
        const similarity = this.calculateTextSimilarity(contents[i]!, contents[j]!);
        totalSimilarity += similarity;
        comparisons++;
      }
    }

    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    // Simple keyword overlap similarity (fallback only)
    const words1 = new Set(text1.split(/\s+/).filter(w => w.length > 3));
    const words2 = new Set(text2.split(/\s+/).filter(w => w.length > 3));
    
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private synthesizeFinalAnswer(round: DebateRound): string {
    const responses = [
      round.responses.openai.content,
      round.responses.gemini.content,
      round.responses.claude.content
    ];

    // Find the longest response as the base
    const longestResponse = responses.reduce((a, b) => a.length > b.length ? a : b);
    
    // Simple synthesis - in a real implementation, this could use LLM to synthesize
    return `Based on the AI panel consensus:\n\n${longestResponse}\n\n(This answer represents the converged position of the AI panel)`;
  }

  private analyzeDisagreement(rounds: DebateRound[]): DisagreementReport {
    const lastRound = rounds[rounds.length - 1];
    if (!lastRound) {
      return {
        core_conflict: 'No rounds available for analysis',
        disagreement_type: 'interpretive',
        resolvability_score: 0,
        key_differences: []
      };
    }

    const responses = [
      lastRound.responses.openai.content,
      lastRound.responses.gemini.content,
      lastRound.responses.claude.content
    ];

    // Analyze the type of disagreement
    const hasFactualClaims = responses.some(r => 
      /\d{4}|\b(is|are|was|were)\b.*\b(true|false|correct|incorrect)\b/i.test(r)
    );
    
    const hasPhilosophicalTerms = responses.some(r =>
      /\b(believe|think|feel|opinion|perspective|philosophical|moral|ethical)\b/i.test(r)
    );

    const disagreementType: 'factual' | 'interpretive' | 'philosophical' = 
      hasFactualClaims ? 'factual' :
      hasPhilosophicalTerms ? 'philosophical' :
      'interpretive';

    // Calculate resolvability based on confidence levels and disagreement type
    const avgConfidence = (
      lastRound.responses.openai.confidence +
      lastRound.responses.gemini.confidence +
      lastRound.responses.claude.confidence
    ) / 3;

    let resolvabilityScore = disagreementType === 'factual' ? 8 :
                           disagreementType === 'interpretive' ? 6 :
                           4; // philosophical

    // Adjust based on confidence
    if (avgConfidence < 60) resolvabilityScore += 2;
    if (avgConfidence > 85) resolvabilityScore -= 1;

    return {
      core_conflict: this.extractCoreConflict(responses),
      disagreement_type: disagreementType,
      resolvability_score: Math.min(10, Math.max(1, resolvabilityScore)),
      key_differences: this.extractKeyDifferences(responses)
    };
  }

  private extractCoreConflict(responses: string[]): string {
    // Simple heuristic to identify the main point of disagreement
    const keywords = ['disagree', 'however', 'but', 'although', 'contrary', 'different'];
    
    for (const response of responses) {
      for (const keyword of keywords) {
        const index = response.toLowerCase().indexOf(keyword);
        if (index !== -1) {
          // Extract surrounding context
          const start = Math.max(0, index - 50);
          const end = Math.min(response.length, index + 100);
          return response.substring(start, end).trim();
        }
      }
    }

    return 'The AIs have different interpretations of the question or different methodological approaches.';
  }

  private extractKeyDifferences(responses: string[]): string[] {
    // Simple extraction of different viewpoints
    const differences: string[] = [];
    
    if (responses.length >= 3) {
      differences.push(`OpenAI emphasizes: ${this.extractKeyPoint(responses[0]!)}`);
      differences.push(`Gemini focuses on: ${this.extractKeyPoint(responses[1]!)}`);
      differences.push(`Claude highlights: ${this.extractKeyPoint(responses[2]!)}`);
    }

    return differences;
  }

  private extractKeyPoint(response: string): string {
    // Extract the first meaningful sentence
    const sentences = response.split(/[.!?]+/);
    for (const sentence of sentences) {
      if (sentence.trim().length > 20) {
        return sentence.trim().substring(0, 100) + (sentence.length > 100 ? '...' : '');
      }
    }
    return 'No clear key point identified';
  }

  private createSession(sessionId: string, params: PhoneAFriendParams): DebateSession {
    const session: DebateSession = {
      id: sessionId,
      question: params.question,
      context: params.context,
      rounds: [],
      status: 'active',
      created_at: new Date(),
      updated_at: new Date(),
      max_rounds: params.max_rounds || 3,
      max_cost_usd: params.max_cost_usd || 1.0,
      current_cost_usd: 0,
      strategy: params.strategy || 'debate'
    };

    // Session will be persisted by the caller
    return session;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  async formatInterventionSummary(sessionId: string): Promise<string> {
    this.ensureInitialized();
    const session = await this.sessionStore.get(sessionId);
    if (!session) return 'Session not found';

    const lastRound = session.rounds[session.rounds.length - 1];
    if (!lastRound) return 'No rounds found';

    const costSummary = this.costController.getCostBreakdown(sessionId);
    const disagreement = this.analyzeDisagreement(session.rounds);

    return `## 🚨 AI Panel Deadlock - Round ${session.rounds.length}/${session.max_rounds}

**Question:** ${session.question}

### Current Positions:

**🤖 GPT-4:** ${this.truncateText(lastRound.responses.openai.content, 150)}
- Confidence: ${lastRound.responses.openai.confidence}%
- Key argument: ${this.extractKeyPoint(lastRound.responses.openai.content)}

**🧠 Claude:** ${this.truncateText(lastRound.responses.claude.content, 150)}
- Confidence: ${lastRound.responses.claude.confidence}%
- Key argument: ${this.extractKeyPoint(lastRound.responses.claude.content)}

**🌟 Gemini:** ${this.truncateText(lastRound.responses.gemini.content, 150)}
- Confidence: ${lastRound.responses.gemini.confidence}%
- Key argument: ${this.extractKeyPoint(lastRound.responses.gemini.content)}

### Disagreement Analysis:
- Core conflict: ${disagreement.core_conflict}
- Type: ${disagreement.disagreement_type}
- Resolvable: ${disagreement.resolvability_score}/10

### Resources Used:
- Tokens: ${costSummary?.tokens_used.toLocaleString() || 'Unknown'}
- Cost: $${costSummary?.total_cost_usd.toFixed(4) || '0.0000'}/$${session.max_cost_usd}
- Rounds completed: ${session.rounds.length}/${session.max_rounds}

### Your Options:
1. Continue 2 more rounds
2. Continue until consensus (risky!)
3. Accept GPT's answer
4. Accept Claude's answer  
5. Accept Gemini's answer
6. Request synthesis and stop
7. Abort and handle manually`;
  }

  async getDebateLog(sessionId: string, format: 'markdown' | 'plain_text' = 'markdown'): Promise<string | null> {
    this.ensureInitialized();
    const session = await this.sessionStore.get(sessionId);
    if (!session) return null;

    if (format === 'plain_text') {
      return this.formatDebateLogPlainText(session);
    } else {
      return this.formatDebateLogMarkdown(session);
    }
  }

  private formatDebateLogMarkdown(session: DebateSession): string {
    const costBreakdown = this.costController.getCostBreakdown(session.id);
    
    let log = `# 🤖 AI Konsensus-panel Debatt\n\n`;
    log += `**Fråga:** ${session.question}\n\n`;
    if (session.context) {
      log += `**Kontext:** ${session.context}\n\n`;
    }
    log += `**Session ID:** \`${session.id}\`\n`;
    log += `**Skapad:** ${session.created_at.toLocaleString('sv-SE')}\n`;
    log += `**Status:** ${session.status}\n`;
    log += `**Strategi:** ${session.strategy}\n\n`;

    log += `## 📊 Sammanfattning\n\n`;
    log += `- **Antal rundar:** ${session.rounds.length}/${session.max_rounds}\n`;
    log += `- **Total kostnad:** $${costBreakdown?.total_cost_usd.toFixed(4) || '0.0000'}\n`;
    log += `- **Totala tokens:** ${costBreakdown?.tokens_used.toLocaleString() || '0'}\n`;
    log += `- **Final konsensus:** ${session.rounds.length > 0 ? (session.rounds[session.rounds.length-1]!.consensus_score * 100).toFixed(1) + '%' : 'N/A'}\n\n`;

    session.rounds.forEach((round, index) => {
      log += `## 🔄 Runda ${round.round_number}\n\n`;
      log += `**Tidsstämpel:** ${round.timestamp.toLocaleString('sv-SE')}\n`;
      log += `**Konsensus-poäng:** ${(round.consensus_score * 100).toFixed(1)}%\n`;
      log += `**Kostnad:** $${round.cost_usd.toFixed(4)}\n`;
      log += `**Tokens:** ${round.tokens_used.toLocaleString()}\n\n`;

      log += `### 🤖 GPT-4o (OpenAI)\n`;
      log += `**Säkerhet:** ${round.responses.openai.confidence}%\n`;
      log += `**Modell:** ${round.responses.openai.model}\n`;
      log += `**Kostnad:** $${round.responses.openai.cost_usd.toFixed(4)}\n\n`;
      log += `**Svar:**\n${round.responses.openai.content}\n\n---\n\n`;

      log += `### 🧠 Claude Sonnet 4 (Anthropic)\n`;
      log += `**Säkerhet:** ${round.responses.claude.confidence}%\n`;
      log += `**Modell:** ${round.responses.claude.model}\n`;
      log += `**Kostnad:** $${round.responses.claude.cost_usd.toFixed(4)}\n\n`;
      log += `**Svar:**\n${round.responses.claude.content}\n\n---\n\n`;

      log += `### 🌟 Gemini (Google)\n`;
      log += `**Säkerhet:** ${round.responses.gemini.confidence}%\n`;
      log += `**Modell:** ${round.responses.gemini.model}\n`;
      log += `**Kostnad:** $${round.responses.gemini.cost_usd.toFixed(4)}\n\n`;
      log += `**Svar:**\n${round.responses.gemini.content}\n\n`;

      if (index < session.rounds.length - 1) {
        log += `---\n\n`;
      }
    });

    if (costBreakdown) {
      log += `\n## 💰 Detaljerad kostnadsammanställning\n\n`;
      log += `**Total kostnad:** $${costBreakdown.total_cost_usd.toFixed(4)}\n\n`;
      log += `**Per AI:**\n`;
      log += `- OpenAI: $${costBreakdown.by_model.openai.toFixed(4)}\n`;
      log += `- Claude: $${costBreakdown.by_model.claude.toFixed(4)}\n`;
      log += `- Gemini: $${costBreakdown.by_model.gemini.toFixed(4)}\n\n`;
      log += `**Per runda:**\n`;
      costBreakdown.by_round.forEach((cost, i) => {
        log += `- Runda ${i+1}: $${cost.toFixed(4)}\n`;
      });
    }

    log += `\n---\n\n*Genererat av Phone-a-Friend MCP v2 - AI Konsensus Panel*`;
    
    return log;
  }

  private formatDebateLogPlainText(session: DebateSession): string {
    const costBreakdown = this.costController.getCostBreakdown(session.id);
    
    let log = `AI KONSENSUS-PANEL DEBATT\n`;
    log += `${'='.repeat(50)}\n\n`;
    log += `FRÅGA: ${session.question}\n\n`;
    if (session.context) {
      log += `KONTEXT: ${session.context}\n\n`;
    }
    log += `SESSION ID: ${session.id}\n`;
    log += `SKAPAD: ${session.created_at.toLocaleString('sv-SE')}\n`;
    log += `STATUS: ${session.status}\n`;
    log += `STRATEGI: ${session.strategy}\n\n`;

    log += `SAMMANFATTNING:\n`;
    log += `- Antal rundar: ${session.rounds.length}/${session.max_rounds}\n`;
    log += `- Total kostnad: $${costBreakdown?.total_cost_usd.toFixed(4) || '0.0000'}\n`;
    log += `- Totala tokens: ${costBreakdown?.tokens_used.toLocaleString() || '0'}\n`;
    log += `- Final konsensus: ${session.rounds.length > 0 ? (session.rounds[session.rounds.length-1]!.consensus_score * 100).toFixed(1) + '%' : 'N/A'}\n\n`;

    session.rounds.forEach((round, index) => {
      log += `${'='.repeat(20)} RUNDA ${round.round_number} ${'='.repeat(20)}\n\n`;
      log += `Tidsstämpel: ${round.timestamp.toLocaleString('sv-SE')}\n`;
      log += `Konsensus-poäng: ${(round.consensus_score * 100).toFixed(1)}%\n`;
      log += `Kostnad: $${round.cost_usd.toFixed(4)}\n`;
      log += `Tokens: ${round.tokens_used.toLocaleString()}\n\n`;

      log += `GPT-4o (OpenAI) - Säkerhet: ${round.responses.openai.confidence}%\n`;
      log += `${'-'.repeat(50)}\n`;
      log += `${round.responses.openai.content}\n\n`;

      log += `Claude Sonnet 4 (Anthropic) - Säkerhet: ${round.responses.claude.confidence}%\n`;
      log += `${'-'.repeat(50)}\n`;
      log += `${round.responses.claude.content}\n\n`;

      log += `Gemini (Google) - Säkerhet: ${round.responses.gemini.confidence}%\n`;
      log += `${'-'.repeat(50)}\n`;
      log += `${round.responses.gemini.content}\n\n`;
    });

    if (costBreakdown) {
      log += `${'='.repeat(30)} KOSTNADER ${'='.repeat(30)}\n\n`;
      log += `Total kostnad: $${costBreakdown.total_cost_usd.toFixed(4)}\n\n`;
      log += `Per AI:\n`;
      log += `- OpenAI: $${costBreakdown.by_model.openai.toFixed(4)}\n`;
      log += `- Claude: $${costBreakdown.by_model.claude.toFixed(4)}\n`;
      log += `- Gemini: $${costBreakdown.by_model.gemini.toFixed(4)}\n\n`;
      log += `Per runda:\n`;
      costBreakdown.by_round.forEach((cost, i) => {
        log += `- Runda ${i+1}: $${cost.toFixed(4)}\n`;
      });
    }

    log += `\n${'-'.repeat(70)}\n`;
    log += `Genererat av Phone-a-Friend MCP v2 - AI Konsensus Panel`;
    
    return log;
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
}