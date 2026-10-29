@echo off
setlocal

title Kaafila - Retail Resilience
set "KAAFILA_PROJECT=%~dp0"

if not exist "%KAAFILA_PROJECT%package.json" (
    echo ERROR: The Kaafila project was not found at:
    echo %KAAFILA_PROJECT%
    echo.
    pause
    exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or is not available in PATH.
    echo Install Node.js 22.13 or newer, then run this file again.
    echo.
    pause
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo ERROR: npm is not installed or is not available in PATH.
    echo.
    pause
    exit /b 1
)

if not exist "%KAAFILA_PROJECT%node_modules" (
    echo Installing project dependencies...
    call npm --prefix "%KAAFILA_PROJECT%" ci
    if errorlevel 1 (
        echo.
        echo ERROR: Dependency installation failed.
        pause
        exit /b 1
    )
)

echo Starting Kaafila...
echo The app will normally be available at http://127.0.0.1:5173
echo Press Ctrl+C to stop it.
echo.

call npm --prefix "%KAAFILA_PROJECT%" run dev
set "KAAFILA_EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%KAAFILA_EXIT_CODE%"=="0" echo Kaafila stopped with exit code %KAAFILA_EXIT_CODE%.
pause
exit /b %KAAFILA_EXIT_CODE%
