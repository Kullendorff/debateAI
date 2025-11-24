@echo off
REM Quick Test Script för DebateAI nya features (Windows)

echo 🧪 DebateAI - Quick Test Setup
echo ================================
echo.

REM Check if node_modules exists or if types are missing
if not exist "node_modules\" (
    echo 📦 Installerar backend dependencies...
    call npm install
) else if not exist "node_modules\@types\express\" (
    echo 📦 Uppdaterar backend dependencies ^(types saknas^)...
    call npm install
)

if not exist "frontend\node_modules\" (
    echo 📦 Installerar frontend dependencies...
    cd frontend
    call npm install
    cd ..
)

REM Count sessions
set SESSION_COUNT=0
for %%f in (.sessions\*.json) do set /a SESSION_COUNT+=1
echo ✅ Testdata: %SESSION_COUNT% sessioner i .sessions/

REM Build backend
echo.
echo 🔨 Bygger backend...
call npm run build

if %ERRORLEVEL% EQU 0 (
    echo ✅ Backend build klar!
) else (
    echo ❌ Backend build misslyckades
    exit /b 1
)

echo.
echo 🚀 Redo att testa! Kör följande kommandon:
echo.
echo Terminal 1:
echo   npm run web-server
echo.
echo Terminal 2:
echo   npm run web-dev
echo.
echo Eller kombinerat:
echo   npx concurrently "npm run web-server" "npm run web-dev"
echo.
echo Sedan öppna: http://localhost:3000
echo.
echo 📖 Se TEST_NEW_FEATURES.md för detaljerad testplan
pause
