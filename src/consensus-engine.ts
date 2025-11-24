import {
  DebateRound,
  DebateSession,
  PhoneAFriendParams,
  PhoneAFriendResult,
  DisagreementReport,
  AIResponse,
  ContinueDebateParams,
  PeerReviewSummary,
  ConsensusBreakdownSummary,
  ChairmanSynthesisSummary
} from './types.js';
import { AIClientManager } from './ai-clients.js';
import { CostController } from './cost-controller.js';
import { SessionStore, FileSessionStore } from './session-store.js';
// Nya avancerade funktioner (llm-council inspirerade)
import { ConsensusAnalyzer, ConsensusBreakdown } from './consensus-breakdown.js';
import { ChairmanSynthesizer, SynthesisResult } from './chairman-synthesizer.js';
import { PeerReviewSystem, PeerReviewResult } from './peer-review.js';

export class ConsensusEngine {
  private sessionStore: SessionStore;
  private aiManager: AIClientManager;
  private costController: CostController;
  private initialized: boolean = false;

  // Nya avancerade system (llm-council inspirerade)
  private consensusAnalyzer: ConsensusAnalyzer;
  private chairmanSynthesizer: ChairmanSynthesizer;
  private peerReviewSystem: PeerReviewSystem;

  constructor(aiManager: AIClientManager, sessionStore?: SessionStore) {
    this.aiManager = aiManager;
    this.costController = new CostController();
    this.sessionStore = sessionStore || new FileSessionStore();

    // Initiera avancerade system
    this.consensusAnalyzer = new ConsensusAnalyzer();
    this.chairmanSynthesizer = new ChairmanSynthesizer(aiManager);
    this.peerReviewSystem = new PeerReviewSystem(aiManager);
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
      session.status = 'user_accepted';
      session.updated_at = new Date();
      await this.sessionStore.set(params.session_id, session);

      return {
        status: 'user_accepted',
        final_answer: selectedResponse.content,
        debate_log: session.rounds,
        cost_summary: this.costController.getCostBreakdown(params.session_id)!,
        session_id: params.session_id
      };
    }

    if (params.instruction === 'synthesize_and_stop') {
      const lastRound = session.rounds[session.rounds.length - 1];
      const synthesized = this.synthesizeFinalAnswer(lastRound!);
      session.status = 'manually_resolved';
      session.updated_at = new Date();
      await this.sessionStore.set(params.session_id, session);

      return {
        status: 'manually_resolved',
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
      let prompt = `Du deltar i en AI-konsensuspanel för att besvara denna fråga:

**Fråga:** ${session.question}`;

      if (session.context) {
        prompt += `\n\n**Kontext:** ${session.context}`;
      }

      prompt += `\n\nVänligen ge ditt bästa svar på denna fråga. Var grundlig men koncis. Om du har en konfidensnivå i ditt svar, vänligen ange den som en procentsats.

**VIKTIGT:** Svara på SVENSKA.`;

      return prompt;
    }

    const lastRound = session.rounds[roundNumber - 2]; // -2 because array is 0-indexed and we want previous round
    if (!lastRound) {
      throw new Error('Previous round not found');
    }

    const instruction = this.getDebateInstruction(roundNumber);

    return `Du är i runda ${roundNumber} av en AI-konsensuspanel som diskuterar denna fråga:

**Fråga:** ${session.question}

**Tidigare svar från runda ${roundNumber - 1}:**

**OpenAI (GPT):** ${lastRound.responses.openai.content}
(Konfidens: ${lastRound.responses.openai.confidence}%)

**Google (Gemini):** ${lastRound.responses.gemini.content}
(Konfidens: ${lastRound.responses.gemini.confidence}%)

**Anthropic (Claude):** ${lastRound.responses.claude.content}
(Konfidens: ${lastRound.responses.claude.confidence}%)

**Instruktioner för denna runda:**
${instruction}

Vänligen ge ditt svar, och bemöt de andra AI:ernas poänger där det är relevant. Inkludera din konfidensnivå som en procentsats.

**VIKTIGT:** Svara på SVENSKA.`;
  }

  private getDebateInstruction(round: number): string {
    const instructions: Record<number, string> = {
      2: "Analysera de andra svaren. Var håller du med eller inte? Ge bevis eller resonemang för din ståndpunkt. Fokusera på att identifiera de starkaste argumenten.",
      3: "Detta är den sista rundan. Driva mot konsensus genom att hitta gemensam mark, eller tydligt ange din fundamentala oenighet och varför den inte kan lösas.",
      4: "Fokusera på syntes. Vad kan alla parter hålla med om? Försök bygga ett enhetligt svar som inkorporerar de bästa insikterna från alla perspektiv.",
      5: "Sista chansen för konsensus. Antingen konvergera till ett enhetligt svar eller tydligt formulera varför oenigheten är oöverstiglig."
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
    // Enkel fallback för snabb syntes (används när vi inte vill ha async)
    const responses = [
      round.responses.openai.content,
      round.responses.gemini.content,
      round.responses.claude.content
    ];

    // Find the longest response as the base
    const longestResponse = responses.reduce((a, b) => a.length > b.length ? a : b);

    return `Baserat på AI-panelens konsensus:\n\n${longestResponse}\n\n(Detta svar representerar AI-panelens konvergerade position)`;
  }

  /**
   * Avancerad syntes med Chairman (kräver extra API-anrop)
   * Använder en AI som "ordförande" för att skapa en intelligent syntes
   */
  async synthesizeWithChairman(
    session: DebateSession,
    round: DebateRound,
    chairman?: 'openai' | 'gemini' | 'claude'
  ): Promise<SynthesisResult> {
    // Välj optimal ordförande om inte specificerad
    const selectedChairman = chairman ||
      this.chairmanSynthesizer.selectOptimalChairman(session, round);

    console.error(`[ConsensusEngine] Using chairman synthesis with ${selectedChairman}...`);

    const result = await this.chairmanSynthesizer.synthesize(session, round, selectedChairman);

    // Spara syntesen i session
    session.chairman_synthesis = {
      chairman: result.chairman,
      synthesized_answer: result.synthesized_answer,
      confidence: result.confidence,
      key_agreements: result.key_agreements,
      key_disagreements: result.key_disagreements,
      cost_usd: result.cost_usd,
      timestamp: new Date()
    };

    // Lägg till kostnad
    this.costController.addCost(
      session.id,
      result.chairman,
      result.cost_usd,
      result.tokens_used,
      round.round_number
    );

    session.current_cost_usd += result.cost_usd;
    await this.sessionStore.set(session.id, session);

    return result;
  }

  /**
   * Genomför peer review av en runda (kräver extra API-anrop)
   * Varje AI rankar de andras svar anonymt
   */
  async conductPeerReview(
    session: DebateSession,
    round: DebateRound
  ): Promise<PeerReviewResult> {
    console.error(`[ConsensusEngine] Conducting peer review for round ${round.round_number}...`);

    const result = await this.peerReviewSystem.conductPeerReview(session, round);

    // Spara peer review i session
    if (!session.peer_reviews) {
      session.peer_reviews = [];
    }

    session.peer_reviews.push({
      round_number: round.round_number,
      winner: result.winner,
      consensus_on_winner: result.consensus_on_winner,
      rankings: result.aggregated_rankings.map(r => ({
        provider: r.original_provider,
        avg_position: r.avg_position,
        votes_for_first: r.votes_for_first
      })),
      cost_usd: result.total_cost_usd,
      timestamp: new Date()
    });

    // Lägg till kostnader
    for (const review of result.reviews) {
      this.costController.addCost(
        session.id,
        review.reviewer,
        review.cost_usd,
        review.tokens_used,
        round.round_number
      );
    }

    session.current_cost_usd += result.total_cost_usd;
    await this.sessionStore.set(session.id, session);

    return result;
  }

  /**
   * Analysera konsensus med detaljerad breakdown (GRATIS - ingen AI-kostnad!)
   */
  analyzeConsensusBreakdown(round: DebateRound): ConsensusBreakdown {
    return this.consensusAnalyzer.analyzeConsensus(round.responses);
  }

  /**
   * Spara konsensusanalys i session
   */
  async saveConsensusBreakdown(
    session: DebateSession,
    round: DebateRound
  ): Promise<ConsensusBreakdown> {
    const breakdown = this.analyzeConsensusBreakdown(round);

    session.consensus_breakdown = {
      round_number: round.round_number,
      overall_score: breakdown.overall_score,
      components: breakdown.components,
      agreement_points: breakdown.agreement_points,
      disagreement_points: breakdown.disagreement_points.map(d => d.point),
      timestamp: new Date()
    };

    await this.sessionStore.set(session.id, session);
    return breakdown;
  }

  /**
   * Hämta formaterad konsensusanalys
   */
  getFormattedConsensusBreakdown(round: DebateRound): string {
    const breakdown = this.analyzeConsensusBreakdown(round);
    return this.consensusAnalyzer.formatBreakdown(breakdown);
  }

  /**
   * Hämta formaterad peer review
   */
  getFormattedPeerReview(result: PeerReviewResult): string {
    return this.peerReviewSystem.formatPeerReviewResult(result);
  }

  /**
   * Hämta formaterad chairman synthesis
   */
  getFormattedSynthesis(result: SynthesisResult): string {
    return this.chairmanSynthesizer.formatSynthesisResult(result);
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

  async getDebateLog(sessionId: string, format: 'markdown' | 'plain_text' | 'html' = 'html'): Promise<string | null> {
    this.ensureInitialized();
    const session = await this.sessionStore.get(sessionId);
    if (!session) return null;

    if (format === 'plain_text') {
      return this.formatDebateLogPlainText(session);
    } else if (format === 'html') {
      return this.formatDebateLogHTML(session);
    } else {
      return this.formatDebateLogMarkdown(session);
    }
  }

  private formatDebateLogMarkdown(session: DebateSession): string {
    const costBreakdown = this.costController.getCostBreakdown(session.id);
    const startTime = session.created_at.toLocaleString('sv-SE');
    const interactiveMode = session.status === 'paused' ? 'Interactive Mode' : 'Auto Mode';

    let log = `# 🇪🇺 ${session.question.substring(0, 60)}${session.question.length > 60 ? '...' : ''} - AI-paneldebatt\n\n`;
    log += `**Fråga:** ${session.question}\n\n`;
    if (session.context) {
      log += `**Kontext:** ${session.context}\n\n`;
    }
    log += `**Startad:** ${startTime}\n`;
    log += `**Status:** ${this.getStatusEmoji(session.status)} ${session.status.charAt(0).toUpperCase() + session.status.slice(1)} (${interactiveMode})\n`;
    log += `**Konsensus efter Runda ${session.rounds.length}:** ${session.rounds.length > 0 ? (session.rounds[session.rounds.length-1]!.consensus_score * 100).toFixed(1) + '%' : 'N/A'}\n\n`;
    log += `---\n\n`;

    // Round-by-round analysis
    session.rounds.forEach((round, index) => {
      const roundTitle = index === 0 ? 'RUNDA 1 - Grundläggande positioner' :
                        index === session.rounds.length - 1 ? `RUNDA ${round.round_number} - Slutgiltig konsensus (FINAL)` :
                        `RUNDA ${round.round_number} - Fördjupad analys och kritik`;

      log += `## 🔄 ${roundTitle}\n\n`;
      log += `**Kostnad:** $${round.cost_usd.toFixed(4)} | **Tokens:** ${round.tokens_used.toLocaleString()}\n\n`;

      // OpenAI response
      const openaiConfChange = index > 0 ? this.getConfidenceChange(session.rounds[index-1]!.responses.openai.confidence, round.responses.openai.confidence) : '';
      log += `### 🤖 ${this.getModelDisplayName(round.responses.openai.model)} (${round.responses.openai.confidence}% konfidens) ${openaiConfChange}\n\n`;
      log += `${round.responses.openai.content}\n\n`;
      log += `---\n\n`;

      // Claude response
      const claudeConfChange = index > 0 ? this.getConfidenceChange(session.rounds[index-1]!.responses.claude.confidence, round.responses.claude.confidence) : '';
      log += `### 🧠 ${this.getModelDisplayName(round.responses.claude.model)} (${round.responses.claude.confidence}% konfidens) ${claudeConfChange}\n\n`;
      log += `${round.responses.claude.content}\n\n`;
      log += `---\n\n`;

      // Gemini response
      const geminiConfChange = index > 0 ? this.getConfidenceChange(session.rounds[index-1]!.responses.gemini.confidence, round.responses.gemini.confidence) : '';
      log += `### 🌟 ${this.getModelDisplayName(round.responses.gemini.model)} (${round.responses.gemini.confidence}% konfidens) ${geminiConfChange}\n\n`;
      log += `${round.responses.gemini.content}\n\n`;

      // Comparison section after each round
      if (index < session.rounds.length - 1) {
        log += `---\n\n`;
      }

      log += `## 📊 Jämförelse efter Runda ${round.round_number}\n\n`;
      log += `**Konsensus:** ${(round.consensus_score * 100).toFixed(1)}%`;

      if (index > 0) {
        const prevConsensus = session.rounds[index-1]!.consensus_score * 100;
        const currentConsensus = round.consensus_score * 100;
        const change = currentConsensus - prevConsensus;
        const arrow = change > 0 ? '↑' : change < 0 ? '↓' : '→';
        log += ` (${arrow} ${change > 0 ? '+' : ''}${change.toFixed(1)}%)`;
      }
      log += `\n\n`;

      // Consensus analysis
      if (round.consensus_score > 0.7) {
        log += `**Analys:** 🟢 Stark konsensus - AI:erna är i stort sett överens\n\n`;
      } else if (round.consensus_score > 0.5) {
        log += `**Analys:** 🟡 Moderat konsensus - Vissa likheter men viktiga skillnader kvarstår\n\n`;
      } else {
        log += `**Analys:** 🔴 Svag konsensus - Betydande oenighet mellan AI:erna\n\n`;
      }

      // Confidence levels
      const avgConfidence = (round.responses.openai.confidence + round.responses.claude.confidence + round.responses.gemini.confidence) / 3;
      log += `**Genomsnittlig konfidens:** ${avgConfidence.toFixed(1)}%\n`;
      log += `- GPT: ${round.responses.openai.confidence}%\n`;
      log += `- Claude: ${round.responses.claude.confidence}%\n`;
      log += `- Gemini: ${round.responses.gemini.confidence}%\n\n`;

      log += `**Kostnad hittills:** $${this.sumCostsUpToRound(session.rounds, index).toFixed(4)}\n\n`;
      log += `---\n\n`;
    });

    // Final analysis section
    if (session.rounds.length > 1) {
      log += `## 📊 SLUTANALYS\n\n`;

      const firstConsensus = session.rounds[0]!.consensus_score * 100;
      const lastConsensus = session.rounds[session.rounds.length - 1]!.consensus_score * 100;
      const consensusChange = lastConsensus - firstConsensus;

      log += `**Konsensusutveckling:**\n`;
      session.rounds.forEach((round, i) => {
        const arrow = i === 0 ? '🏁' : consensusChange > 0 ? '📈' : consensusChange < 0 ? '📉' : '➡️';
        log += `- Runda ${i+1}: ${arrow} ${(round.consensus_score * 100).toFixed(1)}%\n`;
      });
      log += `\n`;

      if (consensusChange > 5) {
        log += `**Resultat:** AI:erna konvergerade mot större enighet (+${consensusChange.toFixed(1)}%)\n\n`;
      } else if (consensusChange < -5) {
        log += `**Resultat:** AI:erna divergerade och blev mer oeniga (${consensusChange.toFixed(1)}%)\n\n`;
      } else {
        log += `**Resultat:** Konsensus förblev relativt stabil (${consensusChange > 0 ? '+' : ''}${consensusChange.toFixed(1)}%)\n\n`;
      }

      // Confidence evolution
      log += `**Konfidensutveckling:**\n`;
      log += `\`\`\`\n`;
      session.rounds.forEach(round => {
        log += `Runda ${round.round_number}: GPT ${round.responses.openai.confidence}% | Claude ${round.responses.claude.confidence}% | Gemini ${round.responses.gemini.confidence}%\n`;
      });
      log += `\`\`\`\n\n`;
    }

    // Cost breakdown
    if (costBreakdown) {
      log += `## 💰 FINAL KOSTNAD\n\n`;
      log += `**Total kostnad:** $${costBreakdown.total_cost_usd.toFixed(4)} (~${(costBreakdown.total_cost_usd * 10).toFixed(0)} öre)\n`;
      log += `**Total tokens:** ${costBreakdown.tokens_used.toLocaleString()}\n\n`;
      log += `**Per AI (hela debatten):**\n`;
      const totalCost = costBreakdown.total_cost_usd;
      const lastRound = session.rounds[session.rounds.length - 1];
      if (lastRound) {
        log += `- OpenAI (${lastRound.responses.openai.model}): $${costBreakdown.by_model.openai.toFixed(4)} (${((costBreakdown.by_model.openai/totalCost)*100).toFixed(0)}%)\n`;
        log += `- Claude (${lastRound.responses.claude.model}): $${costBreakdown.by_model.claude.toFixed(4)} (${((costBreakdown.by_model.claude/totalCost)*100).toFixed(0)}%)\n`;
        log += `- Gemini (${lastRound.responses.gemini.model}): $${costBreakdown.by_model.gemini.toFixed(4)} (${((costBreakdown.by_model.gemini/totalCost)*100).toFixed(0)}%)\n\n`;
      }

      log += `**Per runda:**\n`;
      costBreakdown.by_round.forEach((cost, i) => {
        const round = session.rounds[i];
        log += `- Runda ${i+1}: $${cost.toFixed(4)}`;
        if (round) {
          const roundConsensus = (round.consensus_score * 100).toFixed(1);
          log += ` (konsensus: ${roundConsensus}%)`;
        }
        log += `\n`;
      });
    }

    log += `\n---\n\n`;
    const statusHeader = session.status === 'consensus' ? 'SLUTFÖRD MED KONSENSUS (≥85%)' :
                        session.status === 'user_accepted' ? 'AVSLUTAD - ANVÄNDAREN ACCEPTERADE ETT SVAR' :
                        session.status === 'manually_resolved' ? 'AVSLUTAD - ANVÄNDAREN SYNTETISERADE POSITIONERNA' :
                        'AVSLUTAD';
    log += `## ✅ DEBATT ${statusHeader}\n\n`;
    log += `**Session ID:** \`${session.id}\`\n`;
    log += `**Varaktighet:** ${this.calculateDuration(session)}\n`;
    log += `**Antal rundor:** ${session.rounds.length}/${session.max_rounds}\n`;
    log += `**Slutlig konsensusnivå:** ${session.rounds.length > 0 ? (session.rounds[session.rounds.length-1]!.consensus_score * 100).toFixed(1) + '%' : 'N/A'}\n`;
    log += `**Läge:** ${interactiveMode}\n`;

    return log;
  }

  private getStatusEmoji(status: string): string {
    const emojis: {[key: string]: string} = {
      'active': '🔄',
      'consensus': '✅',
      'user_accepted': '👤',
      'manually_resolved': '🤝',
      'deadlock': '🚨',
      'paused': '⏸️',
      'failed': '❌'
    };
    return emojis[status] || '❓';
  }

  private getModelDisplayName(model: string): string {
    if (model.includes('gpt')) return 'GPT-4o';
    if (model.includes('claude')) return 'Claude Sonnet 4';
    if (model.includes('gemini')) return 'Gemini';
    return model;
  }

  private getConfidenceChange(prev: number, current: number): string {
    if (prev === current) return '';
    const diff = current - prev;
    if (diff > 0) return `↑${diff > 5 ? '↑' : ''}`;
    if (diff < 0) return `↓${diff < -5 ? '↓' : ''}`;
    return '';
  }

  private sumCostsUpToRound(rounds: DebateRound[], upToIndex: number): number {
    return rounds.slice(0, upToIndex + 1).reduce((sum, r) => sum + r.cost_usd, 0);
  }

  private calculateDuration(session: DebateSession): string {
    const start = session.created_at.getTime();
    const end = session.updated_at.getTime();
    const durationMs = end - start;
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);

    if (minutes > 0) {
      return `~${minutes} minut${minutes > 1 ? 'er' : ''}`;
    } else {
      return `~${seconds} sekunder`;
    }
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

  private formatDebateLogHTML(session: DebateSession): string {
    const costBreakdown = this.costController.getCostBreakdown(session.id);
    const startTime = session.created_at.toLocaleString('sv-SE');
    const questionPreview = session.question.substring(0, 60) + (session.question.length > 60 ? '...' : '');

    // Calculate consensus trend
    const firstConsensus = session.rounds[0]?.consensus_score * 100 || 0;
    const lastConsensus = session.rounds[session.rounds.length - 1]?.consensus_score * 100 || 0;
    const consensusTrend = lastConsensus - firstConsensus;

    let html = `<!DOCTYPE html>
<html lang="sv">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(questionPreview)} - AI-paneldebatt</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif;
            line-height: 1.65;
            color: #1a1a1a;
            background: #fafafa;
            padding: 40px 20px;
        }

        .container {
            max-width: 820px;
            margin: 0 auto;
            background: white;
            padding: 70px 50px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }

        h1 {
            font-size: 2.4em;
            font-weight: 700;
            color: #000;
            margin-bottom: 8px;
            letter-spacing: -0.03em;
            line-height: 1.2;
        }

        h2 {
            font-size: 1.7em;
            font-weight: 600;
            color: #000;
            margin-top: 64px;
            margin-bottom: 20px;
            letter-spacing: -0.02em;
            padding-bottom: 8px;
            border-bottom: 2px solid #e5e5e5;
        }

        h3 {
            font-size: 1.3em;
            font-weight: 600;
            color: #1a1a1a;
            margin-top: 40px;
            margin-bottom: 16px;
        }

        .subtitle {
            font-size: 1.15em;
            color: #666;
            margin-bottom: 48px;
            font-weight: 400;
        }

        .meta-info {
            background: #fffbeb;
            padding: 24px;
            margin: 32px 0;
            border-left: 3px solid #f59e0b;
        }

        .observation {
            background: #f0f9ff;
            padding: 24px;
            margin: 28px 0;
            border-left: 3px solid #3b82f6;
        }

        .ai-response {
            background: #fafafa;
            padding: 28px;
            margin: 24px 0;
            border-left: 4px solid #d0d0d0;
            line-height: 1.8;
        }

        .ai-gpt .ai-response {
            border-left-color: #10a37f;
            background: #f7fcfa;
        }

        .ai-claude .ai-response {
            border-left-color: #d97706;
            background: #fffbf5;
        }

        .ai-gemini .ai-response {
            border-left-color: #2563eb;
            background: #f7f9fc;
        }

        .ai-gpt h3 {
            color: #0d8c6d;
        }

        .ai-claude h3 {
            color: #c2640f;
        }

        .ai-gemini h3 {
            color: #1d4ed8;
        }

        .round-header {
            background: #f5f5f5;
            padding: 24px;
            margin: 52px 0 28px 0;
            border-left: 4px solid #404040;
        }

        .round-header h3 {
            margin: 0 0 10px 0;
            color: #000;
            font-size: 1.25em;
        }

        .round-header p {
            margin: 0;
            color: #555;
            font-size: 0.95em;
        }

        .stats {
            background: #f9fafb;
            padding: 28px;
            margin: 32px 0;
            border: 1px solid #e5e7eb;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin: 32px 0;
            font-size: 0.95em;
        }

        th, td {
            padding: 14px 16px;
            text-align: left;
            border-bottom: 1px solid #e5e5e5;
        }

        th {
            background: #fafafa;
            color: #1a1a1a;
            font-weight: 600;
            font-size: 0.9em;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        tr:hover {
            background: #fafafa;
        }

        .conclusion {
            background: #f9fafb;
            padding: 36px;
            margin: 52px 0;
            border-left: 4px solid #374151;
            border: 1px solid #e5e7eb;
        }

        .conclusion h3 {
            margin-top: 0;
            color: #000;
        }

        .footer {
            text-align: center;
            margin-top: 80px;
            padding-top: 40px;
            border-top: 1px solid #e5e5e5;
            color: #999;
        }

        hr {
            border: none;
            border-top: 1px solid #e5e5e5;
            margin: 64px 0;
        }

        .version-badge {
            display: inline-block;
            background: #f5f5f5;
            color: #525252;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 0.85em;
            margin-left: 8px;
            font-weight: 500;
            border: 1px solid #e5e5e5;
        }

        .confidence {
            color: #059669;
            font-weight: 600;
        }

        .consensus {
            color: #dc2626;
            font-weight: 600;
        }

        p {
            margin: 16px 0;
            color: #2a2a2a;
        }

        code {
            background: #f5f5f5;
            color: #1a1a1a;
            padding: 3px 8px;
            border-radius: 4px;
            font-family: 'SF Mono', 'Consolas', monospace;
            font-size: 0.9em;
            border: 1px solid #e5e5e5;
        }

        strong {
            color: #000;
            font-weight: 600;
        }

        .trend-up { color: #059669; }
        .trend-down { color: #dc2626; }
        .trend-stable { color: #6b7280; }
    </style>
</head>
<body>
    <div class="container">
        <h1>${this.escapeHtml(questionPreview)}</h1>
        <p class="subtitle">AI-paneldebatt med GPT-4o, Claude och Gemini</p>

        <div class="meta-info">
            <p><strong>Fråga:</strong> ${this.escapeHtml(session.question)}</p>
            ${session.context ? `<p><strong>Kontext:</strong> ${this.escapeHtml(session.context)}</p>` : ''}
            <p><strong>Startad:</strong> ${startTime}</p>
            <p><strong>Status:</strong> ${this.getStatusText(session.status)}</p>
            <p><strong>Antal rundor:</strong> ${session.rounds.length}/${session.max_rounds}</p>
            <p><strong>Total kostnad:</strong> $${costBreakdown?.total_cost_usd.toFixed(4) || '0'} (~${((costBreakdown?.total_cost_usd || 0) * 10).toFixed(0)} öre)</p>
        </div>

        <h2>SAMMANFATTNING</h2>

        <div class="stats">
            <p><strong>Konsensusutveckling:</strong></p>
            <p><code>Start: ${firstConsensus.toFixed(1)}% → Slut: ${lastConsensus.toFixed(1)}%
            <span class="${consensusTrend > 5 ? 'trend-up' : consensusTrend < -5 ? 'trend-down' : 'trend-stable'}">
            ${consensusTrend > 0 ? '↑' : consensusTrend < 0 ? '↓' : '→'} ${consensusTrend > 0 ? '+' : ''}${consensusTrend.toFixed(1)}%
            </span></code></p>

            <p><strong>Konfidensutveckling:</strong></p>
            <table>
                <thead>
                    <tr>
                        <th>Runda</th>
                        <th>GPT-4o</th>
                        <th>Claude</th>
                        <th>Gemini</th>
                        <th>Konsensus</th>
                    </tr>
                </thead>
                <tbody>`;

    session.rounds.forEach(round => {
      html += `
                    <tr>
                        <td><strong>${round.round_number}</strong></td>
                        <td>${round.responses.openai.confidence}%</td>
                        <td>${round.responses.claude.confidence}%</td>
                        <td>${round.responses.gemini.confidence}%</td>
                        <td class="${round.consensus_score > 0.7 ? 'confidence' : round.consensus_score > 0.5 ? '' : 'consensus'}">${(round.consensus_score * 100).toFixed(1)}%</td>
                    </tr>`;
    });

    html += `
                </tbody>
            </table>
        </div>

        <h2>DEBATTENS FÖRLOPP</h2>`;

    // Generate round-by-round breakdown
    session.rounds.forEach((round, index) => {
      const roundTitle = index === 0 ? 'Grundläggande positioner' :
                        index === session.rounds.length - 1 ? 'Slutgiltig konsensus (FINAL)' :
                        `Fördjupad analys runda ${round.round_number}`;

      const avgConf = ((round.responses.openai.confidence + round.responses.claude.confidence + round.responses.gemini.confidence) / 3).toFixed(1);

      html += `
        <div class="round-header">
            <h3>Runda ${round.round_number}: ${roundTitle}</h3>
            <p><span class="consensus">Konsensus: ${(round.consensus_score * 100).toFixed(1)}%</span> |
               <span class="confidence">Genomsnittlig konfidens: ${avgConf}%</span> |
               Kostnad: $${round.cost_usd.toFixed(4)}</p>
        </div>

        <div class="ai-gpt">
            <h3>🤖 GPT-4o <span class="version-badge">${round.responses.openai.confidence}% konfidens</span></h3>
            <div class="ai-response">
                ${this.formatTextToHTML(round.responses.openai.content)}
            </div>
        </div>

        <div class="ai-claude">
            <h3>🧠 Claude Sonnet 4 <span class="version-badge">${round.responses.claude.confidence}% konfidens</span></h3>
            <div class="ai-response">
                ${this.formatTextToHTML(round.responses.claude.content)}
            </div>
        </div>

        <div class="ai-gemini">
            <h3>🌟 Gemini <span class="version-badge">${round.responses.gemini.confidence}% konfidens</span></h3>
            <div class="ai-response">
                ${this.formatTextToHTML(round.responses.gemini.content)}
            </div>
        </div>

        ${index < session.rounds.length - 1 ? '<hr>' : ''}`;
    });

    // Observations and Analysis Section
    html += this.generateObservationsSection(session);

    // Cost breakdown
    if (costBreakdown) {
      html += `
        <h2>KOSTNADSSAMMANSTÄLLNING</h2>

        <div class="stats">
            <p><strong>Total kostnad:</strong> $${costBreakdown.total_cost_usd.toFixed(4)} (~${(costBreakdown.total_cost_usd * 10).toFixed(0)} öre)</p>
            <p><strong>Totala tokens:</strong> ${costBreakdown.tokens_used.toLocaleString()}</p>

            <h3 style="margin-top: 24px;">Per AI (hela debatten):</h3>
            <table>
                <thead>
                    <tr>
                        <th>AI</th>
                        <th>Kostnad</th>
                        <th>Andel</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>OpenAI (GPT-4o)</td>
                        <td>$${costBreakdown.by_model.openai.toFixed(4)}</td>
                        <td>${((costBreakdown.by_model.openai / costBreakdown.total_cost_usd) * 100).toFixed(0)}%</td>
                    </tr>
                    <tr>
                        <td>Anthropic (Claude)</td>
                        <td>$${costBreakdown.by_model.claude.toFixed(4)}</td>
                        <td>${((costBreakdown.by_model.claude / costBreakdown.total_cost_usd) * 100).toFixed(0)}%</td>
                    </tr>
                    <tr>
                        <td>Google (Gemini)</td>
                        <td>$${costBreakdown.by_model.gemini.toFixed(4)}</td>
                        <td>${((costBreakdown.by_model.gemini / costBreakdown.total_cost_usd) * 100).toFixed(0)}%</td>
                    </tr>
                </tbody>
            </table>
        </div>`;
    }

    // Footer with summary
    html += `
        <hr>

        <div class="footer">
            <p><strong>Debattens totala kostnad:</strong> $${costBreakdown?.total_cost_usd.toFixed(4) || '0'} (~${((costBreakdown?.total_cost_usd || 0) * 10).toFixed(0)} öre)</p>
            <p><strong>Varaktighet:</strong> ${this.calculateDuration(session)}</p>
            <p><strong>Status:</strong> ${this.getStatusText(session.status)}</p>
            <p><strong>Konsensus uppnådd:</strong> ${session.status === 'consensus' ? 'Ja (≥85%)' : 'Nej'} (slutlig nivå: ${lastConsensus.toFixed(1)}%)</p>
            <p><strong>Var det värt det:</strong> ${this.generateWorthItStatement(session)}</p>

            <p style="margin-top: 30px; font-size: 0.85em; color: #666;">
                Genererat av <strong>Phone-a-Friend MCP v2</strong><br>
                AI Konsensus Panel: GPT-4o, Claude Sonnet 4, Gemini<br>
                ${new Date().toLocaleString('sv-SE')}<br>
                Session ID: <code>${session.id}</code>
            </p>

            ${this.generateDebateQuote(session)}
        </div>
    </div>
</body>
</html>`;

    return html;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private formatTextToHTML(text: string): string {
    // Convert newlines to paragraphs, preserve basic formatting
    return text
      .split('\n\n')
      .map(para => `<p>${this.escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  private generateObservationsSection(session: DebateSession): string {
    // Calculate confidence and consensus trends
    const confidenceByRound = session.rounds.map(r => ({
      round: r.round_number,
      gpt: r.responses.openai.confidence,
      claude: r.responses.claude.confidence,
      gemini: r.responses.gemini.confidence,
      avg: (r.responses.openai.confidence + r.responses.claude.confidence + r.responses.gemini.confidence) / 3,
      consensus: r.consensus_score * 100
    }));

    const firstRound = confidenceByRound[0];
    const lastRound = confidenceByRound[confidenceByRound.length - 1];

    const confTrend = lastRound ? lastRound.avg - firstRound.avg : 0;
    const consTrend = lastRound ? lastRound.consensus - firstRound.consensus : 0;

    // Generate confidence progression string
    const confProgression = confidenceByRound.map(r => `${r.avg.toFixed(0)}%`).join(' → ');
    const consProgression = confidenceByRound.map(r => `${r.consensus.toFixed(0)}%`).join(' → ');

    let html = `
        <hr>

        <h2>OBSERVATIONER & LÄRDOMAR</h2>

        <div class="stats">
            <h3>Det Paradoxala Mönstret</h3>
            <p><code>Konfidens:  ${confProgression}  ${confTrend > 0 ? '↑'.repeat(Math.min(3, Math.ceil(confTrend / 10))) : confTrend < 0 ? '↓'.repeat(Math.min(3, Math.ceil(-confTrend / 10))) : '→'}</code></p>
            <p><code>Konsensus:  ${consProgression}  ${consTrend > 0 ? '↑'.repeat(Math.min(3, Math.ceil(consTrend / 10))) : consTrend < 0 ? '↓'.repeat(Math.min(3, Math.ceil(-consTrend / 10))) : '↕↕↕'}</code></p>

            <p><strong>Observation:</strong> ${this.generateConfidenceConsensusObservation(confTrend, consTrend)}</p>
        </div>

        <hr>

        <h2>SLUTSATS: VAD LÄRDE VI OSS?</h2>

        <h3>Om Frågan:</h3>
        <p>${this.generateQuestionInsight(session)}</p>

        <h3>Om AI-panelen:</h3>
        <p><strong>Vi är bra på att:</strong></p>
        <ul>
            <li>Identifiera olika perspektiv och nyanser</li>
            <li>Presentera välformulerade argument</li>
            <li>Upprätthålla respektfull diskussion</li>
            ${session.status === 'consensus' ? '<li>Nå sann konsensus genom konstruktiv debatt</li>' : '<li>Hålla fast vid våra övertygelser (kanske för hårt?)</li>'}
        </ul>

        <p><strong>Vi kunde göra bättre:</strong></p>
        <ul>
            <li>Faktiskt kompromissa när vi är oeniga</li>
            <li>Erkänna när frågan är subjektiv eller komplex</li>
            ${session.status !== 'consensus' ? '<li>Acceptera att "flera giltiga perspektiv" är OK</li>' : '<li>Nå konsensus snabbare utan att kompromissa kvalitet</li>'}
        </ul>

        <h3>Om Konsensusmätning:</h3>
        <p>${this.generateConsensusMeasurementInsight(session)}</p>

        <div class="conclusion">
            <h3>Den Ironiska Slutsatsen:</h3>
            <p>${this.generateIronicConclusion(session)}</p>
        </div>`;

    return html;
  }

  private generateConfidenceConsensusObservation(confTrend: number, consTrend: number): string {
    if (confTrend > 10 && consTrend < -10) {
      return 'Ju mer självsäkra AI:erna blev, desto mindre kunde de enas. Ett klassiskt mönster av ökande polarisering.';
    } else if (confTrend > 5 && consTrend > 5) {
      return 'Både självsäkerhet och konsensus ökade - ett positivt tecken på konstruktiv debatt där AI:erna lärde av varandra.';
    } else if (Math.abs(confTrend) < 5 && Math.abs(consTrend) < 5) {
      return 'Både konfidens och konsensus förblev stabila genom debatten - AI:erna höll fast vid sina ursprungliga positioner.';
    } else if (consTrend < -10) {
      return 'Konsensus minskade genom debatten. Djupare analys exponerade fundamental oenighet snarare än att lösa den.';
    } else {
      return 'Debattens dynamik visade ett komplext samspel mellan självsäkerhet och enighet.';
    }
  }

  private generateQuestionInsight(session: DebateSession): string {
    const complexity = session.rounds.length;
    const finalConsensus = session.rounds[session.rounds.length - 1]?.consensus_score || 0;

    if (session.status === 'consensus') {
      return `Efter ${complexity} ${complexity === 1 ? 'runda' : 'rundor'} nådde AI:erna äkta konsensus (${(finalConsensus * 100).toFixed(1)}%). Frågan hade tillräckligt tydliga parametrar för att möjliggöra enighet genom systematisk analys.`;
    } else if (finalConsensus > 0.6) {
      return `Trots ${complexity} ${complexity === 1 ? 'runda' : 'rundor'} av debatt nåddes ingen formell konsensus, men AI:erna visade betydande överensstämmelse (${(finalConsensus * 100).toFixed(1)}%). Frågan innehåller sannolikt både objektiva och subjektiva element.`;
    } else {
      return `${complexity} ${complexity === 1 ? 'runda' : 'rundor'} av intensiv debatt resulterade i fortsatt oenighet (${(finalConsensus * 100).toFixed(1)}% konsensus). Detta antyder att frågan är genuint komplex med flera giltiga perspektiv, eller att AI:erna värderar olika aspekter olika.`;
    }
  }

  private generateConsensusMeasurementInsight(session: DebateSession): string {
    const progression = session.rounds.map(r => (r.consensus_score * 100).toFixed(0) + '%').join(' → ');

    if (session.status === 'consensus') {
      return `Konsensusmätningen fungerade som avsett - den spårade gradvis konvergens från ${progression} tills äkta enighet uppnåddes. Systemet visade att genuint överensstämmande kan uppnås genom strukturerad debatt.`;
    } else {
      return `Konsensusprogressionen (${progression}) visar hur svårt det är att mäta "enighet" när AI:er uttrycker samma koncept med olika ord eller fokuserar på olika aspekter av samma sanning. Semantisk likhet ≠ identisk åsikt.`;
    }
  }

  private generateIronicConclusion(session: DebateSession): string {
    if (session.status === 'consensus') {
      return `Tre AI-modeller med olika träningsdata, arkitekturer och bias lyckades faktiskt enas. Det är både imponerande och förvånande - kanske finns det hopp för mänsklig konsensus också?`;
    } else if (session.status === 'user_accepted' || session.status === 'manually_resolved') {
      return `Tre AI-modeller kunde inte enas, så en människa fick göra det de inte kunde - fatta ett beslut trots osäkerhet. Kanske är det människans superkraft: att välja trots brist på perfekt information.`;
    } else {
      return `Tre intelligenta AI-system med tillgång till samma information och samma mål (att svara på frågan) kunde inte enas. Det är en perfekt metafor för mänsklig diskurs - att ha fakta är inte detsamma som att ha konsensus.`;
    }
  }

  private generateWorthItStatement(session: DebateSession): string {
    const cost = session.current_cost_usd;
    if (session.status === 'consensus') {
      return 'Absolut - äkta konsensus uppnådd!';
    } else if (cost < 0.10) {
      return 'Ja - billigt att utforska olika perspektiv';
    } else if (cost < 0.50) {
      return 'Definitivt - lärorikt även utan konsensus';
    } else {
      return 'Kanske - beror på hur mycket du värderar mångsidiga perspektiv';
    }
  }

  private generateDebateQuote(session: DebateSession): string {
    const quotes = [
      {
        text: 'I själva verket är det inte viktigt att vi alla tycker lika. Det viktiga är att vi kan tänka tillsammans.',
        author: 'Fritt efter Peter Senge'
      },
      {
        text: 'Sanningen är sällan ren och aldrig enkel.',
        author: 'Oscar Wilde'
      },
      {
        text: 'Det är skillnaden i åsikt som gör hästkapplöpningar.',
        author: 'Mark Twain'
      },
      {
        text: 'Kloka människor talar eftersom de har något att säga; dårar eftersom de måste säga något.',
        author: 'Platon'
      }
    ];

    // Select quote based on session outcome
    let selectedQuote;
    if (session.status === 'consensus') {
      selectedQuote = quotes[0]; // Thinking together
    } else if (session.rounds.length >= 3) {
      selectedQuote = quotes[1]; // Truth is complex
    } else {
      selectedQuote = quotes[2]; // Difference of opinion
    }

    return `
            <blockquote style="margin-top: 30px; font-size: 1.05em; font-style: italic; border-left: 3px solid #ddd; padding-left: 20px; color: #555;">
                "${selectedQuote.text}"<br>
                <span style="font-size: 0.9em;">— ${selectedQuote.author}</span>
            </blockquote>`;
  }

  private getStatusText(status: string): string {
    const statusMap: {[key: string]: string} = {
      'active': '🔄 Pågående',
      'consensus': '✅ Konsensus uppnådd (≥85%)',
      'user_accepted': '👤 Användaren accepterade ett svar',
      'manually_resolved': '🤝 Användaren syntetiserade positionerna',
      'deadlock': '🚨 Oenighet',
      'paused': '⏸️ Pausad',
      'failed': '❌ Misslyckades'
    };
    return statusMap[status] || status;
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
}