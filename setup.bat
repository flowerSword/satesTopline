@echo off
REM setup.bat - One-time setup: download missing wheels and model files.
REM Run this ONCE on a machine with access to Chinese internet (no proxy needed).
REM After setup completes, the package can be used offline with start.bat.
title SalesTopline Setup

setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================================
echo   SalesTopline Setup
echo   This will download:
echo     - Missing Python wheels  (from mirrors.tuna.tsinghua.edu.cn)
echo     - AI model files         (from modelscope.cn)
echo   No proxy required. Chinese internet access only.
echo ============================================================
echo.

REM Detect python
where py >nul 2>&1
if %errorlevel% equ 0 ( set PYTHON=py ) else (
    where python >nul 2>&1
    if %errorlevel% equ 0 ( set PYTHON=python ) else (
        echo [ERROR] Python not found. Please install Python 3.8+ and add to PATH.
        echo         https://www.python.org/downloads/
        goto :end
    )
)

REM Ensure proxy env vars are cleared so domestic sites are accessed directly
set HTTPS_PROXY=
set HTTP_PROXY=
set https_proxy=
set http_proxy=
set NO_PROXY=
set no_proxy=

echo [Step 1/2] Downloading missing wheels...
echo.
%PYTHON% setup_download.py --wheels
if errorlevel 1 (
    echo [ERROR] Wheel download failed. Check network and retry.
    goto :end
)

echo.
echo [Step 2/2] Downloading AI model files...
echo.
%PYTHON% setup_download.py --model
if errorlevel 1 (
    echo [WARN] Some model files failed. App will fall back to keyword search.
    echo        You can retry by running setup.bat again.
)

echo.
echo ============================================================
echo   Setup complete. Run start.bat to launch the application.
echo ============================================================

:end
echo.
pause
endlocal
