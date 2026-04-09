@echo off
echo ============================================
echo  Our Study AI — Setup Script
echo ============================================
echo.

REM Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js LTS from: https://nodejs.org/
    echo Then re-run this script.
    pause
    exit /b 1
)

echo [OK] Node.js found:
node --version
echo.

REM Install dependencies
echo [STEP 1] Installing dependencies...
npm install
echo.

REM Copy env file if not exists
if not exist ".env.local" (
    echo [STEP 2] Creating .env.local from template...
    copy .env.local.example .env.local
    echo.
    echo [ACTION REQUIRED] Edit .env.local with your Firebase and Gemini API credentials.
    echo.
) else (
    echo [STEP 2] .env.local already exists, skipping.
    echo.
)

echo ============================================
echo  Setup Complete!
echo ============================================
echo.
echo Next steps:
echo   1. Edit .env.local with your API keys
echo   2. Run: npm run dev
echo   3. Open: http://localhost:3000
echo.
pause
