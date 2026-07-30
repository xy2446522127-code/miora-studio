@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "PYEXE=%~dp0.venv\Scripts\python.exe"
if not exist "%PYEXE%" (
    echo [ERROR] Virtual environment not found.
    echo Run: py -3.12 -m venv "%~dp0.venv"
    exit /b 1
)

echo Starting 花海画布...
echo Visit: http://127.0.0.1:3000/
echo Press Ctrl+C to stop.
echo.

"%PYEXE%" -c "import fastapi, uvicorn, requests, pydantic, multipart, httpx; from PIL import Image" >nul 2>&1
if errorlevel 1 (
    echo [INFO] Required Python packages are missing. Installing them now...
    call "%~dp0安装依赖.bat"
    if errorlevel 1 (
        echo [ERROR] Dependency installation failed.
        pause
        exit /b 1
    )
)

start /b cmd /c "timeout /t 3 /nobreak >nul && start http://127.0.0.1:3000/"
"%PYEXE%" main.py

echo.
echo Server stopped.
pause
