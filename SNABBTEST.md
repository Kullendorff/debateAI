# ⚡ Snabbtest - Kom igång på 2 minuter!

## 🎯 Vad ska testas idag?

Tre nya features från PR #4:

1. **🌓 Dark/Light Mode** - Byt tema med en klick
2. **🔍 Advanced Filtering** - Filtrera debatter efter status, kostnad, rundor
3. **⚖️ Session Comparison** - Jämför flera debatter sida-vid-sida

---

## 🚀 Starta på 3 steg

### 1. Kör setup-scriptet

```bash
./quick-test.sh
```

Detta bygger projektet och verifierar att testdata finns.

### 2. Starta applikationen

**Alt A - Två terminaler:**

Terminal 1:
```bash
npm run web-server
```

Terminal 2:
```bash
npm run web-dev
```

**Alt B - En terminal (concurrently):**
```bash
npx concurrently "npm run web-server" "npm run web-dev"
```

### 3. Öppna och testa!

Öppna: **http://localhost:3000**

Du ska se 4 test-sessioner:
- ✅ Vad är 2+2? (snabb konsensus)
- ✅ Python vs JavaScript (3-runds debatt)
- 🚨 AGI innan 2030? (deadlock)
- ✅ Kvantmekanik (dyr session)

---

## ⚡ 5-minuters testplan

### Test 1: Tema-byte (30 sek)

1. [ ] Klicka på tema-knappen (☀️/🌙 ikonen)
2. [ ] Verifiera att färgerna ändras
3. [ ] Reload sidan (F5)
4. [ ] Verifiera att temat är kvar

**Lyckat om:** Smooth övergång, bra kontrast, temat sparas

---

### Test 2: Filtrering (2 min)

1. [ ] Klicka "Advanced Filters"
2. [ ] Välj endast "deadlock" status
   - **Förväntat:** Endast "AGI innan 2030?" visas
3. [ ] Clear filters
4. [ ] Sätt "Min cost: 0.15"
   - **Förväntat:** Python-debatt ($0.18) och Kvantmekanik ($0.35)
5. [ ] Lägg till "Max cost: 0.20"
   - **Förväntat:** Endast Python-debatt
6. [ ] Clear filters igen

**Lyckat om:** Filters fungerar korrekt, clear återställer allt

---

### Test 3: Jämförelseläge (2.5 min)

1. [ ] Aktivera "Compare Mode" checkbox
2. [ ] Välj 2 sessioner (t.ex. Python-debatt och AGI-deadlock)
3. [ ] Klicka "Compare Selected"
4. [ ] Verifiera jämförelsen:
   - Båda sessionerna visas sida-vid-sida
   - Status-ikoner: ✅ vs 🚨
   - Kostnad: $0.18 vs $0.27
   - Rundor: 3 vs 3
   - Konsensus: 85% vs 18% (stor skillnad!)
5. [ ] Stäng jämförelsen (X-knapp)
6. [ ] Testa med 3 sessioner

**Lyckat om:** Jämförelse är tydlig och lätt att läsa

---

## ✅ Snabb Checklista

Efter dina tester, bocka av:

- [ ] Dark mode fungerar och sparas
- [ ] Light mode fungerar och sparas
- [ ] Status filter fungerar
- [ ] Cost filter fungerar (min/max)
- [ ] Rounds filter fungerar
- [ ] Clear filters återställer allt
- [ ] Compare mode kan aktiveras
- [ ] Kan välja 2+ sessioner
- [ ] Comparison view öppnas
- [ ] Jämförelsen visar korrekt data
- [ ] Kan stänga och öppna nya jämförelser

**Alla checkade?** 🎉 Perfekt! Features fungerar!

---

## 🐛 Hittade du en bugg?

1. Kolla browser console (F12) för errors
2. Ta en screenshot
3. Notera:
   - Vad gjorde du?
   - Vad förväntade du?
   - Vad hände istället?
4. Skapa GitHub issue eller fixa direkt!

---

## 📚 Mer info?

- **Detaljerad testplan:** [TEST_NEW_FEATURES.md](TEST_NEW_FEATURES.md)
- **Allmän testguide:** [TESTING_GUIDE.md](TESTING_GUIDE.md)
- **Web UI setup:** [WEB_UI_SETUP.md](WEB_UI_SETUP.md)

---

## 💡 Tips

- **Testa båda temana** - Vissa buggar syns bara i dark/light mode
- **Testa med många selections** - Välj 4+ sessioner i compare mode
- **Kombinera filters** - Testa flera filters samtidigt
- **Resize fönstret** - Kolla att responsive design fungerar

---

## 🎯 Förväntat resultat

Om allt funkar bra:
- ✅ Inga console errors
- ✅ Smooth transitions
- ✅ Bra kontrast i båda teman
- ✅ Filters kombineras korrekt
- ✅ Comparison är läsbar och användbar

**Ready to merge to main!** 🚀

---

**Lycka till! Ta bara 5 minuter och kör igenom testerna!** ⚡
