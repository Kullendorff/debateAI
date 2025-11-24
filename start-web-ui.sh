#!/bin/bash

# DebateAI Web UI Launcher
# Startar både backend API och frontend dev server

echo "🚀 Starting DebateAI Web UI..."
echo ""

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing root dependencies..."
    npm install
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

echo ""
echo "✅ Dependencies installed!"
echo ""
echo "🔥 Starting servers..."
echo "   Backend API: http://localhost:3001"
echo "   Frontend UI: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Start both servers (requires npm concurrently or run manually)
if command -v concurrently &> /dev/null; then
    npx concurrently -n "API,UI" -c "bgBlue.bold,bgMagenta.bold" \
        "npm run web-server" \
        "npm run web-dev"
else
    echo "⚠️  'concurrently' not found. Starting manually..."
    echo ""
    echo "In another terminal, run: npm run web-dev"
    echo ""
    npm run web-server
fi
