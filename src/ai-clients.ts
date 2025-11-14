import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIClient, AIResponse } from './types.js';

/**
 * Extract confidence score from AI response content
 * Shared utility function for all AI clients
 */
function extractConfidence(content: string): number {
  // Simple heuristic to extract confidence from response
  const confidencePatterns = [
    /(?:confident|confidence|certain|sure).*?(\d{1,3})%/i,
    /(\d{1,3})%.*?(?:confident|confidence|certain|sure)/i
  ];

  for (const pattern of confidencePatterns) {
    const match = content.match(pattern);
    if (match?.[1]) {
      return Math.min(100, Math.max(0, parseInt(match[1])));
    }
  }

  // Fallback heuristic based on language certainty
  const certainWords = ['definitely', 'certainly', 'absolutely', 'clearly'];
  const uncertainWords = ['maybe', 'perhaps', 'possibly', 'might', 'could'];

  const certainCount = certainWords.filter(word =>
    content.toLowerCase().includes(word)
  ).length;
  const uncertainCount = uncertainWords.filter(word =>
    content.toLowerCase().includes(word)
  ).length;

  if (certainCount > uncertainCount) return 85;
  if (uncertainCount > certainCount) return 60;
  return 75; // Default confidence
}

export class OpenAIClient implements AIClient {
  private client: OpenAI;
  private defaultModel = 'gpt-4o';

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generateResponse(prompt: string, model?: string): Promise<AIResponse> {
    const modelToUse = model || this.defaultModel;

    console.error(`[DEBUG] OpenAI: Starting request with model: ${modelToUse}`);
    console.error(`[DEBUG] OpenAI: Prompt length: ${prompt.length} chars`);

    try {
      const createParams: any = {
        model: modelToUse,
        messages: [{ role: 'user', content: prompt }],
      };

      // GPT-5 only supports default temperature (1)
      if (!modelToUse.startsWith('gpt-5') && !modelToUse.startsWith('o4')) {
        createParams.temperature = 0.7;
      }

      console.error(`[DEBUG] OpenAI: Calling chat.completions.create...`);
      const response = await this.client.chat.completions.create(createParams);

      const content = response.choices[0]?.message?.content || '';
      const usage = response.usage;
      const inputTokens = usage?.prompt_tokens || 0;
      const outputTokens = usage?.completion_tokens || 0;
      const totalTokens = usage?.total_tokens || inputTokens + outputTokens;

      console.error(`[DEBUG] OpenAI: Success! Response length: ${content.length} chars, Tokens: ${totalTokens}, Cost: $${this.calculateCost(inputTokens, outputTokens, modelToUse).toFixed(6)}`);

      return {
        content,
        confidence: extractConfidence(content),
        model: modelToUse,
        tokens_used: totalTokens,
        cost_usd: this.calculateCost(inputTokens, outputTokens, modelToUse)
      };
    } catch (error: any) {
      console.error(`[DEBUG] OpenAI: ERROR occurred!`);
      console.error(`[DEBUG] OpenAI: Error message: ${error?.message}`);
      console.error(`[DEBUG] OpenAI: Full error:`, error);
      throw new Error(`OpenAI API failed: ${error?.message || error}`);
    }
  }

  getAvailableModels(): string[] {
    return ['gpt-5', 'gpt-5-mini', 'o4-mini', 'gpt-4o'];
  }

  calculateCost(inputTokens: number, outputTokens: number, model: string): number {
    const pricing: Record<string, { input: number; output: number }> = {
      'gpt-5': { input: 1.25, output: 10.00 },
      'gpt-5-mini': { input: 0.25, output: 2.00 },
      'o4-mini': { input: 0.60, output: 2.40 },
      'gpt-4o': { input: 0.005, output: 0.015 },
      'o1-preview': { input: 0.030, output: 0.120 },
      'o3-mini': { input: 0.002, output: 0.008 }
    };

    const modelPricing = pricing[model] || pricing['gpt-4o'];
    return (inputTokens * modelPricing.input + outputTokens * modelPricing.output) / 1000;
  }
}

export class GeminiClient implements AIClient {
  private client: GoogleGenerativeAI;
  private defaultModel = 'gemini-2.0-flash-exp';

  constructor(apiKey: string) {
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async generateResponse(prompt: string, model?: string): Promise<AIResponse> {
    const modelToUse = model || this.defaultModel;

    console.error(`[DEBUG] Gemini: Starting request with model: ${modelToUse}`);
    console.error(`[DEBUG] Gemini: Prompt length: ${prompt.length} chars`);

    try {
      const geminiModel = this.client.getGenerativeModel({ model: modelToUse });
      console.error(`[DEBUG] Gemini: Model instance created, calling generateContent...`);

      const result = await geminiModel.generateContent(prompt);
      console.error(`[DEBUG] Gemini: generateContent completed, getting response...`);

      const response = await result.response;
      console.error(`[DEBUG] Gemini: Response received, extracting text...`);

      const content = response.text();
      console.error(`[DEBUG] Gemini: Response text length: ${content.length} chars`);
      console.error(`[DEBUG] Gemini: First 100 chars: ${content.substring(0, 100)}...`);

      // Gemini doesn't provide detailed token usage, so we estimate
      const estimatedTokens = this.estimateTokens(prompt + content);
      const inputTokens = this.estimateTokens(prompt);
      const outputTokens = estimatedTokens - inputTokens;

      console.error(`[DEBUG] Gemini: Success! Tokens: ${estimatedTokens}, Cost: $${this.calculateCost(inputTokens, outputTokens, modelToUse).toFixed(6)}`);

      return {
        content,
        confidence: extractConfidence(content),
        model: modelToUse,
        tokens_used: estimatedTokens,
        cost_usd: this.calculateCost(inputTokens, outputTokens, modelToUse)
      };
    } catch (error: any) {
      console.error(`[DEBUG] Gemini: ERROR occurred!`);
      console.error(`[DEBUG] Gemini: Error type: ${error?.constructor?.name}`);
      console.error(`[DEBUG] Gemini: Error message: ${error?.message}`);
      console.error(`[DEBUG] Gemini: Full error:`, error);

      // Check for specific error types
      if (error?.message?.includes('quota')) {
        console.error(`[DEBUG] Gemini: QUOTA ERROR - Rate limit exceeded`);
      } else if (error?.message?.includes('404')) {
        console.error(`[DEBUG] Gemini: MODEL NOT FOUND - ${modelToUse} may not be available`);
      } else if (error?.message?.includes('API key')) {
        console.error(`[DEBUG] Gemini: API KEY ERROR - Check your GEMINI_API_KEY`);
      }

      throw new Error(`Gemini API failed: ${error?.message || error}`);
    }
  }

  getAvailableModels(): string[] {
    return ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash-exp', 'gemini-1.5-pro'];
  }

  calculateCost(inputTokens: number, outputTokens: number, model: string): number {
    const pricing: Record<string, { input: number; output: number }> = {
      'gemini-2.5-pro': { input: 3.50, output: 10.50 },
      'gemini-2.5-flash': { input: 0.30, output: 2.50 },
      'gemini-2.0-flash-exp': { input: 0.0001, output: 0.0003 },
      'gemini-1.5-pro': { input: 0.001, output: 0.002 },
      'gemini-1.5-flash': { input: 0.0001, output: 0.0003 }
    };

    const modelPricing = pricing[model] || pricing['gemini-2.5-pro'];
    return (inputTokens * modelPricing.input + outputTokens * modelPricing.output) / 1000;
  }

  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
}

export class AnthropicClient implements AIClient {
  private client: Anthropic;
  private defaultModel = 'claude-sonnet-4-20250514';

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generateResponse(prompt: string, model?: string): Promise<AIResponse> {
    const modelToUse = model || this.defaultModel;

    console.error(`[DEBUG] Claude: Starting request with model: ${modelToUse}`);
    console.error(`[DEBUG] Claude: Prompt length: ${prompt.length} chars`);

    try {
      console.error(`[DEBUG] Claude: Calling messages.create...`);
      const response = await this.client.messages.create({
        model: modelToUse,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0]?.type === 'text'
        ? response.content[0].text
        : '';

      const inputTokens = response.usage.input_tokens;
      const outputTokens = response.usage.output_tokens;

      console.error(`[DEBUG] Claude: Success! Response length: ${content.length} chars, Tokens: ${inputTokens + outputTokens}, Cost: $${this.calculateCost(inputTokens, outputTokens, modelToUse).toFixed(6)}`);

      return {
        content,
        confidence: extractConfidence(content),
        model: modelToUse,
        tokens_used: inputTokens + outputTokens,
        cost_usd: this.calculateCost(inputTokens, outputTokens, modelToUse)
      };
    } catch (error: any) {
      console.error(`[DEBUG] Claude: ERROR occurred!`);
      console.error(`[DEBUG] Claude: Error message: ${error?.message}`);
      console.error(`[DEBUG] Claude: Full error:`, error);
      throw new Error(`Anthropic API failed: ${error?.message || error}`);
    }
  }

  getAvailableModels(): string[] {
    return ['claude-opus-4-1-20250805', 'claude-sonnet-4-20250514', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229'];
  }

  calculateCost(inputTokens: number, outputTokens: number, model: string): number {
    const pricing: Record<string, { input: number; output: number }> = {
      'claude-opus-4-1-20250805': { input: 15.00, output: 75.00 },
      'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
      'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
      'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
      'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 }
    };

    const modelPricing = pricing[model] || pricing['claude-sonnet-4-20250514'];
    return (inputTokens * modelPricing.input + outputTokens * modelPricing.output) / 1000;
  }
}

export class AIClientManager {
  private openaiClient?: OpenAIClient;
  private geminiClient?: GeminiClient;
  private anthropicClient?: AnthropicClient;

  constructor(apiKeys: {
    openai?: string;
    gemini?: string;
    anthropic?: string;
  }) {
    if (apiKeys.openai) {
      this.openaiClient = new OpenAIClient(apiKeys.openai);
    }
    if (apiKeys.gemini) {
      this.geminiClient = new GeminiClient(apiKeys.gemini);
    }
    if (apiKeys.anthropic) {
      this.anthropicClient = new AnthropicClient(apiKeys.anthropic);
    }
  }

  getClient(provider: 'openai' | 'gemini' | 'claude'): AIClient | null {
    switch (provider) {
      case 'openai':
        return this.openaiClient || null;
      case 'gemini':
        return this.geminiClient || null;
      case 'claude':
        return this.anthropicClient || null;
      default:
        return null;
    }
  }

  getAvailableProviders(): ('openai' | 'gemini' | 'claude')[] {
    const providers: ('openai' | 'gemini' | 'claude')[] = [];
    if (this.openaiClient) providers.push('openai');
    if (this.geminiClient) providers.push('gemini');
    if (this.anthropicClient) providers.push('claude');
    return providers;
  }
}