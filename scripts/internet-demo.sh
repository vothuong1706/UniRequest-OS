#!/bin/bash
# ==============================================================================
# UniRequest-OS - Hướng dẫn & Khởi chạy Demo qua Internet HTTPS (Chung kết)
# ==============================================================================
set -euo pipefail

MODE="${1:-tunnel}"

echo "=================================================="
echo "🌐 UniRequest-OS Internet HTTPS Demo Launcher"
echo "=================================================="

if [ "$MODE" = "caddy" ]; then
  if [ -z "${PUBLIC_DOMAIN:-}" ]; then
    echo "Vui lòng truyền PUBLIC_DOMAIN (VD: PUBLIC_DOMAIN=unirequest.domain.vn bash scripts/internet-demo.sh caddy)"
    exit 1
  fi
  echo "🚀 Khởi chạy Caddy Automatic HTTPS cho domain: https://${PUBLIC_DOMAIN}"
  docker compose --profile internet up -d --build frontend backend caddy
  echo "✅ Đã bật Caddy HTTPS! Truy cập: https://${PUBLIC_DOMAIN}"
  exit 0
fi

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "ℹ️  Chưa cài đặt cloudflared trên máy."
  echo "Bạn có thể:"
  echo "  1) Cài nhanh cloudflared: curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o ~/.local/bin/cloudflared && chmod +x ~/.local/bin/cloudflared"
  echo "  2) Hoặc chạy trên VPS có domain thật bằng lệnh:"
  echo "     PUBLIC_DOMAIN=unirequest.domain.vn bash scripts/internet-demo.sh caddy"
  exit 0
fi

echo "🌐 Mở Cloudflare Quick Tunnel HTTPS trỏ trực tiếp vào Same-Origin Proxy (:3000)..."
echo "   Mọi luồng UI, Keycloak SSO (/auth), REST API (/api), Socket.IO & MinIO đều chạy qua 1 link HTTPS duy nhất!"
exec cloudflared tunnel --url http://localhost:3000
