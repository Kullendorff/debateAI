# DebateAI Web UI 🎨

Modern React-baserad visualizer för AI-paneldebatter. Visa och analysera debatter mellan GPT-4o, Claude och Gemini i realtid!

## ✨ Features

- 📊 **Interaktiv konsensus-graf** - Se hur AI:erna konvergerar över tid
- 🤖 **AI-respons kort** - Färgkodade svar från varje AI med konfidensnivåer
- 📈 **Trend-analys** - Spåra konfidens- och konsensusförändringar mellan rundor
- 💰 **Kostnadsspårning** - Real-time överblick av tokens och kostnader
- 🎯 **Session-hantering** - Bläddra genom alla dina tidigare debatter
- 🌙 **Dark mode** - Vacker mörk design optimerad för långa läs-sessioner

## 🚀 Quick Start

### 1. Installera dependencies

```bash
cd frontend
npm install
```

### 2. Starta dev-server

```bash
npm run dev
```

Frontend kommer köras på `http://localhost:3000`

### 3. Starta backend API (i separat terminal)

```bash
cd ..
npm install
npm run web-server
```

Backend API körs på `http://localhost:3001`

### 4. Öppna i webbläsaren

Navigera till `http://localhost:3000` och njut!

## 🏗️ Arkitektur

```
frontend/
├── src/
│   ├── components/
│   │   ├── SessionSelector.tsx    # Lista alla debatter
│   │   ├── DebateView.tsx         # Huvudvy för en debatt
│   │   ├── RoundView.tsx          # Visa en runda
│   │   ├── AIResponseCard.tsx     # AI-svarskort
│   │   └── ConsensusChart.tsx     # Konsensus-graf
│   ├── types/
│   │   └── index.ts               # TypeScript definitions
│   ├── App.tsx                    # Root komponent
│   └── main.tsx                   # Entry point
└── package.json
```

## 🎨 Design System

### Färgkoder

- **GPT-4o**: 🟢 Grön (#10a37f)
- **Claude**: 🟠 Orange (#d97706)
- **Gemini**: 🔵 Blå (#3b82f6)
- **Konsensus**: ⚪ Vit (#e0e0e0)

### Konsensus-nivåer

- 🟢 **≥85%**: Stark konsensus
- 🟡 **60-84%**: Moderat konsensus
- 🔴 **<60%**: Svag konsensus

## 📡 API Endpoints

Backend servern exponerar följande endpoints:

- `GET /api/sessions` - Lista alla debatter
- `GET /api/sessions/:id` - Hämta full detaljer för en debatt
- `GET /api/health` - Health check

## 🛠️ Development

### Hot Reload

Vite ger blixtrabb hot reload. Gör ändringar och se dem direkt!

### Build för produktion

```bash
npm run build
npm run preview
```

## 🔮 Framtida Features

- [ ] Live-streaming av pågående debatter
- [ ] Export till PDF
- [ ] Jämför flera debatter side-by-side
- [ ] Filtrera på status/konsensus
- [ ] Sök i debatter
- [ ] Dark/Light mode toggle

## 📝 License

ISC
