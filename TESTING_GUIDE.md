# 🧪 Testing Guide - DebateAI

Komplett guide för att testa DebateAI-systemet.

## 📋 Innehåll

1. [Snabbtest](#snabbtest)
2. [MCP Server Testing](#mcp-server-testing)
3. [Web UI Testing](#web-ui-testing)
4. [Integration Testing](#integration-testing)
5. [Automated Testing (Framtida)](#automated-testing)

---

## 🚀 Snabbtest

För att snabbt verifiera att allt fungerar:

### 1. Bygg projektet

```bash
npm install
npm run build
```

**Förväntad output:**
- Inga TypeScript-fel
- `build/` katalog skapas med kompilerade filer

### 2. Kör MCP-servern (standalone)

```bash
node build/index.js
```

**Förväntad output:**
- Servern startar utan errors
- MCP-protokollet initieras
- Redo att ta emot requests

---

## 🤖 MCP Server Testing

### Setup: Konfigurera Claude Desktop

1. **Skapa .env fil:**

```bash
cp .env.example .env
```

2. **Lägg till API-nycklar i .env:**

```env
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AI...
ANTHROPIC_API_KEY=sk-ant-...
```

3. **Uppdatera claude_desktop_config.json:**

```json
{
  "mcpServers": {
    "phone-a-friend": {
      "command": "node",
      "args": ["/home/user/debateAI/build/index.js"],
      "env": {
        "OPENAI_API_KEY": "sk-...",
        "GEMINI_API_KEY": "AI...",
        "ANTHROPIC_API_KEY": "sk-ant-..."
      }
    }
  }
}
```

4. **Starta om Claude Desktop**

### Test Cases

#### Test 1: Basic Consensus

**Prompt till Claude:**
```
Phone a friend about: "What is 2+2?"
```

**Förväntat resultat:**
- ✅ Alla tre AI:er svarar
- ✅ Konsensus nås i round 1
- ✅ Svaret är "4"
- ✅ HTML-rapport genereras i `.sessions/`
- ✅ Kostnad < $0.10

#### Test 2: Debate Scenario

**Prompt:**
```
Phone a friend about: "Is functional programming better than object-oriented programming?"
```

**Förväntat resultat:**
- ✅ Flera debattrundor (2-3)
- ✅ Olika perspektiv från olika AI:er
- ✅ Antingen konsensus eller deadlock
- ✅ Konfidenspoäng varierar mellan AI:er
- ✅ Kostnad < $0.50

#### Test 3: Budget Limit

**Prompt:**
```
Phone a friend about: "Explain quantum computing" with max_cost_usd: 0.01
```

**Förväntat resultat:**
- ✅ Debatten stoppar när budget nås
- ✅ Varning visas vid 75% av budget
- ✅ Total kostnad ≤ $0.01

#### Test 4: Disagreement Analysis

**Efter en deadlock, prompt:**
```
Analyze disagreement for session [session_id]
```

**Förväntat resultat:**
- ✅ Konfliktanalys returneras
- ✅ Disagreement type identifieras
- ✅ Resolvability score beräknas
- ✅ Specifika skillnader listas

#### Test 5: Continue Debate

**Efter deadlock:**
```
Continue debate for session [session_id] with continue_2_rounds
```

**Förväntat resultat:**
- ✅ Två extra runder körs
- ✅ Session uppdateras
- ✅ HTML-rapport uppdateras automatiskt

### Verifiering

Kontrollera att följande skapas:

```bash
ls -la .sessions/
```

**Förväntade filer:**
- `session_*.json` - Session metadata
- `debate-report-session_*.html` - Visuell rapport

**Öppna HTML-rapporten:**
```bash
# Linux
xdg-open .sessions/debate-report-session_*.html

# macOS
open .sessions/debate-report-session_*.html

# Windows
start .sessions/debate-report-session_*.html
```

**Kontrollera att rapporten innehåller:**
- 📊 AI-responser från alla rundor
- 📈 Konsensus-evolution
- 💰 Kostnadsnedbrytning
- 🎨 Färgkodning per AI

---

## 🌐 Web UI Testing

### Setup

1. **Installera dependencies:**

```bash
# Backend
npm install

# Frontend
cd frontend
npm install
cd ..
```

2. **Starta båda servrarna:**

**Terminal 1 - Backend:**
```bash
npm run web-server
```

**Terminal 2 - Frontend:**
```bash
npm run web-dev
```

Eller med concurrently:
```bash
npx concurrently "npm run web-server" "npm run web-dev"
```

### Test Cases

#### Test 1: Backend API

**Testa att API:et fungerar:**

```bash
curl http://localhost:3001/api/sessions
```

**Förväntat resultat:**
```json
{
  "sessions": [...]
}
```

#### Test 2: Session List View

1. Öppna http://localhost:3000
2. Verifiera:
   - ✅ Lista över alla sessioner visas
   - ✅ Session ID, fråga, status visas
   - ✅ Antal rundor och kostnad visas
   - ✅ Snygg formatering och färger

#### Test 3: Session Detail View

1. Klicka på en session i listan
2. Verifiera:
   - ✅ Detaljer om sessionen visas
   - ✅ Alla rundor visas i ordning
   - ✅ AI-responser är färgkodade (GPT grön, Claude orange, Gemini blå)
   - ✅ Konfidenspoäng visas
   - ✅ Kostnad per runda visas

#### Test 4: Consensus Graph

1. I en session-detaljvy, scrolla till grafen
2. Verifiera:
   - ✅ Graf med konsensus över tid visas
   - ✅ X-axel: Rundor (0, 1, 2, 3...)
   - ✅ Y-axel: Konsensus % (0-100%)
   - ✅ Linjer för varje AI visas
   - ✅ Hover visar exakt värde

#### Test 5: Dark/Light Mode Toggle

1. Klicka på tema-knappen (☀️/🌙)
2. Verifiera:
   - ✅ Färgschema ändras
   - ✅ Kontrast är bra i båda lägen
   - ✅ Alla komponenter uppdateras
   - ✅ Valet sparas (reload = samma tema)

#### Test 6: Session Comparison

1. Aktivera "Compare Mode" checkbox
2. Välj 2+ sessioner
3. Klicka "Compare Selected"
4. Verifiera:
   - ✅ Jämförelsevy visas
   - ✅ Sessionerna visas sida-vid-sida
   - ✅ Statistik jämförs (kostnad, rundor, etc.)
   - ✅ Grafer synkroniseras

#### Test 7: Advanced Filtering

1. Klicka "Advanced Filters"
2. Testa olika filter:
   - Status (active/completed/deadlock)
   - Kostnad (min/max)
   - Antal rundor (min/max)
   - Strategi (debate/synthesize/tournament)
3. Verifiera:
   - ✅ Sessions filtreras korrekt
   - ✅ "Clear Filters" återställer allt
   - ✅ Flera filter kombineras korrekt

#### Test 8: Live Updates

1. Ha Web UI:et öppet
2. Kör en ny debatt från Claude Desktop
3. Verifiera:
   - ✅ Ny session dyker upp automatiskt (eller efter refresh)
   - ✅ Session uppdateras när debatten pågår

### Frontend Console Check

Öppna Chrome DevTools (F12) och kolla:

- ✅ Inga errors i Console
- ✅ API-anrop i Network tab fungerar (200 OK)
- ✅ Inga varningar om performance

---

## 🔗 Integration Testing

Testa hela flödet från början till slut:

### Scenario 1: Complete Debate Flow

1. **Starta MCP-server** (Claude Desktop)
2. **Starta Web UI** (båda servers)
3. **Kör debatt** från Claude: "What's the best programming language?"
4. **Verifiera i Claude Desktop:**
   - Debatt körs
   - HTML-rapport genereras
5. **Verifiera i Web UI:**
   - Refresh http://localhost:3000
   - Ny session syns i listan
   - Klicka på sessionen
   - Alla rundor visas korrekt
6. **Verifiera filer:**
   ```bash
   ls -la .sessions/
   ```
   - `session_*.json` finns
   - `debate-report-session_*.html` finns

### Scenario 2: Deadlock and Continue

1. **Kör debatt** med kontroversiell fråga
2. **Vänta på deadlock** (ingen konsensus)
3. **Continue 2 rounds** från Claude Desktop
4. **Verifiera:**
   - Extra rundor körs
   - Session uppdateras i Web UI
   - HTML-rapport uppdateras
   - Graf visar alla rundor

### Scenario 3: Multi-Session Comparison

1. **Kör 3 olika debatter:**
   - En enkel (snabb konsensus)
   - En komplex (många rundor)
   - En som deadlockar
2. **I Web UI:**
   - Aktivera Compare Mode
   - Välj alla 3
   - Jämför statistik och grafer
3. **Verifiera:**
   - Tydlig skillnad i konsensus-mönster
   - Kostnadsskillnader synliga
   - Rundor jämförs korrekt

---

## 🧪 Automated Testing

**Status:** ⚠️ Inga automatiska tester implementerade ännu

### Rekommendationer för framtiden

#### 1. Unit Tests (Jest)

```bash
npm install --save-dev jest @types/jest ts-jest
```

**Testa:**
- `src/consensus-engine.ts` - Konsensus-logik
- `src/cost-controller.ts` - Kostnadsberäkning
- `src/ai-clients.ts` - API-wrapper funktioner

**Exempel test:**
```typescript
// src/__tests__/cost-controller.test.ts
describe('CostController', () => {
  it('should calculate token cost correctly', () => {
    const cost = calculateCost('gpt-4o-mini', 1000, 500);
    expect(cost).toBeCloseTo(0.00045);
  });
});
```

#### 2. Integration Tests (Playwright)

```bash
npm install --save-dev @playwright/test
```

**Testa:**
- Full MCP server flow (mock AI responses)
- Web UI user journeys
- Session creation → display → comparison

#### 3. E2E Tests

**Testa:**
- Riktig debatt med riktiga API:er (använd budget-limit)
- HTML-rapport generering
- Web UI live updates

#### 4. CI/CD Pipeline

**GitHub Actions exempel:**

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm run build
      - run: npm test
      - run: npm run test:e2e
```

### Test Coverage Mål

- Unit tests: 80%+ coverage
- Integration tests: Alla kritiska flöden
- E2E tests: Minst 3 huvudscenarier

---

## ✅ Test Checklist

Använd denna checklist för varje release:

### MCP Server
- [ ] Builds utan errors
- [ ] Basic consensus fungerar
- [ ] Debate med flera rundor fungerar
- [ ] Budget limits respekteras
- [ ] HTML-rapporter genereras korrekt
- [ ] Session persistence fungerar
- [ ] Continue debate fungerar
- [ ] Disagreement analysis fungerar

### Web UI
- [ ] Backend API svarar på `/api/sessions`
- [ ] Session list renderas
- [ ] Session details visas korrekt
- [ ] Consensus graphs visar data
- [ ] Dark/Light mode fungerar
- [ ] Session comparison fungerar
- [ ] Advanced filters fungerar
- [ ] Inga console errors

### Integration
- [ ] Debatt → Session → Web UI flöde fungerar
- [ ] Live updates (eller refresh) fungerar
- [ ] Filer sparas i rätt format
- [ ] Kostnadsspårning är korrekt

---

## 🐛 Troubleshooting

### Problem: "Need at least 2 AI providers"

**Lösning:**
```bash
# Kolla att .env har minst 2 API-nycklar
cat .env

# Testa API-nycklarna manuellt
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

### Problem: Web UI visar inga sessioner

**Lösning:**
```bash
# Kolla att .sessions/ finns och har data
ls -la .sessions/

# Om tom, kör en debatt först från Claude Desktop
# Eller skapa mock-data enligt WEB_UI_SETUP.md
```

### Problem: Port redan används

**Lösning:**
```bash
# Backend (3001)
lsof -ti:3001 | xargs kill -9

# Frontend (3000)
lsof -ti:3000 | xargs kill -9
```

### Problem: Build errors

**Lösning:**
```bash
npm run clean
rm -rf node_modules package-lock.json
npm install
npm run build
```

---

## 📊 Test Metrics

Spåra dessa metrics:

- **Test Coverage**: Mål 80%+
- **Build Time**: Mål < 30s
- **Test Execution Time**: Mål < 5 minuter
- **Flaky Tests**: Mål 0
- **Bug Escape Rate**: Mål < 5%

---

## 🎯 Nästa Steg

1. ✅ **Manuell testning** - Använd denna guide
2. 🔄 **Skriv unit tests** - Börja med kritiska funktioner
3. 🔄 **Lägg till integration tests** - Testa hela flöden
4. 🔄 **Setup CI/CD** - Automatisera testkörningar
5. 🔄 **Monitoring** - Lägg till error tracking (Sentry?)

---

## 📚 Relaterade Guider

- [README.md](README.md) - Allmän översikt
- [WEB_UI_SETUP.md](WEB_UI_SETUP.md) - Web UI installation
- [WEB_UI_FEATURES.md](WEB_UI_FEATURES.md) - Web UI funktioner
- [NEXT_STEPS.md](NEXT_STEPS.md) - Framtida utveckling

---

**Lycka till med testningen! 🚀**

*Senast uppdaterad: 2025-01-24*
