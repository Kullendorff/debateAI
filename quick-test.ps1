# Quick Test Script för DebateAI nya features (PowerShell)

Write-Host "🧪 DebateAI - Quick Test Setup" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installerar backend dependencies..." -ForegroundColor Yellow
    npm install
}

if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "📦 Installerar frontend dependencies..." -ForegroundColor Yellow
    Set-Location frontend
    npm install
    Set-Location ..
}

# Count sessions
$sessionCount = (Get-ChildItem -Path ".sessions\*.json" -ErrorAction SilentlyContinue).Count
Write-Host "✅ Testdata: $sessionCount sessioner i .sessions/" -ForegroundColor Green

# Build backend
Write-Host ""
Write-Host "🔨 Bygger backend..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Backend build klar!" -ForegroundColor Green
} else {
    Write-Host "❌ Backend build misslyckades" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🚀 Redo att testa! Kör följande kommandon:" -ForegroundColor Cyan
Write-Host ""
Write-Host "Terminal 1:" -ForegroundColor White
Write-Host "  npm run web-server" -ForegroundColor Gray
Write-Host ""
Write-Host "Terminal 2:" -ForegroundColor White
Write-Host "  npm run web-dev" -ForegroundColor Gray
Write-Host ""
Write-Host "Eller kombinerat:" -ForegroundColor White
Write-Host "  npx concurrently `"npm run web-server`" `"npm run web-dev`"" -ForegroundColor Gray
Write-Host ""
Write-Host "Sedan öppna: http://localhost:3000" -ForegroundColor Green
Write-Host ""
Write-Host "📖 Se TEST_NEW_FEATURES.md för detaljerad testplan" -ForegroundColor Cyan
