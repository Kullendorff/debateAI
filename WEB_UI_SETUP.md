# 🚀 Web UI Setup Guide

Snabbguide för att komma igång med DebateAI Web UI!

## 📦 Installation

### Steg 1: Installera root dependencies

```bash
npm install
```

Detta installerar Express, CORS och andra backend-dependencies.

### Steg 2: Installera frontend dependencies

```bash
cd frontend
npm install
cd ..
```

Detta installerar React, Vite, Recharts och andra frontend-dependencies.

## ▶️ Starta Applikationen

### Metod 1: Manuellt (två terminaler)

**Terminal 1 - Backend API:**
```bash
npm run web-server
```

Servern startar på `http://localhost:3001`

**Terminal 2 - Frontend Dev Server:**
```bash
npm run web-dev
```

Frontend startar på `http://localhost:3000`

### Metod 2: Med process manager (rekommenderas)

Om du har `concurrently` installerat:

```bash
npm install -g concurrently
npx concurrently "npm run web-server" "npm run web-dev"
```

## 🎯 Första Gången

### Om du inte har några debatter än:

1. Starta MCP-servern och kör en debatt från Claude Desktop
2. En session-fil skapas i `.sessions/`
3. Refresh web UI:n för att se debatten!

### Testa med mock-data (optional):

Skapa en test-session:

```bash
mkdir -p .sessions
cat > .sessions/test_session.json << 'EOF'
{
  "id": "test_session",
  "question": "Är AI farligt för mänskligheten?",
  "rounds": [],
  "status": "active",
  "created_at": "2025-01-24T10:00:00Z",
  "updated_at": "2025-01-24T10:00:00Z",
  "max_rounds": 3,
  "max_cost_usd": 1.0,
  "current_cost_usd": 0,
  "strategy": "debate"
}
EOF
```

## 🔧 Troubleshooting

### Backend startar inte

**Problem:** Port 3001 redan i bruk

**Lösning:** Ändra port i `src/web-server.ts`:
```typescript
const PORT = 3002; // eller annan ledig port
```

### Frontend kan inte ansluta till backend

**Problem:** CORS eller proxy-fel

**Lösning:** Kolla att:
1. Backend körs på port 3001
2. `frontend/vite.config.ts` pekar på rätt port
3. Inga firewall-problem

### Inga sessioner visas

**Problem:** `.sessions/` katalogen är tom

**Lösning:**
1. Kör en debatt från MCP-servern först
2. Eller skapa mock-data (se ovan)

### TypeScript-fel i frontend

**Problem:** Type errors vid build

**Lösning:**
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run dev
```

## 📚 Nästa Steg

Efter installation:

1. **Kör en debatt** från Claude Desktop med MCP-servern
2. **Öppna Web UI** på `http://localhost:3000`
3. **Klicka på debatten** för att se full visualisering
4. **Utforska grafen** - hovra över punkter för detaljer

## 🎨 Anpassning

### Ändra tema-färger

Redigera `frontend/src/index.css`:

```css
:root {
  --color-primary: #your-color;
  --color-gpt: #your-gpt-color;
  /* etc */
}
```

### Ändra port

**Backend:** `src/web-server.ts` → `const PORT = 3001`

**Frontend:** `frontend/vite.config.ts` → `port: 3000`

## 💡 Tips

- **Hot Reload**: Frontend uppdateras automatiskt vid kodändringar
- **DevTools**: Öppna Chrome DevTools för att debugga
- **Network Tab**: Se API-anrop i network-fliken
- **Console**: Kolla console för errors/warnings

## 🚀 Production Build

För att bygga för produktion:

```bash
# Build frontend
cd frontend
npm run build

# Serve med en static file server
npx serve -s dist -p 3000
```

## 🆘 Behöver Hjälp?

Om något inte funkar:

1. Kolla att alla dependencies är installerade
2. Kolla att båda servrarna körs
3. Kolla browser console för errors
4. Kolla backend terminal för logs

Lycka till! 🎉
