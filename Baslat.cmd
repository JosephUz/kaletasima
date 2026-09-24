@echo off
cd /d "%~dp0"
where docker >nul 2>nul
if errorlevel 1 (
 echo Docker Desktop bulunamadi. Docker Desktop'i kurup acin.
 pause
 exit /b 1
)
docker compose up -d --build
if errorlevel 1 (
 echo Oyun baslatilamadi. Docker Desktop acik mi kontrol edin.
 pause
 exit /b 1
)
start "" "http://localhost:5185"
