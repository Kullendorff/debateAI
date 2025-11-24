/**
 * Chairman Synthesizer - Intelligent slutsvar från ordförande
 *
 * Istället för att bara välja längsta svaret, låt en AI agera "ordförande"
 * som syntetiserar alla tre perspektiv till ett sammanhängande slutsvar.
 *
 * Inspirerat av llm-council Stage 3.
 *
 * Kostnad: ~0.05 kr per syntes (ett AI-anrop)
 */

import { DebateRound, AIResponse, DebateSession } from './types.js';
import { AIClientManager } from './ai-clients.js';
import { ConsensusAnalyzer, ConsensusBreakdown } from './consensus-breakdown.js';

export interface SynthesisResult {
  synthesized_answer: string;
  chairman: 'openai' | 'gemini' | 'claude';
  key_agreements: string[];
  key_disagreements: string[];
  confidence: number;
  cost_usd: number;
  tokens_used: number;
}

export class ChairmanSynthesizer {
  private aiManager: AIClientManager;
  private consensusAnalyzer: ConsensusAnalyzer;

  constructor(aiManager: AIClientManager) {
    this.aiManager = aiManager;
    this.consensusAnalyzer = new ConsensusAnalyzer();
  }

  /**
   * Syntetisera ett slutsvar från alla AI-perspektiv
   */
  async synthesize(
    session: DebateSession,
    round: DebateRound,
    chairman: 'openai' | 'gemini' | 'claude' = 'claude'
  ): Promise<SynthesisResult> {
    const client = this.aiManager.getClient(chairman);
    if (!client) {
      throw new Error(`Chairman client ${chairman} is not available`);
    }

    // Analysera konsensus först för att ge ordföranden kontext
    const breakdown = this.consensusAnalyzer.analyzeConsensus(round.responses);

    // Bygg prompt för ordföranden
    const prompt = this.buildSynthesisPrompt(session, round, breakdown);

    console.error(`[Chairman] Starting synthesis with ${chairman}...`);
    console.error(`[Chairman] Consensus breakdown: ${(breakdown.overall_score * 100).toFixed(1)}%`);

    try {
      const response = await client.generateResponse(prompt);

      console.error(`[Chairman] Synthesis complete. Cost: $${response.cost_usd.toFixed(4)}`);

      return {
        synthesized_answer: response.content,
        chairman,
        key_agreements: breakdown.agreement_points,
        key_disagreements: breakdown.disagreement_points.map(d => d.point),
        confidence: response.confidence,
        cost_usd: response.cost_usd,
        tokens_used: response.tokens_used
      };
    } catch (error: any) {
      console.error(`[Chairman] Synthesis failed: ${error.message}`);
      throw new Error(`Chairman synthesis failed: ${error.message}`);
    }
  }

  /**
   * Bygg prompt för ordförandens syntes
   */
  private buildSynthesisPrompt(
    session: DebateSession,
    round: DebateRound,
    breakdown: ConsensusBreakdown
  ): string {
    const consensusLevel = breakdown.overall_score >= 0.7 ? 'stark' :
                          breakdown.overall_score >= 0.5 ? 'moderat' : 'svag';

    // Formatera komponent-scores
    const componentSummary = `
- Semantisk likhet: ${(breakdown.components.semantic_similarity * 100).toFixed(0)}%
- Faktaöverensstämmelse: ${(breakdown.components.factual_agreement * 100).toFixed(0)}%
- Tonmässig alignment: ${(breakdown.components.tonal_alignment * 100).toFixed(0)}%
- Konfidens-alignment: ${(breakdown.components.confidence_alignment * 100).toFixed(0)}%`;

    // Formatera enighets/oenighets-punkter
    let agreementText = breakdown.agreement_points.length > 0
      ? breakdown.agreement_points.map(p => `- ${p}`).join('\n')
      : '- Inga tydliga enigheter identifierade';

    let disagreementText = breakdown.disagreement_points.length > 0
      ? breakdown.disagreement_points.map(d => `- ${d.point}`).join('\n')
      : '- Inga tydliga oenigheter identifierade';

    return `Du är ordförande för en AI-konsensuspanel. Din uppgift är att syntetisera ett slutgiltigt svar baserat på tre AI-experters perspektiv.

## ORIGINALFRÅGA
${session.question}
${session.context ? `\n**Kontext:** ${session.context}` : ''}

## DEBATTENS KONTEXT
- Antal genomförda rundor: ${session.rounds.length}
- Konsensusnivå: ${(breakdown.overall_score * 100).toFixed(1)}% (${consensusLevel})
${componentSummary}

## DE TRE EXPERTERNAS SVAR (RUNDA ${round.round_number})

### EXPERT A: GPT-4o (${round.responses.openai.confidence}% konfidens)
${round.responses.openai.content}

---

### EXPERT B: Claude (${round.responses.claude.confidence}% konfidens)
${round.responses.claude.content}

---

### EXPERT C: Gemini (${round.responses.gemini.confidence}% konfidens)
${round.responses.gemini.content}

---

## ANALYSERAD ENIGHET
${agreementText}

## ANALYSERAD OENIGHET
${disagreementText}

## DIN UPPGIFT SOM ORDFÖRANDE

Skapa ett sammanhängande slutsvar (2-4 paragrafer) som:

1. **Identifierar gemensamma insikter** - Vad är alla tre överens om?
2. **Väver samman de bästa delarna** - Ta det starkaste från varje perspektiv
3. **Hanterar oenigheter** - Om det finns fundamental oenighet, förklara varför och vilka perspektiv som finns
4. **Ger ett balanserat slutsvar** - Representera panelens samlade visdom

${breakdown.overall_score < 0.5 ? `
**VIKTIGT:** Konsensusen är låg (${(breakdown.overall_score * 100).toFixed(0)}%). Det är OK att erkänna att det finns flera giltiga perspektiv. Tvinga inte fram en falsk konsensus - förklara istället de olika ståndpunkterna och deras styrkor.
` : ''}

**FORMAT:**
- Skriv på svenska
- Var tydlig och koncis
- Om du har en konfidensnivå, ange den som en procentsats
- Avsluta med en kort sammanfattning av slutsatsen

---

**DITT SYNTETISERADE SLUTSVAR:**`;
  }

  /**
   * Välj bästa ordförande baserat på frågans karaktär
   */
  selectOptimalChairman(
    session: DebateSession,
    round: DebateRound
  ): 'openai' | 'gemini' | 'claude' {
    // Analysera frågan och svaren för att välja optimal ordförande

    const question = session.question.toLowerCase();

    // Claude är bra på syntes och nyanserade resonemang
    if (question.includes('analysera') ||
        question.includes('jämför') ||
        question.includes('resonemang') ||
        question.includes('etik') ||
        question.includes('filosofi')) {
      return 'claude';
    }

    // GPT är bra på strukturerade svar och fakta
    if (question.includes('lista') ||
        question.includes('steg') ||
        question.includes('hur') ||
        question.includes('fakta')) {
      return 'openai';
    }

    // Gemini är bra på kreativa och breda frågor
    if (question.includes('kreativ') ||
        question.includes('idéer') ||
        question.includes('framtid') ||
        question.includes('möjligheter')) {
      return 'gemini';
    }

    // Default: rotera baserat på rundnummer
    const chairmanRotation: ('claude' | 'openai' | 'gemini')[] = ['claude', 'openai', 'gemini'];
    return chairmanRotation[round.round_number % 3];
  }

  /**
   * Formatera syntesresultat för visning
   */
  formatSynthesisResult(result: SynthesisResult): string {
    const chairmanNames = {
      'openai': 'GPT-4o',
      'claude': 'Claude Sonnet 4',
      'gemini': 'Gemini'
    };

    let output = `## Ordförandens Syntes\n\n`;
    output += `**Ordförande:** ${chairmanNames[result.chairman]}\n`;
    output += `**Konfidens:** ${result.confidence}%\n`;
    output += `**Kostnad:** $${result.cost_usd.toFixed(4)}\n\n`;

    output += `### Slutsvar:\n${result.synthesized_answer}\n\n`;

    if (result.key_agreements.length > 0) {
      output += `### Identifierade enigheter:\n`;
      for (const agreement of result.key_agreements) {
        output += `- ${agreement}\n`;
      }
      output += `\n`;
    }

    if (result.key_disagreements.length > 0) {
      output += `### Hanterade oenigheter:\n`;
      for (const disagreement of result.key_disagreements) {
        output += `- ${disagreement}\n`;
      }
    }

    return output;
  }
}
