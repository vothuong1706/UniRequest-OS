@echo off
chcp 65001 >nul
setlocal

title UniRequest-OS - Safe Shutdown

set "WSL_DISTRO=Ubuntu-24.04"
set "PROJECT_DIR=~/projects/UniRequest-OS"

echo ==============================================================
echo   UniRequest-OS - Dung he thong an toan (giu nguyen du lieu)
echo ==============================================================
echo.

wsl -d %WSL_DISTRO% -e bash -c "cd %PROJECT_DIR% && make down"
if errorlevel 1 (
    echo [LOI] Khong the dung he thong. Kiem tra lai trang thai WSL2/Docker.
    pause
    exit /b 1
)

echo.
echo [OK] Da dung toan bo container UniRequest-OS (du lieu DB & MinIO duoc giu an toan).
echo.
pause
