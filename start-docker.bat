@echo off
echo ============================================
echo        Trip Planner - Docker Launcher
echo ============================================
echo.

:: Check if .env.local exists
if not exist ".env.local" (
    echo [!] .env.local not found!
    echo.
    echo Creating .env.local from env.example...
    copy env.example .env.local
    echo.
    echo [!] Please edit .env.local and add your API keys:
    echo     - GEMINI_API_KEY (required)
    echo     - FLIGHT_RADAR (optional)
    echo     - API_NINJAS_KEY (optional)
    echo.
    notepad .env.local
    echo.
    echo After saving your API keys, run this script again.
    pause
    exit /b 1
)

echo [*] Building and starting Trip Planner...
echo.

:: Build and run with docker-compose
docker-compose up --build -d

if %errorlevel% neq 0 (
    echo.
    echo [X] Failed to start Docker container!
    echo     Make sure Docker Desktop is running.
    pause
    exit /b 1
)

echo.
echo ============================================
echo [OK] Trip Planner is running!
echo.
echo Open your browser to: http://localhost:3000
echo.
echo To stop: docker-compose down
echo To view logs: docker-compose logs -f
echo ============================================
echo.

:: Open browser automatically
start http://localhost:3000

pause
