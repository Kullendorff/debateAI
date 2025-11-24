/**
 * Peer Review System - Anonymiserad granskning mellan AI:er
 *
 * Efter runda 1, låt varje AI granska och ranka de andra AI:ernas svar
 * ANONYMT (utan att veta vem som skrev vad). Detta undviker bias där
 * en AI kanske är snäll mot en annan bara för att den vet vem det är.
 *
 * Inspirerat av llm-council Stage 2.
 *
 * Kostnad: ~0.10 kr per review-runda (3 AI-anrop)
 */

import { DebateRound, AIResponse, DebateSession } from './types.js';
import { AIClientManager } from './ai-clients.js';

export interface AnonymizedResponse {
  id: string;  // A, B, C
  content: string;
  confidence: number;
  // Ursprunglig provider döljs
}

export interface PeerRanking {
  position: number;  // 1, 2, 3
  response_id: string;  // A, B, C
  reasoning: string;
}

export interface PeerReview {
  reviewer: 'openai' | 'gemini' | 'claude';
  rankings: PeerRanking[];
  best_aspects: {
    response_id: string;
    aspect: string;
  }[];
  improvement_suggestions: string[];
  cost_usd: number;
  tokens_used: number;
}

export interface PeerReviewResult {
  reviews: PeerReview[];
  aggregated_rankings: {
    response_id: string;
    original_provider: 'openai' | 'gemini' | 'claude';
    total_score: number;  // Lägre = bättre (summan av positioner)
    avg_position: number;
    votes_for_first: number;
  }[];
  winner: 'openai' | 'gemini' | 'claude';
  consensus_on_winner: boolean;  // True om 2+ röstade på samma vinnare
  total_cost_usd: number;
  total_tokens: number;
}

export class PeerReviewSystem {
  private aiManager: AIClientManager;

  // Mapping från anonymiserad ID till provider
  private responseMapping: Map<string, 'openai' | 'gemini' | 'claude'> = new Map();

  constructor(aiManager: AIClientManager) {
    this.aiManager = aiManager;
  }

  /**
   * Genomför peer review av en debattrunda
   */
  async conductPeerReview(
    session: DebateSession,
    round: DebateRound
  ): Promise<PeerReviewResult> {
    console.error(`[PeerReview] Starting peer review for round ${round.round_number}...`);

    // Steg 1: Anonymisera svaren
    const anonymized = this.anonymizeResponses(round.responses);
    console.error(`[PeerReview] Responses anonymized: ${anonymized.map(a => a.id).join(', ')}`);

    // Steg 2: Samla in reviews från varje AI
    const reviews: PeerReview[] = [];
    let totalCost = 0;
    let totalTokens = 0;

    const providers: ('openai' | 'gemini' | 'claude')[] = ['openai', 'gemini', 'claude'];

    for (const reviewer of providers) {
      console.error(`[PeerReview] Collecting review from ${reviewer}...`);

      try {
        const review = await this.collectReview(
          session,
          anonymized,
          reviewer
        );
        reviews.push(review);
        totalCost += review.cost_usd;
        totalTokens += review.tokens_used;
        console.error(`[PeerReview] ${reviewer} review complete. Cost: $${review.cost_usd.toFixed(4)}`);
      } catch (error: any) {
        console.error(`[PeerReview] ${reviewer} review failed: ${error.message}`);
        // Fortsätt med övriga reviews
      }
    }

    if (reviews.length < 2) {
      throw new Error('Not enough peer reviews collected (need at least 2)');
    }

    // Steg 3: Aggregera rankings
    const aggregatedRankings = this.aggregateRankings(reviews);

    // Steg 4: Bestäm vinnare
    const winner = aggregatedRankings[0].original_provider;
    const consensusOnWinner = aggregatedRankings[0].votes_for_first >= 2;

    console.error(`[PeerReview] Winner: ${winner} (consensus: ${consensusOnWinner})`);
    console.error(`[PeerReview] Total cost: $${totalCost.toFixed(4)}`);

    return {
      reviews,
      aggregated_rankings: aggregatedRankings,
      winner,
      consensus_on_winner: consensusOnWinner,
      total_cost_usd: totalCost,
      total_tokens: totalTokens
    };
  }

  /**
   * Anonymisera svar (shuffla ordning, ta bort AI-namn)
   */
  private anonymizeResponses(responses: DebateRound['responses']): AnonymizedResponse[] {
    const providers: ('openai' | 'gemini' | 'claude')[] = ['openai', 'gemini', 'claude'];

    // Skapa anonymiserade svar
    const anonymized: { provider: 'openai' | 'gemini' | 'claude'; response: AIResponse }[] =
      providers.map(provider => ({
        provider,
        response: responses[provider]
      }));

    // Shuffla ordningen
    for (let i = anonymized.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [anonymized[i], anonymized[j]] = [anonymized[j], anonymized[i]];
    }

    // Tilldela anonyma ID:n (A, B, C)
    const ids = ['A', 'B', 'C'];
    this.responseMapping.clear();

    return anonymized.map((item, index) => {
      const id = ids[index];
      this.responseMapping.set(id, item.provider);

      return {
        id,
        content: this.sanitizeContent(item.response.content),
        confidence: item.response.confidence
      };
    });
  }

  /**
   * Ta bort eventuella ledtrådar om vilken AI som skrev svaret
   */
  private sanitizeContent(content: string): string {
    // Ta bort vanliga AI-signaturer
    return content
      .replace(/as an ai|as a language model|as claude|as gpt|as gemini/gi, '')
      .replace(/i am claude|i am gpt|i am gemini/gi, 'jag')
      .replace(/claude|anthropic|openai|google|gemini/gi, '[AI]')
      .trim();
  }

  /**
   * Samla in review från en specifik AI
   */
  private async collectReview(
    session: DebateSession,
    anonymizedResponses: AnonymizedResponse[],
    reviewer: 'openai' | 'gemini' | 'claude'
  ): Promise<PeerReview> {
    const client = this.aiManager.getClient(reviewer);
    if (!client) {
      throw new Error(`Reviewer client ${reviewer} is not available`);
    }

    const prompt = this.buildReviewPrompt(session, anonymizedResponses, reviewer);
    const response = await client.generateResponse(prompt);

    // Parsa AI:ns svar för att extrahera rankings
    const parsedReview = this.parseReviewResponse(response.content, reviewer);

    return {
      ...parsedReview,
      cost_usd: response.cost_usd,
      tokens_used: response.tokens_used
    };
  }

  /**
   * Bygg prompt för peer review
   */
  private buildReviewPrompt(
    session: DebateSession,
    responses: AnonymizedResponse[],
    reviewer: 'openai' | 'gemini' | 'claude'
  ): string {
    let responsesText = '';
    for (const resp of responses) {
      responsesText += `\n### SVAR ${resp.id} (${resp.confidence}% konfidens)\n${resp.content}\n`;
    }

    return `Du är en oberoende granskare i en AI-konsensuspanel. Din uppgift är att utvärdera och ranka tre anonyma svar på en fråga.

## ORIGINALFRÅGA
${session.question}
${session.context ? `\n**Kontext:** ${session.context}` : ''}

## TRE ANONYMA SVAR ATT UTVÄRDERA
${responsesText}

## DIN UPPGIFT

1. **Ranka svaren från 1 (bäst) till 3 (sämst)** baserat på:
   - Korrekthet och faktakontroll
   - Fullständighet och djup
   - Tydlighet och struktur
   - Relevans för frågan

2. **Motivera varje ranking** kort (1-2 meningar)

3. **Identifiera det bästa från varje svar** - vad gör varje svar bra?

4. **Ge förbättringsförslag** - vad saknas generellt?

**VIKTIGT:**
- Var objektiv - du vet inte vem som skrev vilket svar
- Basera din bedömning på innehållets kvalitet, inte stil
- Om två svar är nästan lika bra, förklara vad som skiljer dem

## SVARSFORMAT (följ detta exakt!)

RANKING:
1. [SVAR X] - [Kort motivering]
2. [SVAR Y] - [Kort motivering]
3. [SVAR Z] - [Kort motivering]

BÄSTA ASPEKTER:
- Svar A: [Vad var bra]
- Svar B: [Vad var bra]
- Svar C: [Vad var bra]

FÖRBÄTTRINGSFÖRSLAG:
- [Förslag 1]
- [Förslag 2]`;
  }

  /**
   * Parsa AI:ns review-svar
   */
  private parseReviewResponse(
    content: string,
    reviewer: 'openai' | 'gemini' | 'claude'
  ): Omit<PeerReview, 'cost_usd' | 'tokens_used'> {
    const rankings: PeerRanking[] = [];
    const best_aspects: { response_id: string; aspect: string }[] = [];
    const improvement_suggestions: string[] = [];

    // Parsa rankings
    const rankingMatch = content.match(/RANKING:?\s*([\s\S]*?)(?=BÄSTA|FÖRBÄTTRING|$)/i);
    if (rankingMatch) {
      const rankingText = rankingMatch[1];
      const rankLines = rankingText.match(/(\d)\.\s*\[?(?:SVAR\s*)?([ABC])\]?\s*[-–:]?\s*(.+?)(?=\n\d\.|\n\n|$)/gi) || [];

      for (const line of rankLines) {
        const match = line.match(/(\d)\.\s*\[?(?:SVAR\s*)?([ABC])\]?\s*[-–:]?\s*(.+)/i);
        if (match) {
          rankings.push({
            position: parseInt(match[1]),
            response_id: match[2].toUpperCase(),
            reasoning: match[3].trim()
          });
        }
      }
    }

    // Om vi inte kunde parsa rankings, gör en fallback
    if (rankings.length === 0) {
      // Försök hitta svar-ID:n i ordning de nämns
      const mentionedIds = content.match(/(?:SVAR\s*)?([ABC])/gi) || [];
      const uniqueIds = [...new Set(mentionedIds.map(id => id.replace(/SVAR\s*/i, '').toUpperCase()))];

      for (let i = 0; i < Math.min(3, uniqueIds.length); i++) {
        rankings.push({
          position: i + 1,
          response_id: uniqueIds[i],
          reasoning: 'Ranking baserad på ordning i svaret'
        });
      }

      // Om fortfarande inga rankings, fallback till A, B, C
      if (rankings.length === 0) {
        ['A', 'B', 'C'].forEach((id, i) => {
          rankings.push({
            position: i + 1,
            response_id: id,
            reasoning: 'Standard-ranking (kunde inte parsa AI-svar)'
          });
        });
      }
    }

    // Parsa bästa aspekter
    const aspectsMatch = content.match(/BÄSTA ASPEKTER:?\s*([\s\S]*?)(?=FÖRBÄTTRING|$)/i);
    if (aspectsMatch) {
      const aspectsText = aspectsMatch[1];
      const aspectLines = aspectsText.match(/[-•]\s*(?:SVAR\s*)?([ABC]):?\s*(.+?)(?=\n[-•]|\n\n|$)/gi) || [];

      for (const line of aspectLines) {
        const match = line.match(/[-•]\s*(?:SVAR\s*)?([ABC]):?\s*(.+)/i);
        if (match) {
          best_aspects.push({
            response_id: match[1].toUpperCase(),
            aspect: match[2].trim()
          });
        }
      }
    }

    // Parsa förbättringsförslag
    const suggestionsMatch = content.match(/FÖRBÄTTRINGSFÖRSLAG:?\s*([\s\S]*?)$/i);
    if (suggestionsMatch) {
      const suggestionsText = suggestionsMatch[1];
      const suggestionLines = suggestionsText.match(/[-•]\s*(.+?)(?=\n[-•]|\n\n|$)/g) || [];

      for (const line of suggestionLines) {
        const cleaned = line.replace(/^[-•]\s*/, '').trim();
        if (cleaned.length > 5) {
          improvement_suggestions.push(cleaned);
        }
      }
    }

    return {
      reviewer,
      rankings,
      best_aspects,
      improvement_suggestions
    };
  }

  /**
   * Aggregera rankings från alla reviews
   */
  private aggregateRankings(reviews: PeerReview[]): PeerReviewResult['aggregated_rankings'] {
    const scores: Map<string, {
      total_score: number;
      votes_for_first: number;
      count: number;
    }> = new Map();

    // Initiera för alla svar-ID:n
    for (const id of ['A', 'B', 'C']) {
      scores.set(id, { total_score: 0, votes_for_first: 0, count: 0 });
    }

    // Summera poäng från alla reviews
    for (const review of reviews) {
      for (const ranking of review.rankings) {
        const current = scores.get(ranking.response_id);
        if (current) {
          current.total_score += ranking.position;
          current.count++;
          if (ranking.position === 1) {
            current.votes_for_first++;
          }
        }
      }
    }

    // Konvertera till array och sortera (lägst score = bäst)
    const results = [...scores.entries()]
      .map(([response_id, data]) => ({
        response_id,
        original_provider: this.responseMapping.get(response_id) || 'openai' as const,
        total_score: data.total_score,
        avg_position: data.count > 0 ? data.total_score / data.count : 3,
        votes_for_first: data.votes_for_first
      }))
      .sort((a, b) => a.total_score - b.total_score);

    return results;
  }

  /**
   * Formatera peer review-resultat för visning
   */
  formatPeerReviewResult(result: PeerReviewResult): string {
    const providerNames = {
      'openai': 'GPT-4o',
      'claude': 'Claude Sonnet 4',
      'gemini': 'Gemini'
    };

    let output = `## Peer Review-resultat\n\n`;
    output += `**Vinnare:** ${providerNames[result.winner]}\n`;
    output += `**Konsensus:** ${result.consensus_on_winner ? 'Ja (2+ röster)' : 'Nej (delad åsikt)'}\n`;
    output += `**Total kostnad:** $${result.total_cost_usd.toFixed(4)}\n\n`;

    output += `### Aggregerade rankings:\n`;
    output += `| Placering | AI | Total poäng | Snitt | #1-röster |\n`;
    output += `|-----------|----|-----------:|------:|----------:|\n`;

    for (let i = 0; i < result.aggregated_rankings.length; i++) {
      const ranking = result.aggregated_rankings[i];
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
      output += `| ${medal} ${i + 1} | ${providerNames[ranking.original_provider]} | ${ranking.total_score} | ${ranking.avg_position.toFixed(1)} | ${ranking.votes_for_first} |\n`;
    }

    output += `\n### Individuella reviews:\n`;
    for (const review of result.reviews) {
      output += `\n**${providerNames[review.reviewer]} rankade:**\n`;
      for (const ranking of review.rankings) {
        const provider = this.responseMapping.get(ranking.response_id);
        output += `${ranking.position}. ${provider ? providerNames[provider] : ranking.response_id}: ${ranking.reasoning}\n`;
      }
    }

    return output;
  }

  /**
   * Hämta vinnande provider från ett review-resultat
   */
  getWinningResponse(
    result: PeerReviewResult,
    responses: DebateRound['responses']
  ): AIResponse {
    return responses[result.winner];
  }
}
