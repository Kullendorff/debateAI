#!/bin/bash
# Quick Test Script för DebateAI nya features

echo "🧪 DebateAI - Quick Test Setup"
echo "================================"
echo ""

# Check if node_modules exists or if types are missing
if [ ! -d "node_modules" ]; then
    echo "📦 Installerar backend dependencies..."
    npm install
elif [ ! -d "node_modules/@types/express" ]; then
    echo "📦 Uppdaterar backend dependencies (types saknas)..."
    npm install
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Installerar frontend dependencies..."
    cd frontend && npm install && cd ..
fi

# Check if sessions exist
SESSION_COUNT=$(ls -1 .sessions/*.json 2>/dev/null | wc -l)
echo "✅ Testdata: $SESSION_COUNT sessioner i .sessions/"

# Build backend
echo ""
echo "🔨 Bygger backend..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Backend build klar!"
else
    echo "❌ Backend build misslyckades"
    exit 1
fi

echo ""
echo "🚀 Redo att testa! Kör följande kommandon:"
echo ""
echo "Terminal 1:"
echo "  npm run web-server"
echo ""
echo "Terminal 2:"
echo "  npm run web-dev"
echo ""
echo "Eller kombinerat:"
echo "  npx concurrently \"npm run web-server\" \"npm run web-dev\""
echo ""
echo "Sedan öppna: http://localhost:3000"
echo ""
echo "📖 Se TEST_NEW_FEATURES.md för detaljerad testplan"
