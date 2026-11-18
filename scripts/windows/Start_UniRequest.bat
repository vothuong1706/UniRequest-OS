@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

title UniRequest-OS - Smart Launcher

set "WSL_DISTRO=Ubuntu-24.04"
set "PROJECT_DIR=~/projects/UniRequest-OS"

echo ==============================================================
echo   UniRequest-OS - Smart Windows/WSL2 Launcher
echo ==============================================================
echo.

echo [1/4] Dang danh thuc Ubuntu WSL2 (%WSL_DISTRO%)...
wsl -d %WSL_DISTRO% -e true
if errorlevel 1 (
    echo [LOI] Khong tim thay distro WSL "%WSL_DISTRO%". Vui long kiem tra bang lenh: wsl -l -v
    pause
    exit /b 1
)

echo [2/4] Kiem tra Docker Engine trong WSL2...
wsl -d %WSL_DISTRO% -e bash -c "for i in $(seq 1 15); do docker info >/dev/null 2>&1 && exit 0; echo '  Dang cho Docker Desktop/Engine san sang...'; sleep 2; done; exit 1"
if errorlevel 1 (
    echo [LOI] Docker Engine chua san sang. Hay mo Docker Desktop tren Windows roi thu lai.
    pause
    exit /b 1
)

echo [3/4] Khoi chay toan bo cum DX-OS Open-Core (make up)...
wsl -d %WSL_DISTRO% -e bash -c "cd %PROJECT_DIR% && make up"
if errorlevel 1 (
    echo [LOI] Khoi chay Docker Compose that bai. Kiem tra log bang lenh: make logs
    pause
    exit /b 1
)

echo [4/4] Dang cho Frontend (:3000), Kong/Backend (:8000) va Kestra (:8085) san sang...
wsl -d %WSL_DISTRO% -e bash -c "for i in $(seq 1 40); do \
  curl -sf http://localhost:3000/health >/dev/null 2>&1 && \
  curl -sf http://localhost:8000/api/health >/dev/null 2>&1 && \
  curl -sf http://localhost:8085/ping >/dev/null 2>&1 && exit 0; \
  echo \"  Dang doi cac dich vu khoi dong ($i/40)...\"; \
  sleep 2; \
done; echo '  [Canh bao] Mot so dich vu van dang khoi dong nen, van tien hanh mo trinh duyet.'; exit 0"

echo.
echo [OK] Dang mo trinh duyet den cac cong dich vu UniRequest-OS...
start "" "http://localhost:3000"
start "" "http://localhost:8085"
start "" "http://localhost:8080"

echo.
echo ==============================================================
echo   HE THONG DA SAN SANG!
echo   - UniRequest Portal : http://localhost:3000
echo   - Kestra Workflow   : http://localhost:8085
echo   - Keycloak SSO      : http://localhost:8080
echo ==============================================================
echo.
pause
