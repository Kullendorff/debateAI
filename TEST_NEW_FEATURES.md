# 🧪 Test Plan - Nya Features (2025-01-24)

Test för de funktioner som pushats idag.

## 🆕 Features att testa

1. **Session Comparison** - Jämför flera debatter sida-vid-sida
2. **Dark/Light Mode** - Temabyte mellan mörkt och ljust läge
3. **Advanced Filtering** - Filtrera sessioner efter olika kriterier

---

## 🚀 Snabbstart - Setup

### Steg 1: Installera dependencies

```bash
# Backend
npm install

# Frontend (om inte redan gjort)
cd frontend
npm install
cd ..
```

### Steg 2: Skapa testdata

Vi behöver minst 3 sessioner för att testa jämförelseläget ordentligt.

```bash
mkdir -p .sessions
```

**Kör detta för att skapa mock-sessioner:**

```bash
# Session 1: Snabb konsensus
cat > .sessions/test_quick_consensus.json << 'EOF'
{
  "id": "test_quick_consensus",
  "question": "Vad är 2+2?",
  "rounds": [
    {
      "round_number": 1,
      "responses": {
        "openai": {
          "answer": "2+2 är 4",
          "confidence": 100,
          "reasoning": "Grundläggande matematik"
        },
        "claude": {
          "answer": "Svaret är 4",
          "confidence": 100,
          "reasoning": "Enkel addition"
        },
        "gemini": {
          "answer": "Det är 4",
          "confidence": 100,
          "reasoning": "Matematisk grundsats"
        }
      },
      "consensus_score": 0.95,
      "cost_usd": 0.02
    }
  ],
  "status": "consensus",
  "created_at": "2025-01-24T10:00:00Z",
  "updated_at": "2025-01-24T10:01:00Z",
  "max_rounds": 3,
  "max_cost_usd": 1.0,
  "current_cost_usd": 0.02,
  "strategy": "debate"
}
EOF

# Session 2: Multi-round debate
cat > .sessions/test_programming_debate.json << 'EOF'
{
  "id": "test_programming_debate",
  "question": "Är Python bättre än JavaScript?",
  "rounds": [
    {
      "round_number": 1,
      "responses": {
        "openai": {
          "answer": "Python är bättre för data science och machine learning",
          "confidence": 75,
          "reasoning": "Bättre bibliotek för ML"
        },
        "claude": {
          "answer": "JavaScript är bättre för webbutveckling",
          "confidence": 70,
          "reasoning": "Native i webbläsare"
        },
        "gemini": {
          "answer": "Båda har sina styrkor beroende på use case",
          "confidence": 80,
          "reasoning": "Kontextberoende"
        }
      },
      "consensus_score": 0.35,
      "cost_usd": 0.05
    },
    {
      "round_number": 2,
      "responses": {
        "openai": {
          "answer": "Python har renare syntax och är bättre för backend",
          "confidence": 72,
          "reasoning": "Enklare att läsa och underhålla"
        },
        "claude": {
          "answer": "JavaScript är mer versatile med Node.js för fullstack",
          "confidence": 75,
          "reasoning": "Ett språk för både frontend och backend"
        },
        "gemini": {
          "answer": "För web: JavaScript. För ML: Python. De kompletterar varandra.",
          "confidence": 85,
          "reasoning": "Båda behövs i moderna tech stacks"
        }
      },
      "consensus_score": 0.55,
      "cost_usd": 0.06
    },
    {
      "round_number": 3,
      "responses": {
        "openai": {
          "answer": "Båda har sina platser. Python för data, JS för web.",
          "confidence": 80,
          "reasoning": "Accepterar use-case argument"
        },
        "claude": {
          "answer": "Enig, båda språken är viktiga i olika domäner",
          "confidence": 82,
          "reasoning": "Nyanserad syn"
        },
        "gemini": {
          "answer": "Konsensus: Olika styrkor för olika problem",
          "confidence": 88,
          "reasoning": "Alla är överens"
        }
      },
      "consensus_score": 0.85,
      "cost_usd": 0.07
    }
  ],
  "status": "consensus",
  "created_at": "2025-01-24T11:00:00Z",
  "updated_at": "2025-01-24T11:05:00Z",
  "max_rounds": 3,
  "max_cost_usd": 1.0,
  "current_cost_usd": 0.18,
  "strategy": "debate"
}
EOF

# Session 3: Deadlock
cat > .sessions/test_deadlock.json << 'EOF'
{
  "id": "test_deadlock",
  "question": "Kommer AGI innan 2030?",
  "rounds": [
    {
      "round_number": 1,
      "responses": {
        "openai": {
          "answer": "Osannolikt, behöver mer fundamentala genombrott",
          "confidence": 80,
          "reasoning": "Tekniska hinder kvarstår"
        },
        "claude": {
          "answer": "Möjligt men osäkert, beror på definition av AGI",
          "confidence": 60,
          "reasoning": "Definitionsproblem"
        },
        "gemini": {
          "answer": "Ja, troligt med nuvarande utvecklingshastighet",
          "confidence": 70,
          "reasoning": "Exponentiell utveckling"
        }
      },
      "consensus_score": 0.25,
      "cost_usd": 0.08
    },
    {
      "round_number": 2,
      "responses": {
        "openai": {
          "answer": "Även med snabb utveckling finns fundamentala problem",
          "confidence": 82,
          "reasoning": "Håller fast vid skepticism"
        },
        "claude": {
          "answer": "Behöver klargöra vad AGI betyder först",
          "confidence": 55,
          "reasoning": "Fortfarande osäker"
        },
        "gemini": {
          "answer": "Utvecklingen accelererar, jag tror på 2029-2030",
          "confidence": 75,
          "reasoning": "Optimistisk prognos"
        }
      },
      "consensus_score": 0.20,
      "cost_usd": 0.09
    },
    {
      "round_number": 3,
      "responses": {
        "openai": {
          "answer": "Osannolikt innan 2030, kanske 2035+",
          "confidence": 85,
          "reasoning": "Håller position"
        },
        "claude": {
          "answer": "50/50 beroende på definition och genombrott",
          "confidence": 50,
          "reasoning": "Neutral position"
        },
        "gemini": {
          "answer": "Ja, mellan 2028-2030 baserat på trender",
          "confidence": 78,
          "reasoning": "Fortsatt optimistisk"
        }
      },
      "consensus_score": 0.18,
      "cost_usd": 0.10
    }
  ],
  "status": "deadlock",
  "created_at": "2025-01-24T12:00:00Z",
  "updated_at": "2025-01-24T12:08:00Z",
  "max_rounds": 3,
  "max_cost_usd": 1.0,
  "current_cost_usd": 0.27,
  "strategy": "debate"
}
EOF

# Session 4: Dyr session
cat > .sessions/test_expensive.json << 'EOF'
{
  "id": "test_expensive",
  "question": "Förklara kvantmekanik i detalj",
  "rounds": [
    {
      "round_number": 1,
      "responses": {
        "openai": {
          "answer": "Kvantmekanik är...",
          "confidence": 90,
          "reasoning": "Omfattande förklaring"
        },
        "claude": {
          "answer": "Kvantmekanik beskriver...",
          "confidence": 88,
          "reasoning": "Detaljerad analys"
        },
        "gemini": {
          "answer": "Kvantmekanik handlar om...",
          "confidence": 92,
          "reasoning": "Grundlig genomgång"
        }
      },
      "consensus_score": 0.88,
      "cost_usd": 0.35
    }
  ],
  "status": "consensus",
  "created_at": "2025-01-24T13:00:00Z",
  "updated_at": "2025-01-24T13:03:00Z",
  "max_rounds": 3,
  "max_cost_usd": 1.0,
  "current_cost_usd": 0.35,
  "strategy": "synthesize"
}
EOF

echo "✅ Testdata skapad i .sessions/"
```

### Steg 3: Starta applikationen

**Terminal 1 - Backend:**
```bash
npm run web-server
```

**Terminal 2 - Frontend:**
```bash
npm run web-dev
```

Eller kombinerat:
```bash
npx concurrently "npm run web-server" "npm run web-dev"
```

**Öppna:** http://localhost:3000

---

## 🧪 Test Cases

### Test 1: Dark/Light Mode Toggle

#### Setup
1. Öppna http://localhost:3000
2. Leta reda på tema-knappen (☀️ eller 🌙 ikonen)

#### Test Steps
1. **Initial state:**
   - [ ] Kolla vilket tema som är aktivt (dark eller light)
   - [ ] Verifiera att alla komponenter har rätt färger

2. **Toggle till motsatt tema:**
   - [ ] Klicka på tema-knappen
   - [ ] Verifiera att:
     - Bakgrundsfärg ändras
     - Textfärg ändras för läsbarhet
     - Kort/komponenter får nya färger
     - Ikon ändras (☀️ ↔️ 🌙)

3. **Test kontrast:**
   - [ ] Dark mode: Text ska vara läsbar på mörk bakgrund
   - [ ] Light mode: Text ska vara läsbar på ljus bakgrund
   - [ ] AI-responser (grön/orange/blå) ska synas i båda lägena

4. **Persistence test:**
   - [ ] Reload sidan (F5)
   - [ ] Verifiera att samma tema är aktivt
   - [ ] Toggle igen och reload
   - [ ] Verifiera att nytt val sparas

#### Expected Results
- ✅ Smooth övergång mellan teman
- ✅ Alla komponenter uppdateras
- ✅ Bra kontrast i båda lägen
- ✅ Val sparas i localStorage

---

### Test 2: Advanced Filtering

#### Setup
1. Öppna http://localhost:3000
2. Du ska se 4 sessioner i listan
3. Leta reda på "Advanced Filters" knappen/sektion

#### Test Steps

**2.1: Filter by Status**
1. [ ] Öppna Advanced Filters
2. [ ] Välj endast "consensus" status
3. [ ] Verifiera: Endast 3 sessioner visas (test_quick_consensus, test_programming_debate, test_expensive)
4. [ ] Välj endast "deadlock" status
5. [ ] Verifiera: Endast 1 session visas (test_deadlock)
6. [ ] Välj båda status
7. [ ] Verifiera: Alla 4 sessioner visas

**2.2: Filter by Cost**
1. [ ] Sätt min cost: 0.15
2. [ ] Verifiera: Endast 2 sessioner visas (test_programming_debate: $0.18, test_expensive: $0.35)
3. [ ] Sätt max cost: 0.20
4. [ ] Verifiera: Endast test_programming_debate visas ($0.18)
5. [ ] Clear filters

**2.3: Filter by Rounds**
1. [ ] Sätt min rounds: 2
2. [ ] Verifiera: Endast test_programming_debate och test_deadlock visas (3 rundor)
3. [ ] Sätt max rounds: 2
4. [ ] Verifiera: Inga sessioner matchar (konflikt: min=2, max=2, men vi har 1 eller 3)
5. [ ] Sätt min rounds: 3, max rounds: 3
6. [ ] Verifiera: 2 sessioner visas
7. [ ] Clear filters

**2.4: Filter by Strategy**
1. [ ] Välj "debate" strategy
2. [ ] Verifiera: 3 sessioner visas
3. [ ] Välj "synthesize" strategy
4. [ ] Verifiera: 1 session visas (test_expensive)

**2.5: Combined Filters**
1. [ ] Status: consensus
2. [ ] Min cost: 0.10
3. [ ] Verifiera: test_programming_debate och test_expensive
4. [ ] Lägg till: Max rounds: 1
5. [ ] Verifiera: test_expensive (1 round, $0.35, consensus)

**2.6: Clear Filters**
1. [ ] Klicka "Clear Filters"
2. [ ] Verifiera: Alla 4 sessioner visas igen
3. [ ] Verifiera: Alla filter-inputs är tomma/resetade

#### Expected Results
- ✅ Filters kombineras korrekt (AND logic)
- ✅ Sessions filtreras realtid
- ✅ Clear Filters återställer allt
- ✅ Inga console errors

---

### Test 3: Session Comparison

#### Setup
1. Öppna http://localhost:3000
2. Se till att alla 4 sessioner visas

#### Test Steps

**3.1: Enable Compare Mode**
1. [ ] Leta reda på "Compare Mode" checkbox/toggle
2. [ ] Aktivera compare mode
3. [ ] Verifiera: Checkboxes dyker upp vid varje session

**3.2: Select Sessions**
1. [ ] Välj endast 1 session
2. [ ] Verifiera: "Compare Selected" knapp är disabled eller visar varning
3. [ ] Välj ytterligare en session (totalt 2)
4. [ ] Verifiera: "Compare Selected" knapp är enabled
5. [ ] Välj en tredje session (totalt 3)
6. [ ] Verifiera: Knapp fortfarande enabled

**3.3: Open Comparison View**
1. [ ] Klicka "Compare Selected"
2. [ ] Verifiera: Ny vy öppnas med jämförelse
3. [ ] Verifiera innehåll:
   - Alla valda sessioner visas sida-vid-sida
   - Session metadata (fråga, status, kostnad)
   - Antal rundor för varje session
   - Status-ikoner (✅ för consensus, 🚨 för deadlock)

**3.4: Comparison Metrics**

Jämför följande mellan sessionerna:

**Kostnad:**
- [ ] test_quick_consensus: $0.02
- [ ] test_programming_debate: $0.18
- [ ] test_deadlock: $0.27
- [ ] Verifiera att dyrt→billigt ordning är tydlig

**Rundor:**
- [ ] test_quick_consensus: 1 runda
- [ ] test_programming_debate: 3 rundor
- [ ] test_deadlock: 3 rundor
- [ ] Verifiera att antal visas korrekt

**Konsensus:**
- [ ] Final consensus score visas för varje session
- [ ] test_quick_consensus: 95%
- [ ] test_programming_debate: 85%
- [ ] test_deadlock: 18%

**Konsensus-evolution (om grafer visas):**
- [ ] test_programming_debate: Uppåtgående trend (35% → 85%)
- [ ] test_deadlock: Nedåtgående trend (25% → 18%)

**3.5: Comparison UI/UX**
1. [ ] Verifiera att jämförelsen är lätt att läsa
2. [ ] Sessionerna ska ha tydliga avgränsningar
3. [ ] Status-färger ska matcha (grön för consensus, röd för deadlock)
4. [ ] Scrollning fungerar om många sessioner jämförs

**3.6: Close Comparison**
1. [ ] Leta reda på stäng-knapp (X)
2. [ ] Klicka för att stänga jämförelsen
3. [ ] Verifiera: Tillbaka till session list view
4. [ ] Verifiera: Compare mode är fortfarande aktivt
5. [ ] Verifiera: Tidigare val är kvar (eller clearade)

**3.7: Deselect and Compare Again**
1. [ ] Deselect alla sessioner
2. [ ] Välj andra 2 sessioner
3. [ ] Öppna comparison igen
4. [ ] Verifiera: Nya sessioner visas korrekt

#### Expected Results
- ✅ Compare mode kan toggles on/off
- ✅ Minst 2 sessioner krävs för jämförelse
- ✅ Jämförelsevy visar tydlig statistik
- ✅ Lätt att se skillnader mellan sessioner
- ✅ Kan stänga och öppna nya jämförelser

---

### Test 4: Combined Feature Test

#### Test Scenario: "Power User Workflow"

1. **Dark mode i jämförelseläge:**
   - [ ] Aktivera dark mode
   - [ ] Aktivera compare mode
   - [ ] Välj 3 sessioner
   - [ ] Öppna comparison
   - [ ] Verifiera: Dark mode är aktivt i comparison view
   - [ ] Verifiera: Bra kontrast och läsbarhet

2. **Filter + Compare:**
   - [ ] Filtrera: Status = deadlock
   - [ ] Verifiera: Endast test_deadlock visas
   - [ ] Clear filter
   - [ ] Filtrera: Min rounds = 3
   - [ ] Verifiera: 2 sessioner visas
   - [ ] Aktivera compare mode
   - [ ] Välj båda filtrerade sessioner
   - [ ] Öppna comparison
   - [ ] Verifiera: Jämförelse fungerar med filtrerade resultat

3. **Theme switch i comparison:**
   - [ ] Öppna en comparison view
   - [ ] Byt tema (dark ↔️ light)
   - [ ] Verifiera: Comparison view uppdateras direkt
   - [ ] Stäng comparison
   - [ ] Verifiera: Main view har samma tema

#### Expected Results
- ✅ Features fungerar oberoende av varandra
- ✅ Features kan kombineras utan buggar
- ✅ Tema persisteras över olika vyer
- ✅ Filters påverkar compare mode korrekt

---

## 🐛 Bug Hunting

Leta efter dessa potentiella buggar:

### UI Bugs
- [ ] Text overflow i session cards
- [ ] Broken layout på små skärmar (resize window)
- [ ] Missing icons eller emojis
- [ ] Incorrect color contrast i dark/light mode
- [ ] Checkboxes inte synkade med selections

### Logic Bugs
- [ ] Filter logik: AND vs OR confusion
- [ ] Compare mode: Kan välja 0 sessioner
- [ ] Theme toggle: Inte persistent över page reload
- [ ] Session data: null/undefined hantering

### Performance
- [ ] Långsam rendering med många sessioner (testa med 10+ om möjligt)
- [ ] Tema-byte laggar
- [ ] Filter-input laggar vid typing

---

## 📊 Test Results Template

Kopiera och fyll i efter testerna:

```
🧪 Test Results - Nya Features (2025-01-24)

Testad av: [Ditt namn]
Datum: [Datum]
Browser: [Chrome/Firefox/Safari]
OS: [Windows/Mac/Linux]

## Dark/Light Mode
- Toggle fungerar: ✅/❌
- Persistence: ✅/❌
- Kontrast OK: ✅/❌
- Buggar: [lista eventuella buggar]

## Advanced Filtering
- Status filter: ✅/❌
- Cost filter: ✅/❌
- Rounds filter: ✅/❌
- Strategy filter: ✅/❌
- Combined filters: ✅/❌
- Clear filters: ✅/❌
- Buggar: [lista eventuella buggar]

## Session Comparison
- Compare mode toggle: ✅/❌
- Session selection: ✅/❌
- Comparison view: ✅/❌
- Metrics correct: ✅/❌
- Close/reopen: ✅/❌
- Buggar: [lista eventuella buggar]

## Combined Features
- Dark mode + compare: ✅/❌
- Filter + compare: ✅/❌
- Theme in comparison: ✅/❌
- Buggar: [lista eventuella buggar]

## Overall Assessment
- Severity bugs found: [antal]
- Minor issues: [antal]
- Rekommendation: PASS / FAIL / PASS med anmärkningar

## Notes
[Eventuella kommentarer, feedback, förbättringsförslag]
```

---

## 🚀 Nästa Steg Efter Test

Om testerna går bra:
1. ✅ Merge till main branch
2. ✅ Tag release (v2.1.0?)
3. ✅ Update CHANGELOG.md

Om buggar hittas:
1. 🐛 Skapa GitHub issues för varje bugg
2. 🔧 Fixa kritiska buggar först
3. 🧪 Re-test efter fixes

---

## 📚 Relaterade Filer

- `frontend/src/components/CompareView.tsx` - Comparison logic
- `frontend/src/components/CompareView.css` - Comparison styling
- `frontend/src/components/SessionSelector.tsx` - Filtering + selection logic
- `frontend/src/App.tsx` - Theme state management
- `frontend/src/index.css` - Theme CSS variables

---

**Lycka till med testningen! 🎯**

*Om du hittar buggar, skapa issues på GitHub eller fixa direkt.*
