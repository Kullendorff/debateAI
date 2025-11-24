/**
 * Consensus Breakdown - Detaljerad analys av konsensus
 *
 * Bryter ner konsensus-score i flera komponenter för att visa
 * exakt VAR AI:erna är överens/oeniga.
 *
 * Kostnad: 0 kr (ingen AI-användning!)
 */

import { DebateRound, AIResponse } from './types.js';

export interface ConsensusBreakdown {
  overall_score: number;

  components: {
    semantic_similarity: number;    // 0-1, hur lika svarar de semantiskt?
    factual_agreement: number;      // 0-1, samma fakta/siffror?
    tonal_alignment: number;        // 0-1, samma ton (positiv/negativ)?
    structural_similarity: number;  // 0-1, samma struktur i argument?
    confidence_alignment: number;   // 0-1, hur lika är deras säkerhet?
  };

  agreement_points: string[];       // Vad är de överens om?

  disagreement_points: {
    point: string;
    gpt_view: string;
    claude_view: string;
    gemini_view: string;
  }[];

  key_differences: {
    dimension: string;  // "temporal", "scope", "methodology", etc.
    explanation: string;
  }[];
}

// Svenska stoppord att filtrera bort
const SWEDISH_STOPWORDS = new Set([
  'och', 'i', 'att', 'en', 'ett', 'som', 'det', 'den', 'för', 'på', 'är',
  'av', 'till', 'med', 'de', 'har', 'om', 'vi', 'kan', 'inte', 'vara',
  'eller', 'från', 'men', 'så', 'ut', 'du', 'han', 'hon', 'dem', 'sig',
  'sin', 'sina', 'sitt', 'där', 'här', 'när', 'hur', 'vad', 'vilken',
  'denna', 'detta', 'dessa', 'finns', 'finns', 'skulle', 'kunna', 'måste',
  'ska', 'kommer', 'blir', 'blev', 'varit', 'hade', 'också', 'även',
  'bara', 'mer', 'mest', 'alla', 'allt', 'mycket', 'många', 'några',
  'sedan', 'under', 'efter', 'mellan', 'andra', 'annat', 'samma',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'can', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'or', 'and', 'but', 'if', 'then',
  'else', 'when', 'up', 'out', 'no', 'not', 'so', 'what', 'which',
  'who', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
  'other', 'some', 'such', 'than', 'too', 'very', 'just', 'also'
]);

// Positiva och negativa ord för sentimentanalys
const POSITIVE_WORDS = new Set([
  'bra', 'utmärkt', 'fantastisk', 'positiv', 'framgång', 'möjlighet',
  'fördel', 'fördelar', 'potential', 'lovande', 'optimistisk', 'stark',
  'effektiv', 'gynnsam', 'framsteg', 'förbättring', 'innovation',
  'good', 'great', 'excellent', 'positive', 'success', 'opportunity',
  'advantage', 'potential', 'promising', 'optimistic', 'strong',
  'effective', 'favorable', 'progress', 'improvement', 'innovation',
  'beneficial', 'helpful', 'useful', 'valuable', 'important'
]);

const NEGATIVE_WORDS = new Set([
  'dålig', 'problem', 'risk', 'risker', 'nackdel', 'nackdelar', 'svår',
  'svårt', 'utmaning', 'begränsning', 'oro', 'osäkerhet', 'negativ',
  'hot', 'fara', 'brist', 'brister', 'misslyckande', 'hinder',
  'bad', 'problem', 'risk', 'risks', 'disadvantage', 'difficult',
  'challenge', 'limitation', 'concern', 'uncertainty', 'negative',
  'threat', 'danger', 'lack', 'failure', 'obstacle', 'issue',
  'harmful', 'dangerous', 'problematic', 'concerning', 'worrying'
]);

export class ConsensusAnalyzer {

  /**
   * Analysera konsensus mellan AI-svar
   */
  analyzeConsensus(responses: DebateRound['responses']): ConsensusBreakdown {
    const contents = {
      gpt: responses.openai.content,
      claude: responses.claude.content,
      gemini: responses.gemini.content
    };

    const confidences = {
      gpt: responses.openai.confidence,
      claude: responses.claude.confidence,
      gemini: responses.gemini.confidence
    };

    // Beräkna alla komponenter
    const components = {
      semantic_similarity: this.analyzeSemanticSimilarity(contents),
      factual_agreement: this.analyzeFactualAgreement(contents),
      tonal_alignment: this.analyzeTonalAlignment(contents),
      structural_similarity: this.analyzeStructuralSimilarity(contents),
      confidence_alignment: this.analyzeConfidenceAlignment(confidences)
    };

    // Beräkna overall score som viktat medelvärde
    const overall_score = this.calculateOverallScore(components);

    return {
      overall_score,
      components,
      agreement_points: this.extractAgreementPoints(contents),
      disagreement_points: this.extractDisagreementPoints(contents),
      key_differences: this.identifyKeyDifferences(contents, components)
    };
  }

  /**
   * Semantisk likhet baserat på keyword overlap (förbättrad Jaccard)
   */
  private analyzeSemanticSimilarity(contents: { gpt: string; claude: string; gemini: string }): number {
    const keywords = {
      gpt: this.extractKeywords(contents.gpt),
      claude: this.extractKeywords(contents.claude),
      gemini: this.extractKeywords(contents.gemini)
    };

    // Beräkna parvisa Jaccard-likheter
    const similarities = [
      this.jaccardSimilarity(keywords.gpt, keywords.claude),
      this.jaccardSimilarity(keywords.gpt, keywords.gemini),
      this.jaccardSimilarity(keywords.claude, keywords.gemini)
    ];

    return similarities.reduce((a, b) => a + b, 0) / similarities.length;
  }

  /**
   * Analysera faktisk överensstämmelse (siffror, datum, namn)
   */
  private analyzeFactualAgreement(contents: { gpt: string; claude: string; gemini: string }): number {
    const facts = {
      gpt: this.extractFacts(contents.gpt),
      claude: this.extractFacts(contents.claude),
      gemini: this.extractFacts(contents.gemini)
    };

    // Om inga fakta hittades, returnera neutral score
    const totalFacts = facts.gpt.length + facts.claude.length + facts.gemini.length;
    if (totalFacts === 0) return 0.7; // Neutral - ingen faktakonflikt

    // Beräkna overlap av fakta
    const allFacts = new Set([...facts.gpt, ...facts.claude, ...facts.gemini]);
    const commonFacts = [...allFacts].filter(fact =>
      facts.gpt.includes(fact) || facts.claude.includes(fact) || facts.gemini.includes(fact)
    );

    // Hur många fakta nämns av minst 2 AI:er?
    let sharedCount = 0;
    for (const fact of allFacts) {
      const mentionedBy = [
        facts.gpt.includes(fact),
        facts.claude.includes(fact),
        facts.gemini.includes(fact)
      ].filter(Boolean).length;
      if (mentionedBy >= 2) sharedCount++;
    }

    return allFacts.size > 0 ? sharedCount / allFacts.size : 0.7;
  }

  /**
   * Analysera tonmässig överensstämmelse (sentiment)
   */
  private analyzeTonalAlignment(contents: { gpt: string; claude: string; gemini: string }): number {
    const sentiments = {
      gpt: this.analyzeSentiment(contents.gpt),
      claude: this.analyzeSentiment(contents.claude),
      gemini: this.analyzeSentiment(contents.gemini)
    };

    // Beräkna hur lika sentimenten är (-1 till 1, normalisera till 0-1)
    const diffs = [
      Math.abs(sentiments.gpt - sentiments.claude),
      Math.abs(sentiments.gpt - sentiments.gemini),
      Math.abs(sentiments.claude - sentiments.gemini)
    ];

    const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    // Konvertera från diff (0-2 range) till similarity (0-1)
    return 1 - (avgDiff / 2);
  }

  /**
   * Analysera strukturell likhet (längd, antal stycken, punktlistor)
   */
  private analyzeStructuralSimilarity(contents: { gpt: string; claude: string; gemini: string }): number {
    const structures = {
      gpt: this.analyzeStructure(contents.gpt),
      claude: this.analyzeStructure(contents.claude),
      gemini: this.analyzeStructure(contents.gemini)
    };

    // Jämför strukturella egenskaper
    const lengthSimilarity = this.compareLengths([
      structures.gpt.length,
      structures.claude.length,
      structures.gemini.length
    ]);

    const paragraphSimilarity = this.compareLengths([
      structures.gpt.paragraphs,
      structures.claude.paragraphs,
      structures.gemini.paragraphs
    ]);

    const listSimilarity = this.compareLengths([
      structures.gpt.bulletPoints,
      structures.claude.bulletPoints,
      structures.gemini.bulletPoints
    ]);

    return (lengthSimilarity + paragraphSimilarity + listSimilarity) / 3;
  }

  /**
   * Analysera konfidens-alignment
   */
  private analyzeConfidenceAlignment(confidences: { gpt: number; claude: number; gemini: number }): number {
    const values = [confidences.gpt, confidences.claude, confidences.gemini];
    const avg = values.reduce((a, b) => a + b, 0) / values.length;

    // Beräkna standardavvikelse
    const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // Normalisera: låg stdDev = hög alignment
    // Max möjlig stdDev för 0-100 skala är ~47 (om en är 0, en är 50, en är 100)
    return Math.max(0, 1 - (stdDev / 50));
  }

  /**
   * Beräkna övergripande konsensus-score
   */
  private calculateOverallScore(components: ConsensusBreakdown['components']): number {
    // Viktad kombination av komponenter
    const weights = {
      semantic_similarity: 0.35,      // Viktigast - vad säger de?
      factual_agreement: 0.25,        // Viktigt - samma fakta?
      tonal_alignment: 0.15,          // Mindre viktigt - samma ton?
      structural_similarity: 0.10,    // Minst viktigt - samma format?
      confidence_alignment: 0.15      // Medelviktigt - samma säkerhet?
    };

    return (
      components.semantic_similarity * weights.semantic_similarity +
      components.factual_agreement * weights.factual_agreement +
      components.tonal_alignment * weights.tonal_alignment +
      components.structural_similarity * weights.structural_similarity +
      components.confidence_alignment * weights.confidence_alignment
    );
  }

  /**
   * Extrahera punkter där alla AI:er är överens
   */
  private extractAgreementPoints(contents: { gpt: string; claude: string; gemini: string }): string[] {
    const agreements: string[] = [];

    // Hitta gemensamma nyckelfraser (3+ ord sekvenser som förekommer i alla)
    const phrases = {
      gpt: this.extractPhrases(contents.gpt),
      claude: this.extractPhrases(contents.claude),
      gemini: this.extractPhrases(contents.gemini)
    };

    // Hitta gemensamma koncept
    const commonPhrases = phrases.gpt.filter(phrase =>
      phrases.claude.some(p => this.phraseSimilar(phrase, p)) &&
      phrases.gemini.some(p => this.phraseSimilar(phrase, p))
    );

    // Formatera som agreement points
    for (const phrase of commonPhrases.slice(0, 5)) {
      agreements.push(`Alla tre nämner: "${phrase}"`);
    }

    // Lägg till konfidens-baserade observationer
    const keywords = {
      gpt: this.extractKeywords(contents.gpt),
      claude: this.extractKeywords(contents.claude),
      gemini: this.extractKeywords(contents.gemini)
    };

    const allKeywords = [...keywords.gpt, ...keywords.claude, ...keywords.gemini];
    const keywordCounts = new Map<string, number>();
    for (const kw of allKeywords) {
      keywordCounts.set(kw, (keywordCounts.get(kw) || 0) + 1);
    }

    // Ord som nämns av alla tre
    const unanimousKeywords = [...keywordCounts.entries()]
      .filter(([_, count]) => count >= 3)
      .map(([word, _]) => word);

    if (unanimousKeywords.length > 0) {
      agreements.push(`Gemensamma nyckelteman: ${unanimousKeywords.slice(0, 5).join(', ')}`);
    }

    return agreements;
  }

  /**
   * Extrahera punkter där AI:erna är oeniga
   */
  private extractDisagreementPoints(contents: { gpt: string; claude: string; gemini: string }): ConsensusBreakdown['disagreement_points'] {
    const disagreements: ConsensusBreakdown['disagreement_points'] = [];

    // Analysera sentiment-skillnader
    const sentiments = {
      gpt: this.analyzeSentiment(contents.gpt),
      claude: this.analyzeSentiment(contents.claude),
      gemini: this.analyzeSentiment(contents.gemini)
    };

    // Om stor sentiment-skillnad
    const maxSentimentDiff = Math.max(
      Math.abs(sentiments.gpt - sentiments.claude),
      Math.abs(sentiments.gpt - sentiments.gemini),
      Math.abs(sentiments.claude - sentiments.gemini)
    );

    if (maxSentimentDiff > 0.5) {
      disagreements.push({
        point: 'Tonläge och attityd',
        gpt_view: this.getSentimentDescription(sentiments.gpt),
        claude_view: this.getSentimentDescription(sentiments.claude),
        gemini_view: this.getSentimentDescription(sentiments.gemini)
      });
    }

    // Hitta unika nyckelord per AI
    const keywords = {
      gpt: new Set(this.extractKeywords(contents.gpt)),
      claude: new Set(this.extractKeywords(contents.claude)),
      gemini: new Set(this.extractKeywords(contents.gemini))
    };

    const uniqueToGpt = [...keywords.gpt].filter(kw => !keywords.claude.has(kw) && !keywords.gemini.has(kw));
    const uniqueToClaude = [...keywords.claude].filter(kw => !keywords.gpt.has(kw) && !keywords.gemini.has(kw));
    const uniqueToGemini = [...keywords.gemini].filter(kw => !keywords.gpt.has(kw) && !keywords.claude.has(kw));

    if (uniqueToGpt.length > 2 || uniqueToClaude.length > 2 || uniqueToGemini.length > 2) {
      disagreements.push({
        point: 'Fokusområden',
        gpt_view: uniqueToGpt.length > 0 ? `Fokuserar på: ${uniqueToGpt.slice(0, 3).join(', ')}` : 'Delar fokus med andra',
        claude_view: uniqueToClaude.length > 0 ? `Fokuserar på: ${uniqueToClaude.slice(0, 3).join(', ')}` : 'Delar fokus med andra',
        gemini_view: uniqueToGemini.length > 0 ? `Fokuserar på: ${uniqueToGemini.slice(0, 3).join(', ')}` : 'Delar fokus med andra'
      });
    }

    return disagreements;
  }

  /**
   * Identifiera nyckeldimensioner av skillnad
   */
  private identifyKeyDifferences(
    contents: { gpt: string; claude: string; gemini: string },
    components: ConsensusBreakdown['components']
  ): ConsensusBreakdown['key_differences'] {
    const differences: ConsensusBreakdown['key_differences'] = [];

    // Baserat på komponent-scores, identifiera problemområden
    if (components.semantic_similarity < 0.5) {
      differences.push({
        dimension: 'Semantisk',
        explanation: 'AI:erna använder olika terminologi och uttrycker sig på väsentligt olika sätt.'
      });
    }

    if (components.factual_agreement < 0.5) {
      differences.push({
        dimension: 'Faktuell',
        explanation: 'AI:erna refererar till olika fakta, siffror eller exempel.'
      });
    }

    if (components.tonal_alignment < 0.5) {
      differences.push({
        dimension: 'Tonmässig',
        explanation: 'AI:erna har olika attityd - en mer positiv, en mer skeptisk.'
      });
    }

    if (components.confidence_alignment < 0.5) {
      differences.push({
        dimension: 'Säkerhet',
        explanation: 'AI:erna är olika säkra på sina svar - stor variation i konfidens.'
      });
    }

    // Analysera längdskillnader
    const lengths = [contents.gpt.length, contents.claude.length, contents.gemini.length];
    const maxLen = Math.max(...lengths);
    const minLen = Math.min(...lengths);
    if (maxLen > minLen * 2) {
      differences.push({
        dimension: 'Omfattning',
        explanation: 'AI:erna gav svar av mycket olika längd - olika detaljnivå.'
      });
    }

    return differences;
  }

  // === HJÄLPFUNKTIONER ===

  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase()
      .replace(/[^\wåäöÅÄÖ\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !SWEDISH_STOPWORDS.has(word));

    // Räkna ordfrekvens och returnera de vanligaste
    const freq = new Map<string, number>();
    for (const word of words) {
      freq.set(word, (freq.get(word) || 0) + 1);
    }

    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word, _]) => word);
  }

  private extractFacts(text: string): string[] {
    const facts: string[] = [];

    // Hitta årtal
    const yearsMatch = text.match(/\b(19|20)\d{2}\b/g);
    const years: string[] = yearsMatch ? [...yearsMatch] : [];
    facts.push(...years);

    // Hitta procent
    const percentagesMatch = text.match(/\d+[,.]?\d*\s*%/g);
    const percentages: string[] = percentagesMatch ? [...percentagesMatch] : [];
    facts.push(...percentages.map(p => p.trim()));

    // Hitta belopp
    const amountsMatch = text.match(/\d+[,.]?\d*\s*(kr|SEK|USD|\$|€|miljoner|miljarder)/gi);
    const amounts: string[] = amountsMatch ? [...amountsMatch] : [];
    facts.push(...amounts.map(a => a.trim()));

    // Hitta specifika siffror (inte årtal)
    const numbersMatch = text.match(/\b\d{1,3}([,.\s]\d{3})*\b/g);
    const numbers: string[] = numbersMatch ? [...numbersMatch] : [];
    facts.push(...numbers.filter(n => !years.includes(n)));

    return [...new Set(facts)];
  }

  private analyzeSentiment(text: string): number {
    const words = text.toLowerCase().split(/\s+/);
    let positiveCount = 0;
    let negativeCount = 0;

    for (const word of words) {
      if (POSITIVE_WORDS.has(word)) positiveCount++;
      if (NEGATIVE_WORDS.has(word)) negativeCount++;
    }

    const total = positiveCount + negativeCount;
    if (total === 0) return 0; // Neutral

    // Returnera värde mellan -1 (negativ) och 1 (positiv)
    return (positiveCount - negativeCount) / total;
  }

  private getSentimentDescription(sentiment: number): string {
    if (sentiment > 0.3) return 'Positiv/optimistisk ton';
    if (sentiment < -0.3) return 'Skeptisk/försiktig ton';
    return 'Neutral/balanserad ton';
  }

  private analyzeStructure(text: string): { length: number; paragraphs: number; bulletPoints: number } {
    return {
      length: text.length,
      paragraphs: (text.match(/\n\n/g) || []).length + 1,
      bulletPoints: (text.match(/^[\s]*[-•*]\s/gm) || []).length +
                   (text.match(/^\d+\.\s/gm) || []).length
    };
  }

  private jaccardSimilarity(set1: string[], set2: string[]): number {
    const s1 = new Set(set1);
    const s2 = new Set(set2);
    const intersection = [...s1].filter(x => s2.has(x));
    const union = new Set([...s1, ...s2]);
    return union.size > 0 ? intersection.length / union.size : 0;
  }

  private compareLengths(values: number[]): number {
    const max = Math.max(...values);
    const min = Math.min(...values);
    if (max === 0) return 1;
    return min / max;
  }

  private extractPhrases(text: string): string[] {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const phrases: string[] = [];

    for (const sentence of sentences) {
      const words = sentence.trim().split(/\s+/);
      // Extrahera 3-5 ord fraser
      for (let i = 0; i < words.length - 2; i++) {
        const phrase = words.slice(i, i + 3).join(' ').toLowerCase();
        if (phrase.length > 10) {
          phrases.push(phrase);
        }
      }
    }

    return phrases;
  }

  private phraseSimilar(phrase1: string, phrase2: string): boolean {
    // Enkel likhetskontroll baserat på ordöverlapp
    const words1 = new Set(phrase1.toLowerCase().split(/\s+/));
    const words2 = new Set(phrase2.toLowerCase().split(/\s+/));
    const intersection = [...words1].filter(w => words2.has(w));
    return intersection.length >= 2;
  }

  /**
   * Formatera ConsensusBreakdown för visning
   */
  formatBreakdown(breakdown: ConsensusBreakdown): string {
    let output = `## Konsensusanalys\n\n`;
    output += `**Övergripande konsensus:** ${(breakdown.overall_score * 100).toFixed(1)}%\n\n`;

    output += `### Komponent-scores:\n`;
    output += `- Semantisk likhet: ${(breakdown.components.semantic_similarity * 100).toFixed(0)}%\n`;
    output += `- Faktaöverensstämmelse: ${(breakdown.components.factual_agreement * 100).toFixed(0)}%\n`;
    output += `- Tonmässig alignment: ${(breakdown.components.tonal_alignment * 100).toFixed(0)}%\n`;
    output += `- Strukturell likhet: ${(breakdown.components.structural_similarity * 100).toFixed(0)}%\n`;
    output += `- Konfidens-alignment: ${(breakdown.components.confidence_alignment * 100).toFixed(0)}%\n\n`;

    if (breakdown.agreement_points.length > 0) {
      output += `### Enighet:\n`;
      for (const point of breakdown.agreement_points) {
        output += `- ${point}\n`;
      }
      output += `\n`;
    }

    if (breakdown.disagreement_points.length > 0) {
      output += `### Oenighet:\n`;
      for (const point of breakdown.disagreement_points) {
        output += `**${point.point}:**\n`;
        output += `- GPT: ${point.gpt_view}\n`;
        output += `- Claude: ${point.claude_view}\n`;
        output += `- Gemini: ${point.gemini_view}\n\n`;
      }
    }

    if (breakdown.key_differences.length > 0) {
      output += `### Nyckeldimensioner av skillnad:\n`;
      for (const diff of breakdown.key_differences) {
        output += `- **${diff.dimension}:** ${diff.explanation}\n`;
      }
    }

    return output;
  }
}
