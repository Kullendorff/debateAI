#!/usr/bin/env node

// CRITICAL: MCP protocol requires clean stdout (only JSON)
// Load .env manually to avoid dotenv's stdout pollution
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Manually parse .env file without any output
try {
  const envPath = resolve(process.cwd(), '.env');
  const envFile = readFileSync(envPath, 'utf-8');

  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
} catch (error) {
  // .env file doesn't exist or can't be read - that's OK
  // Environment variables may be provided by MCP config
}

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { ConsensusEngine } from './consensus-engine.js';
import { AIClientManager } from './ai-clients.js';
import { 
  PhoneAFriendParams, 
  ContinueDebateParams, 
  AnalyzeDisagreementParams 
} from './types.js';

class PhoneAFriendMCPServer {
  private server: Server;
  private consensusEngine: ConsensusEngine;
  private aiManager: AIClientManager;
  private cleanupTimer?: NodeJS.Timeout;

  constructor() {
    // Validate environment variables at startup
    this.validateEnvironment();

    this.server = new Server(
      {
        name: 'phone-a-friend-mcp',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Initialize AI manager with environment variables
    this.aiManager = new AIClientManager({
      openai: process.env.OPENAI_API_KEY,
      gemini: process.env.GEMINI_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY,
    });

    this.consensusEngine = new ConsensusEngine(this.aiManager);
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'phone_a_friend',
            description: 'Initiate AI consensus panel for a complex question',
            inputSchema: {
              type: 'object',
              properties: {
                question: {
                  type: 'string',
                  description: 'The complex question or problem to discuss'
                },
                context: {
                  type: 'string',
                  description: 'Additional context from conversation (optional)'
                },
                max_rounds: {
                  type: 'number',
                  description: 'Maximum debate rounds (default: 3)',
                  minimum: 1,
                  maximum: 10
                },
                max_cost_usd: {
                  type: 'number',
                  description: 'Cost limit in USD (default: 1.0, max: 5.0)',
                  minimum: 0.10,
                  maximum: 5.0
                },
                strategy: {
                  type: 'string',
                  enum: ['debate', 'synthesize', 'tournament'],
                  description: 'Debate style (default: debate)'
                },
                models: {
                  type: 'object',
                  properties: {
                    openai: { type: 'string' },
                    gemini: { type: 'string' },
                    anthropic: { type: 'string' }
                  },
                  description: 'Override model choices (optional)'
                },
                interactive: {
                  type: 'boolean',
                  description: 'Stop after each round for user decision (default: false)'
                }
              },
              required: ['question']
            }
          },
          {
            name: 'continue_debate',
            description: 'Continue a paused debate after human intervention',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: {
                  type: 'string',
                  description: 'The session ID from the original phone_a_friend call'
                },
                instruction: {
                  type: 'string',
                  enum: ['continue_2_rounds', 'continue_until_consensus', 'accept_answer', 'synthesize_and_stop'],
                  description: 'How to continue the debate'
                },
                selected_ai: {
                  type: 'string',
                  enum: ['openai', 'gemini', 'claude'],
                  description: 'Which AI answer to accept (required if instruction is accept_answer)'
                }
              },
              required: ['session_id', 'instruction']
            }
          },
          {
            name: 'analyze_disagreement',
            description: 'Deep analysis of why AIs disagree in a session',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: {
                  type: 'string',
                  description: 'The session ID to analyze'
                }
              },
              required: ['session_id']
            }
          },
          {
            name: 'continue_round',
            description: 'Continue to next round in interactive debate mode',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: {
                  type: 'string',
                  description: 'The session ID from the current debate'
                },
                action: {
                  type: 'string',
                  enum: ['next_round', 'finish_debate', 'auto_complete'],
                  description: 'What to do next: continue one round, finish debate, or complete all remaining rounds'
                }
              },
              required: ['session_id', 'action']
            }
          },
          {
            name: 'get_debate_log',
            description: 'Get full text log of a debate session for export',
            inputSchema: {
              type: 'object',
              properties: {
                session_id: {
                  type: 'string',
                  description: 'The session ID to get the log for'
                },
                format: {
                  type: 'string',
                  enum: ['markdown', 'plain_text'],
                  description: 'Output format (default: markdown)'
                }
              },
              required: ['session_id']
            }
          }
        ] as Tool[]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        switch (request.params.name) {
          case 'phone_a_friend':
            return await this.handlePhoneAFriend(request.params.arguments);

          case 'continue_debate':
            return await this.handleContinueDebate(request.params.arguments);

          case 'continue_round':
            return await this.handleContinueRound(request.params.arguments);

          case 'analyze_disagreement':
            return await this.handleAnalyzeDisagreement(request.params.arguments);

          case 'get_debate_log':
            return await this.handleGetDebateLog(request.params.arguments);

          default:
            throw new Error(`Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${errorMessage}`
            }
          ]
        };
      }
    });
  }

  private async handlePhoneAFriend(args: any) {
    // Validate required parameters
    if (!args.question || typeof args.question !== 'string') {
      throw new Error('Question parameter is required and must be a string');
    }

    // Check if we have at least some API keys
    const availableProviders = this.aiManager.getAvailableProviders();
    if (availableProviders.length < 2) {
      throw new Error(`Need at least 2 AI providers configured. Available: ${availableProviders.join(', ')}. Please set OPENAI_API_KEY, GEMINI_API_KEY, and/or ANTHROPIC_API_KEY environment variables.`);
    }

    const params: PhoneAFriendParams = {
      question: args.question,
      context: args.context,
      max_rounds: args.max_rounds || 3,
      max_cost_usd: args.max_cost_usd || 1.0,
      strategy: args.strategy || 'debate',
      models: args.models
    };

    const interactive = args.interactive || false;

    console.error(`Starting AI consensus panel for: "${params.question}"`);
    console.error(`Available providers: ${availableProviders.join(', ')}`);
    console.error(`Max rounds: ${params.max_rounds}, Max cost: $${params.max_cost_usd}`);

    const result = await this.consensusEngine.phoneAFriend(params, (update: string) => {
      // Progressive commentary callback - but MCP doesn't support streaming, so we log it
      console.error(`[PROGRESS] ${update}`);
    }, interactive);

    // Format the response based on status
    let responseText = '';

    if (result.status === 'consensus' && !interactive) {
      responseText = `## ✅ AI Panel Consensus Reached!

**Question:** ${params.question}

**Consensus Answer:**
${result.final_answer}

**Debate Summary:**
- Rounds completed: ${result.debate_log.length}
- Final consensus score: ${(result.debate_log[result.debate_log.length - 1]?.consensus_score * 100 || 0).toFixed(1)}%

${this.formatCostSummary(result.cost_summary)}

**📋 Fullständig debatt-rapport med runda-för-runda analys nedan**

**Session ID:** \`${result.session_id}\``;

      // Get detailed debate report
      const detailedReport = await this.consensusEngine.getDebateLog(result.session_id, 'markdown');

      return {
        content: [
          {
            type: 'text',
            text: responseText
          },
          {
            type: 'text',
            text: detailedReport || this.generateArtifactContent(result.debate_log),
            annotations: {
              artifact: true,
              identifier: `debate-report-${result.session_id}`,
              title: '🤖 AI Konsensus-panel Debatt',
              type: 'text/markdown'
            }
          }
        ]
      };

    } else if (result.status === 'consensus' && interactive) {
      // Interactive mode consensus
      responseText = `## ✅ AI Panel Consensus Reached!

**Consensus Answer:**
${result.final_answer}

**Debate Summary:**
- Rounds completed: ${result.debate_log.length}
- Final consensus score: ${(result.debate_log[result.debate_log.length - 1]?.consensus_score * 100 || 0).toFixed(1)}%

${this.formatCostSummary(result.cost_summary)}

**📋 Fullständig debatt-rapport med runda-för-runda analys nedan**

**Session ID:** \`${result.session_id}\``;

      // Get detailed debate report
      const detailedReport = await this.consensusEngine.getDebateLog(result.session_id, 'markdown');

      return {
        content: [
          {
            type: 'text',
            text: responseText
          },
          {
            type: 'text',
            text: detailedReport || this.generateArtifactContent(result.debate_log),
            annotations: {
              artifact: true,
              identifier: `debate-report-${result.session_id}`,
              title: '🤖 AI Konsensus-panel Debatt',
              type: 'text/markdown'
            }
          }
        ]
      };

    } else if (interactive) {
      // Interactive mode - first round completed, ask user
      const currentRound = result.debate_log.length;
      const consensus = result.debate_log.length > 0 ? (result.debate_log[result.debate_log.length - 1]!.consensus_score * 100).toFixed(1) : '0';

      responseText = `## 🔄 **Runda ${currentRound}/${params.max_rounds} slutförd** (Konsensus: ${consensus}%)

${this.formatCostSummary(result.cost_summary)}

**Vad vill du göra härnäst?**
1. **Fortsätt till nästa runda** - \`continue_round\` med \`"action": "next_round"\`
2. **Avsluta debatten nu** - \`continue_round\` med \`"action": "finish_debate"\`
3. **Kör alla återstående rundor** - \`continue_round\` med \`"action": "auto_complete"\`

**📋 Fullständig debatt-rapport med runda-för-runda analys nedan**

**Session ID:** \`${result.session_id}\``;

      // Get detailed debate report
      const detailedReport = await this.consensusEngine.getDebateLog(result.session_id, 'markdown');

      return {
        content: [
          {
            type: 'text',
            text: responseText
          },
          {
            type: 'text',
            text: detailedReport || this.generateArtifactContent(result.debate_log),
            annotations: {
              artifact: true,
              identifier: `debate-report-${result.session_id}`,
              title: '🤖 AI Konsensus-panel Debatt',
              type: 'text/markdown'
            }
          }
        ]
      };

    } else {
      // Non-interactive deadlock - provide intervention summary
      responseText = await this.consensusEngine.formatInterventionSummary(result.session_id);
      responseText += `\n\n**📋 Fullständig debatt-rapport med runda-för-runda analys nedan**`;
      responseText += `\n\n**Session ID:** \`${result.session_id}\`\n\n*Use continue_debate tool to proceed with one of the options above.*`;

      // Get detailed debate report
      const detailedReport = await this.consensusEngine.getDebateLog(result.session_id, 'markdown');

      return {
        content: [
          {
            type: 'text',
            text: responseText
          },
          {
            type: 'text',
            text: detailedReport || this.generateArtifactContent(result.debate_log),
            annotations: {
              artifact: true,
              identifier: `debate-report-${result.session_id}`,
              title: '🤖 AI Konsensus-panel Debatt',
              type: 'text/markdown'
            }
          }
        ]
      };
    }
  }

  private async handleContinueDebate(args: any) {
    if (!args.session_id || typeof args.session_id !== 'string') {
      throw new Error('session_id parameter is required and must be a string');
    }

    if (!args.instruction || typeof args.instruction !== 'string') {
      throw new Error('instruction parameter is required');
    }

    const validInstructions = ['continue_2_rounds', 'continue_until_consensus', 'accept_answer', 'synthesize_and_stop'];
    if (!validInstructions.includes(args.instruction)) {
      throw new Error(`Invalid instruction. Must be one of: ${validInstructions.join(', ')}`);
    }

    if (args.instruction === 'accept_answer' && !args.selected_ai) {
      throw new Error('selected_ai parameter is required when instruction is accept_answer');
    }

    const params: ContinueDebateParams = {
      session_id: args.session_id,
      instruction: args.instruction,
      selected_ai: args.selected_ai
    };

    console.error(`Continuing debate for session ${params.session_id} with instruction: ${params.instruction}`);

    const result = await this.consensusEngine.continueDebate(params);

    let responseText = '';

    if (result.status === 'consensus') {
      responseText = `## ✅ Debate Resolved!

**Final Answer:**
${result.final_answer}

**Resolution Method:** ${params.instruction}

**Total Debate Summary:**
- Total rounds: ${result.debate_log.length}
- Session: ${result.session_id}

${this.formatCostSummary(result.cost_summary)}

**📋 Fullständig debatt-rapport med runda-för-runda analys nedan**`;

      // Get detailed debate report
      const detailedReport = await this.consensusEngine.getDebateLog(result.session_id, 'markdown');

      return {
        content: [
          {
            type: 'text',
            text: responseText
          },
          {
            type: 'text',
            text: detailedReport || this.generateArtifactContent(result.debate_log),
            annotations: {
              artifact: true,
              identifier: `debate-report-${result.session_id}`,
              title: '🤖 AI Konsensus-panel Debatt',
              type: 'text/markdown'
            }
          }
        ]
      };

    } else {
      const interventionSummary = await this.consensusEngine.formatInterventionSummary(result.session_id);
      responseText = `## 🚨 Still No Consensus

The debate continued but consensus was not reached.

${interventionSummary}

**📋 Fullständig debatt-rapport med runda-för-runda analys nedan**

**Session ID:** \`${result.session_id}\``;

      // Get detailed debate report
      const detailedReport = await this.consensusEngine.getDebateLog(result.session_id, 'markdown');

      return {
        content: [
          {
            type: 'text',
            text: responseText
          },
          {
            type: 'text',
            text: detailedReport || this.generateArtifactContent(result.debate_log),
            annotations: {
              artifact: true,
              identifier: `debate-report-${result.session_id}`,
              title: '🤖 AI Konsensus-panel Debatt',
              type: 'text/markdown'
            }
          }
        ]
      };
    }
  }

  private async handleAnalyzeDisagreement(args: any) {
    if (!args.session_id || typeof args.session_id !== 'string') {
      throw new Error('session_id parameter is required and must be a string');
    }

    console.error(`Analyzing disagreement for session ${args.session_id}`);

    const analysis = await this.consensusEngine.analyzeDisagreementForSession(args.session_id);

    if (!analysis) {
      throw new Error(`Session ${args.session_id} not found`);
    }

    const responseText = `## 🔍 Disagreement Analysis

**Core Conflict:**
${analysis.core_conflict}

**Disagreement Type:** ${analysis.disagreement_type}
**Resolvability Score:** ${analysis.resolvability_score}/10

**Key Differences:**
${analysis.key_differences.map(diff => `- ${diff}`).join('\n')}

**Recommendations:**
${this.getRecommendations(analysis.disagreement_type, analysis.resolvability_score)}`;

    return {
      content: [
        {
          type: 'text',
          text: responseText
        }
      ]
    };
  }

  private formatCostSummary(costSummary: any): string {
    return `**💰 Cost Summary:**
- Total cost: $${costSummary.total_cost_usd.toFixed(4)}
- Tokens used: ${costSummary.tokens_used.toLocaleString()}
- OpenAI: $${costSummary.by_model.openai.toFixed(4)}
- Gemini: $${costSummary.by_model.gemini.toFixed(4)}
- Claude: $${costSummary.by_model.claude.toFixed(4)}`;
  }

  private formatRoundSummary(debateLog: any[]): string {
    if (debateLog.length === 0) return '';

    let summary = `## 🗣️ **Debatt-sammanfattning:**\n\n`;
    
    debateLog.forEach((round, index) => {
      summary += `### 🔄 **Runda ${round.round_number}** (Konsensus: ${(round.consensus_score * 100).toFixed(1)}%)\n\n`;
      
      // GPT-4o
      const gptSummary = this.truncateText(round.responses.openai.content, 120);
      summary += `**🤖 GPT-4o** (${round.responses.openai.confidence}%): ${gptSummary}\n\n`;
      
      // Claude
      const claudeSummary = this.truncateText(round.responses.claude.content, 120);  
      summary += `**🧠 Claude** (${round.responses.claude.confidence}%): ${claudeSummary}\n\n`;
      
      // Gemini
      const geminiSummary = this.truncateText(round.responses.gemini.content, 120);
      summary += `**🌟 Gemini** (${round.responses.gemini.confidence}%): ${geminiSummary}\n\n`;
      
      if (index < debateLog.length - 1) {
        summary += `---\n\n`;
      }
    });

    return summary;
  }

  private generateArtifactContent(debateLog: any[]): string {
    if (debateLog.length === 0) return '';

    // Generate artifact content for the full debate
    let artifactContent = `# 🤖 AI Konsensus-panel Debatt\n\n`;
    
    debateLog.forEach((round, index) => {
      artifactContent += `## 🔄 Runda ${round.round_number} - Konsensus: ${(round.consensus_score * 100).toFixed(1)}%\n\n`;
      artifactContent += `**Tidsstämpel:** ${round.timestamp ? new Date(round.timestamp).toLocaleString('sv-SE') : 'N/A'}\n`;
      artifactContent += `**Kostnad:** $${round.cost_usd.toFixed(4)}\n`;
      artifactContent += `**Tokens:** ${round.tokens_used.toLocaleString()}\n\n`;

      // Full responses
      artifactContent += `### 🤖 GPT-4o (Säkerhet: ${round.responses.openai.confidence}%)\n\n`;
      artifactContent += `${round.responses.openai.content}\n\n---\n\n`;

      artifactContent += `### 🧠 Claude Sonnet 4 (Säkerhet: ${round.responses.claude.confidence}%)\n\n`;
      artifactContent += `${round.responses.claude.content}\n\n---\n\n`;

      artifactContent += `### 🌟 Gemini (Säkerhet: ${round.responses.gemini.confidence}%)\n\n`;
      artifactContent += `${round.responses.gemini.content}\n\n`;

      if (index < debateLog.length - 1) {
        artifactContent += `\n${'='.repeat(80)}\n\n`;
      }
    });

    return artifactContent;
  }

  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  private getRecommendations(type: string, resolvability: number): string {
    if (resolvability >= 8) {
      return `• High chance of resolution - consider continuing debate
• ${type === 'factual' ? 'Look for authoritative sources' : 'Focus on finding common ground'}`;
    } else if (resolvability >= 6) {
      return `• Moderate chance of resolution - try different approach
• Consider synthesizing partial agreement`;
    } else {
      return `• Low chance of resolution - may need human judgment
• ${type === 'philosophical' ? 'Accept that reasonable people can disagree' : 'Seek external expertise'}`;
    }
  }

  private async handleContinueRound(args: any) {
    if (!args.session_id || typeof args.session_id !== 'string') {
      throw new Error('session_id parameter is required and must be a string');
    }

    if (!args.action || !['next_round', 'finish_debate', 'auto_complete'].includes(args.action)) {
      throw new Error('action parameter must be one of: next_round, finish_debate, auto_complete');
    }

    console.error(`Continuing round for session ${args.session_id} with action: ${args.action}`);

    const result = await this.consensusEngine.continueRound(args.session_id, args.action, (update: string) => {
      console.error(`[PROGRESS] ${update}`);
    });

    // Format response based on status
    let responseText = '';

    if (result.status === 'consensus') {
      responseText = `## ✅ AI Panel Consensus Reached!

**Final Answer:**
${result.final_answer}

**Final Debate Summary:**
- Total rounds: ${result.debate_log.length}
- Final consensus score: ${(result.debate_log[result.debate_log.length - 1]?.consensus_score * 100 || 0).toFixed(1)}%

${this.formatCostSummary(result.cost_summary)}

**📋 Fullständig debatt-rapport med runda-för-runda analys nedan**

**Session ID:** \`${result.session_id}\``;

      // Get detailed debate report
      const detailedReport = await this.consensusEngine.getDebateLog(result.session_id, 'markdown');

      return {
        content: [
          {
            type: 'text',
            text: responseText
          },
          {
            type: 'text',
            text: detailedReport || this.generateArtifactContent(result.debate_log),
            annotations: {
              artifact: true,
              identifier: `debate-report-${result.session_id}`,
              title: '🤖 AI Konsensus-panel Debatt',
              type: 'text/markdown'
            }
          }
        ]
      };

    } else {
      // Still needs intervention or continue
      const currentRound = result.debate_log.length;
      const maxRounds = 3; // TODO: get from session

      responseText = `## 🔄 **Runda ${currentRound}/${maxRounds} slutförd** (Konsensus: ${result.debate_log.length > 0 ? (result.debate_log[result.debate_log.length - 1]!.consensus_score * 100).toFixed(1) : '0'}%)

${this.formatCostSummary(result.cost_summary)}

**Vad vill du göra härnäst?**
1. **Fortsätt till nästa runda** - \`continue_round\` med \`"action": "next_round"\`
2. **Avsluta debatten nu** - \`continue_round\` med \`"action": "finish_debate"\`
3. **Kör alla återstående rundor** - \`continue_round\` med \`"action": "auto_complete"\`

**📋 Fullständig debatt-rapport med runda-för-runda analys nedan**

**Session ID:** \`${result.session_id}\``;

      // Get detailed debate report
      const detailedReport = await this.consensusEngine.getDebateLog(result.session_id, 'markdown');

      return {
        content: [
          {
            type: 'text',
            text: responseText
          },
          {
            type: 'text',
            text: detailedReport || this.generateArtifactContent(result.debate_log),
            annotations: {
              artifact: true,
              identifier: `debate-report-${result.session_id}`,
              title: '🤖 AI Konsensus-panel Debatt - Uppdaterad',
              type: 'text/markdown'
            }
          }
        ]
      };
    }
  }

  private async handleGetDebateLog(args: any) {
    if (!args.session_id || typeof args.session_id !== 'string') {
      throw new Error('session_id parameter is required and must be a string');
    }

    const format = args.format || 'markdown';
    console.error(`Getting debate log for session ${args.session_id} in ${format} format`);

    const logText = await this.consensusEngine.getDebateLog(args.session_id, format);

    if (!logText) {
      throw new Error(`Session ${args.session_id} not found`);
    }

    return {
      content: [
        {
          type: 'text',
          text: logText
        }
      ]
    };
  }

  private validateEnvironment(): void {
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    const hasGemini = !!process.env.GEMINI_API_KEY;
    const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;

    if (!hasOpenAI && !hasGemini && !hasAnthropic) {
      throw new Error(
        'No API keys configured. Please set at least one of: OPENAI_API_KEY, GEMINI_API_KEY, or ANTHROPIC_API_KEY in your .env file'
      );
    }

    const configured: string[] = [];
    if (hasOpenAI) configured.push('OpenAI');
    if (hasGemini) configured.push('Gemini');
    if (hasAnthropic) configured.push('Anthropic');

    console.error(`Environment validated. Configured providers: ${configured.join(', ')}`);
  }

  /**
   * Start periodic session cleanup
   * Cleans up sessions older than 7 days, runs every 24 hours
   */
  private startPeriodicCleanup(): void {
    // Run cleanup immediately on startup
    this.consensusEngine.cleanupOldSessions().catch(err => {
      console.error('Initial session cleanup failed:', err);
    });

    // Then run every 24 hours
    const cleanupInterval = 24 * 60 * 60 * 1000; // 24 hours
    this.cleanupTimer = setInterval(() => {
      this.consensusEngine.cleanupOldSessions().catch(err => {
        console.error('Periodic session cleanup failed:', err);
      });
    }, cleanupInterval);

    console.error('Session cleanup scheduled (every 24 hours)');
  }

  /**
   * Stop periodic cleanup (for graceful shutdown)
   */
  private stopPeriodicCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  async run(): Promise<void> {
    // Initialize consensus engine (must be done after construction)
    await this.consensusEngine.initialize();

    // Start periodic session cleanup
    this.startPeriodicCleanup();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Phone-a-Friend MCP v2 server started successfully');
  }
}

// Start the server
const server = new PhoneAFriendMCPServer();
server.run().catch((error) => {
  console.error('Server failed to start:', error);
  process.exit(1);
});