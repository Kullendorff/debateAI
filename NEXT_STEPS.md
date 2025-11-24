# 🚀 Nästa Steg - Roadmap för DebateAI

Detaljerad plan för att förbättra DebateAI med inspiration från llm-council.

---

## 📊 Status: Web UI Klar ✅

**Kostnad hittills: 0 kr** 🎉

Du har nu:
- ✅ Modern React Web UI med dark mode
- ✅ Interaktiv konsensus-graf
- ✅ Färgkodade AI-response cards
- ✅ Backend API för session-data
- ✅ Session selector och full debate view

---

## 🎯 Fas 2: Core Features från llm-council

### Feature 1: **Peer Review System med Anonymisering** ⭐⭐⭐

**Prioritet:** Hög
**Impact:** Mycket hög - ger bättre debatt-kvalitet
**Kostnad att utveckla:** 0 kr
**Kostnad att testa:** ~0.10 kr (1 test-runda med 3 AI)

#### Vad det är:
Efter runda 1, låt varje AI granska och ranka de andra AI:ernas svar **anonymt** (utan att veta vem som skrev vad). Detta undviker bias där GPT kanske är snäll mot Claude bara för att det är Claude.

#### Implementation:

```typescript
// src/peer-review.ts (NY FIL)
interface PeerReview {
  reviewer: 'openai' | 'gemini' | 'claude'
  rankings: {
    position: number  // 1, 2, 3
    response_id: string
    reasoning: string
  }[]
}

class PeerReviewSystem {
  // Anonymisera svar (shuffla ordning, ta bort AI-namn)
  async anonymizeResponses(responses: AIResponse[]): Promise<AnonymizedResponse[]>

  // Samla in rankings från varje AI
  async collectRankings(anonymizedResponses: AnonymizedResponse[]): Promise<PeerReview[]>

  // Analysera rankings och identifiera konsensus
  analyzeRankings(reviews: PeerReview[]): RankingAnalysis
}
```

#### Integration med ConsensusEngine:

```typescript
// Efter runda 1, innan runda 2:
if (round === 1) {
  const peerReviews = await this.peerReviewSystem.conductPeerReview(roundResult.responses)
  session.peer_reviews = peerReviews

  // Använd rankings för att informera runda 2
  const topRankedResponse = this.getTopRankedResponse(peerReviews)
  // Lägg till i prompt för runda 2
}
```

#### UI-Integration:
- Visa peer review-resultat i Web UI
- Ranking-tabell efter runda 1
- Visualisera vilka AI:er rankade vad

**Tidsestimering:** 2-3 timmar kodning, 10 min testning

---

### Feature 2: **Chairman Synthesis** ⭐⭐⭐

**Prioritet:** Hög
**Impact:** Hög - mycket bättre slutsvar än nuvarande primitiva synthesis
**Kostnad att utveckla:** 0 kr
**Kostnad att testa:** ~0.05 kr (1 synthesis-anrop)

#### Vad det är:
Istället för att bara välja längsta svaret, låt en AI agera "ordförande" som syntetiserar alla tre perspektiv till ett sammanhängande slutsvar.

#### Implementation:

```typescript
// src/chairman-synthesizer.ts (NY FIL)
class ChairmanSynthesizer {
  async synthesize(
    question: string,
    responses: DebateRound['responses'],
    chairman: 'openai' | 'gemini' | 'claude' = 'claude' // Claude är bra på syntes
  ): Promise<string> {
    const prompt = `Du är ordförande för en AI-konsensuspanel.

    Fråga: ${question}

    Tre AI-experter har gett sina perspektiv:

    **Expert A (${responses.openai.confidence}% konfidens):**
    ${responses.openai.content}

    **Expert B (${responses.claude.confidence}% konfidens):**
    ${responses.claude.content}

    **Expert C (${responses.gemini.confidence}% konfidens):**
    ${responses.gemini.content}

    Din uppgift som ordförande:
    1. Identifiera gemensamma insikter alla tre håller med om
    2. Notera områden där de är oeniga och varför
    3. Skapa ett balanserat slutsvar som väver samman de bästa delarna
    4. Om det finns fundamental oenighet, förklara varför

    Skapa ett sammanhängande slutsvar (2-3 paragrafer) som representerar panelens samlade visdom.`

    const client = this.aiManager.getClient(chairman)
    const synthesis = await client.generateResponse(prompt)
    return synthesis.content
  }
}
```

#### Integration:
```typescript
// I consensus-engine.ts, ersätt synthesizeFinalAnswer():
private async synthesizeFinalAnswer(round: DebateRound): Promise<string> {
  return await this.chairmanSynthesizer.synthesize(
    session.question,
    round.responses,
    'claude' // eller rotera mellan AI:erna
  )
}
```

#### UI-förbättring:
- Visa vem som var ordförande
- Markera syntetiserat svar med special styling
- Breakdown av vilka delar som kom från vilken AI

**Tidsestimering:** 1-2 timmar kodning, 5 min testning

---

### Feature 3: **Consensus Breakdown - Detaljerad Analys** ⭐⭐⭐

**Prioritet:** Hög
**Impact:** Hög - hjälper användare förstå *varför* konsensus är hög/låg
**Kostnad att utveckla:** 0 kr
**Kostnad att testa:** 0 kr (ingen AI-användning!)

#### Vad det är:
Bryt ner konsensus-score i flera komponenter för att visa exakt VAR AI:erna är överens/oeniga.

#### Implementation:

```typescript
// src/consensus-breakdown.ts (NY FIL)
interface ConsensusBreakdown {
  overall_score: number

  components: {
    semantic_similarity: number    // 0-1, hur lika svarar de semantiskt?
    factual_agreement: number      // 0-1, samma fakta/siffror?
    tonal_alignment: number        // 0-1, samma ton (positiv/negativ)?
    structural_similarity: number  // 0-1, samma struktur i argument?
  }

  agreement_points: string[]       // Vad är de överens om?
  disagreement_points: {
    point: string
    gpt_view: string
    claude_view: string
    gemini_view: string
  }[]

  key_differences: {
    dimension: string  // "temporal" (olika tidslinje), "scope" (olika omfattning), etc
    explanation: string
  }[]
}

class ConsensusAnalyzer {
  async analyzeConsensus(responses: DebateRound['responses']): Promise<ConsensusBreakdown> {
    return {
      overall_score: this.calculateOverallScore(responses),
      components: {
        semantic_similarity: await this.analyzeSemantic(responses),
        factual_agreement: this.analyzeFactual(responses),
        tonal_alignment: this.analyzeTone(responses),
        structural_similarity: this.analyzeStructure(responses)
      },
      agreement_points: this.extractAgreements(responses),
      disagreement_points: this.extractDisagreements(responses),
      key_differences: this.identifyDifferences(responses)
    }
  }

  private analyzeFactual(responses): number {
    // Extrahera alla numeriska värden, datum, namn
    const facts = {
      gpt: this.extractFacts(responses.openai.content),
      claude: this.extractFacts(responses.claude.content),
      gemini: this.extractFacts(responses.gemini.content)
    }

    // Jämför overlap av fakta
    return this.calculateFactualOverlap(facts)
  }

  private analyzeTone(responses): number {
    // Räkna positiva/negativa ord
    const sentiments = {
      gpt: this.analyzeSentiment(responses.openai.content),
      claude: this.analyzeSentiment(responses.claude.content),
      gemini: this.analyzeSentiment(responses.gemini.content)
    }

    // Om alla är positiva/negativa = hög alignment
    return this.calculateSentimentAlignment(sentiments)
  }

  private extractAgreements(responses): string[] {
    // Find common phrases/concepts mentioned by all 3
    // E.g., "AI kommer utvecklas", "Behöver reglering"
  }

  private extractDisagreements(responses): DisagreementPoint[] {
    // Find specific points where they differ
    // E.g., "Tidslinje: GPT säger 2030, Claude säger 2035"
  }
}
```

#### UI-Integration:

```typescript
// Ny komponent: ConsensusBreakdown.tsx
// Visar:
// - Komponent-scores med färgade progress bars
// - Lista av agreement points (gröna checkmarks)
// - Lista av disagreement points (röda varningar)
// - Radar chart med alla dimensioner
```

**Tidsestimering:** 3-4 timmar kodning, 0 kr testning (ingen AI!)

---

### Feature 4: **OpenRouter Integration** ⭐⭐

**Prioritet:** Medium
**Impact:** Medium - enklare att lägga till fler modeller
**Kostnad att utveckla:** 0 kr
**Kostnad att testa:** ~0.01 kr (1 verifierings-anrop)

#### Vad det är:
Använd OpenRouter som unified API istället för separata API-anrop till varje provider.

**Fördelar:**
- Ett API-nyckel istället för tre
- Enkel att lägga till nya modeller (Llama, Mistral, etc.)
- Enhetlig kostnadsspårning
- Fallback om en provider är nere

**Nackdelar:**
- Ett extra lager (latency +50-100ms)
- Beroende av tredje part

#### Implementation:

```typescript
// src/openrouter-client.ts (NY FIL)
class OpenRouterClient implements AIClient {
  private apiKey: string
  private baseUrl = 'https://openrouter.ai/api/v1'

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY!
  }

  async generateResponse(prompt: string, model: string): Promise<AIResponse> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://github.com/yourusername/debateAI',
        'X-Title': 'DebateAI',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model, // 'openai/gpt-4o', 'anthropic/claude-3.5-sonnet', etc.
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000
      })
    })

    const data = await response.json()

    return {
      content: data.choices[0].message.content,
      confidence: this.extractConfidence(data.choices[0].message.content),
      model: model,
      tokens_used: data.usage.total_tokens,
      cost_usd: this.calculateCost(data.usage, model)
    }
  }

  getAvailableModels(): string[] {
    return [
      'openai/gpt-4o',
      'anthropic/claude-3.5-sonnet',
      'google/gemini-2.0-flash-exp',
      'meta-llama/llama-3.1-70b-instruct',
      'mistralai/mistral-large'
    ]
  }
}
```

#### Config för att välja provider:

```typescript
// config.ts (NY FIL)
export const CONFIG = {
  useOpenRouter: false, // toggle mellan direct API och OpenRouter

  panel: [
    { provider: 'openai', model: 'gpt-4o' },
    { provider: 'anthropic', model: 'claude-3.5-sonnet' },
    { provider: 'google', model: 'gemini-2.0-flash-exp' }
  ]
}
```

**Tidsestimering:** 2 timmar kodning, 1 min testning

---

### Feature 5: **Tournament Mode** ⭐

**Prioritet:** Low (roligt men inte kritiskt)
**Impact:** Medium - alternativ till konsensus
**Kostnad att utveckla:** 0 kr
**Kostnad att testa:** ~0.20 kr (3 voting rounds)

#### Vad det är:
Istället för att nå konsensus, låt AI:erna rösta på vem som hade bästa svaret. Vinnaren går vidare!

#### Flow:
1. **Runda 1:** Alla ger initial respons
2. **Voting:** Varje AI röstar på bästa svaret (ej sitt eget)
3. **Result:** Vinnaren koras baserat på röster

#### Implementation:

```typescript
// src/tournament.ts (NY FIL)
interface TournamentResult {
  winner: 'openai' | 'gemini' | 'claude'
  votes: {
    openai_voted_for: 'gemini' | 'claude'
    gemini_voted_for: 'openai' | 'claude'
    claude_voted_for: 'openai' | 'gemini'
  }
  reasoning: {
    openai: string
    gemini: string
    claude: string
  }
  final_answer: string
}

class TournamentMode {
  async conductTournament(
    question: string,
    responses: DebateRound['responses']
  ): Promise<TournamentResult> {
    const votes = await this.collectVotes(responses)
    const winner = this.determineWinner(votes)

    return {
      winner,
      votes,
      reasoning: votes.reasoning,
      final_answer: responses[winner].content
    }
  }

  private async collectVotes(responses): Promise<VoteResults> {
    // Låt GPT rösta på Claude eller Gemini
    // Låt Claude rösta på GPT eller Gemini
    // Låt Gemini rösta på GPT eller Claude

    // Använd anonymiserade svar för att undvika bias
  }
}
```

**Tidsestimering:** 2-3 timmar kodning, 10 min testning

---

## 🎨 Fas 3: Web UI Förbättringar (0 kr!)

Alla dessa är **helt gratis** att implementera:

### Feature 6: **Live Debate Streaming** ⭐⭐

Visa pågående debatt i realtid istället för bara avslutade.

```typescript
// Backend: WebSocket support
import { WebSocketServer } from 'ws'

const wss = new WebSocketServer({ port: 3002 })

// I consensus-engine.ts:
private async conductRound(...) {
  // Efter varje AI-respons:
  this.broadcastUpdate({
    type: 'ai_response',
    ai: 'gpt',
    content: response.content
  })
}
```

**Frontend:** Live uppdateringar med WebSocket

**Tidsestimering:** 3-4 timmar

---

### Feature 7: **Session Comparison** ⭐⭐

Jämför flera debatter side-by-side.

```typescript
// CompareView.tsx
// Visa 2-3 debatter bredvid varandra
// Jämför konsensus, kostnad, rundor
// Highlight skillnader
```

**Tidsestimering:** 2-3 timmar

---

### Feature 8: **Advanced Filtering & Search** ⭐

```typescript
// SessionSelector med filter:
- Status: consensus | deadlock | paused
- Konsensus: >85% | 60-85% | <60%
- Kostnad: <$0.10 | $0.10-0.50 | >$0.50
- Datum: senaste veckan | månaden | allt

// Search i innehåll:
- Sök i frågor
- Sök i AI-svar
- Full-text search
```

**Tidsestimering:** 2-3 timmar

---

### Feature 9: **Export till PDF** ⭐

Generera snygg PDF från HTML-rapporten.

```bash
npm install puppeteer
```

```typescript
// pdf-exporter.ts
import puppeteer from 'puppeteer'

async function exportToPDF(sessionId: string) {
  const html = await consensusEngine.getDebateLog(sessionId, 'html')
  const browser = await puppeteer.launch()
  const page = await browser.newPage()
  await page.setContent(html)
  await page.pdf({
    path: `debate-${sessionId}.pdf`,
    format: 'A4'
  })
  await browser.close()
}
```

**Tidsestimering:** 1-2 timmar

---

### Feature 10: **Dark/Light Mode Toggle** ⭐

Låt användaren välja tema.

```typescript
// useTheme hook
const [theme, setTheme] = useState<'dark' | 'light'>('dark')

// Toggle i header
<button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
  {theme === 'dark' ? '☀️' : '🌙'}
</button>
```

**Tidsestimering:** 1 timme

---

## 📋 Rekommenderad Ordning

### Vecka 1: Core Features (Kräver minimal API-testning)

1. **Consensus Breakdown** (0 kr) - 3-4h
2. **Chairman Synthesis** (~0.05 kr) - 2h
3. **Peer Review System** (~0.10 kr) - 3h

**Total tid:** ~8-10 timmar
**Total kostnad:** ~0.15 kr (15 öre!)

### Vecka 2: Web UI Enhancements (0 kr)

4. **Advanced Filtering & Search** - 3h
5. **Dark/Light Mode Toggle** - 1h
6. **Export till PDF** - 2h
7. **Session Comparison** - 3h

**Total tid:** ~9 timmar
**Total kostnad:** 0 kr

### Vecka 3: Optional Features

8. **OpenRouter Integration** (~0.01 kr) - 2h
9. **Tournament Mode** (~0.20 kr) - 3h
10. **Live Debate Streaming** - 4h

**Total tid:** ~9 timmar
**Total kostnad:** ~0.21 kr

---

## 💰 Budget Summary

| Feature | Dev Kostnad | Test Kostnad | Prioritet |
|---------|-------------|--------------|-----------|
| Peer Review | 0 kr | 0.10 kr | ⭐⭐⭐ |
| Chairman Synthesis | 0 kr | 0.05 kr | ⭐⭐⭐ |
| Consensus Breakdown | 0 kr | 0 kr | ⭐⭐⭐ |
| OpenRouter | 0 kr | 0.01 kr | ⭐⭐ |
| Tournament Mode | 0 kr | 0.20 kr | ⭐ |
| Web UI Features (alla) | 0 kr | 0 kr | ⭐⭐ |
| **TOTAL** | **0 kr** | **~0.36 kr** | - |

---

## 🎯 Min Rekommendation

### Börja med (i denna ordning):

1. ✅ **Consensus Breakdown** (0 kr, hög impact)
   - Ger omedelbar insikt i befintliga debatter
   - Ingen API-kostnad alls
   - Förbättrar förståelsen av resultaten

2. ✅ **Chairman Synthesis** (0.05 kr, hög impact)
   - Mycket bättre slutsvar än nuvarande
   - Minimal kostnad
   - Stor kvalitetsförbättring

3. ✅ **Peer Review System** (0.10 kr, hög impact)
   - Bättre debatt-kvalitet
   - Undviker AI-bias
   - Mer intressanta insights

**Total kostnad för dessa tre: 0.15 kr (15 öre)**
**Total utvecklingstid: ~8-10 timmar**
**Impact: Enorm förbättring av debatt-kvalitet**

---

## 🚀 Nästa Kommando

Säg bara vilken feature du vill jag ska börja med, så kör jag igång!

Exempel:
- "Börja med consensus breakdown"
- "Koda chairman synthesis"
- "Implementera peer review"

Eller vill du se en demo av hur någon feature skulle fungera först?
