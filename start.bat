@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title SalesTopline

cd /d "%~dp0"

echo ============================================================
echo   SalesTopline - AI Sales Assistant
echo ============================================================
echo.

REM ---------- Check Python ----------
where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Please install Python 3.8+ and add it to PATH.
    echo         Download: https://www.python.org/downloads/
    pause
    exit /b 1
)

for /f "tokens=2" %%v in ('python --version 2^>^&1') do set PYVER=%%v
echo [INFO] Python !PYVER! detected.

REM ---------- Check virtual environment ----------
if not exist ".venv\Scripts\python.exe" (
    echo [INFO] First run - creating virtual environment...
    python -m venv .venv
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
)

call .venv\Scripts\activate.bat

REM ---------- Check dependencies ----------
python -c "import flask" >nul 2>&1
if errorlevel 1 (
    echo [INFO] Installing dependencies...
    if exist "wheels\" (
        echo        Using local wheels (offline install)
        pip install --no-index --find-links wheels -r requirements.txt
    ) else (
        echo        wheels directory not found, trying online install
        pip install -r requirements.txt
    )
    if errorlevel 1 (
        echo [ERROR] Dependency installation failed.
        pause
        exit /b 1
    )
)

REM ---------- Check AI model ----------
if not exist "models\all-MiniLM-L6-v2" (
    echo.
    echo [INFO] AI semantic model not found. Semantic search will fall back to keyword search.
    echo        To enable: place all-MiniLM-L6-v2 files into models\all-MiniLM-L6-v2\
    echo.
)

REM ---------- Start server ----------
echo.
echo ============================================================
echo   Starting server...
echo ============================================================
echo.

python app.py

if errorlevel 1 (
    echo.
    echo [ERROR] Server exited with an error.
    pause
)

endlocal
