#!/bin/sh
# ==============================================================================
# UniRequest-OS - Idempotent Kong API Gateway Bootstrap Script
# Cấu hình tự động cả 2 tuyến chính (/auth -> Keycloak, /api -> Backend)
# cùng các plugin biên mạng: rate-limiting & correlation-id.
# ==============================================================================
set -eu

KONG_ADMIN_URL="${KONG_ADMIN_URL:-http://localhost:8001}"

echo "=================================================="
echo "🔧 Cấu hình Kong API Gateway (UniRequest-OS)"
echo "Kong Admin URL: $KONG_ADMIN_URL"
echo "=================================================="

# Đợi Kong Admin API sẵn sàng (hữu ích khi chạy trong container kong-init)
attempt=0
until curl -sf "$KONG_ADMIN_URL/status" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "❌ Kong Admin API không phản hồi sau 30 lần thử."
    exit 1
  fi
  echo "⏳ Đang chờ Kong Admin API sẵn sàng ($attempt/30)..."
  sleep 2
done

# 1. Service & Route cho Keycloak SSO (/auth -> http://keycloak:8080, strip_path=true)
echo "[1/5] Upsert Service: keycloak-service -> http://keycloak:8080"
curl -sf -X PUT "$KONG_ADMIN_URL/services/keycloak-service" \
  --data "url=http://keycloak:8080" >/dev/null

echo "[2/5] Upsert Route: keycloak-route (/auth, strip_path=true)"
curl -sf -X PUT "$KONG_ADMIN_URL/services/keycloak-service/routes/keycloak-route" \
  --data "paths[]=/auth" \
  --data "strip_path=true" >/dev/null

# 2. Service & Route cho Backend API (/api -> http://backend:4000, strip_path=false)
echo "[3/5] Upsert Service: unirequest-backend -> http://backend:4000"
curl -sf -X PUT "$KONG_ADMIN_URL/services/unirequest-backend" \
  --data "url=http://backend:4000" >/dev/null

echo "[4/5] Upsert Route: api-route (/api, strip_path=false)"
curl -sf -X PUT "$KONG_ADMIN_URL/services/unirequest-backend/routes/api-route" \
  --data "paths[]=/api" \
  --data "strip_path=false" >/dev/null

# 3. Bật plugin bảo vệ biên mạng & truy vết trên service unirequest-backend (idempotent)
echo "[5/5] Kiểm tra & kích hoạt plugin biên mạng (rate-limiting, correlation-id)..."
EXISTING_PLUGINS="$(curl -sf "$KONG_ADMIN_URL/services/unirequest-backend/plugins")"

if ! echo "$EXISTING_PLUGINS" | grep -q '"name":"rate-limiting"'; then
  curl -sf -X POST "$KONG_ADMIN_URL/services/unirequest-backend/plugins" \
    --data "name=rate-limiting" \
    --data "config.minute=120" \
    --data "config.policy=local" >/dev/null
  echo "  ✔ Đã bật plugin rate-limiting (120 req/phút)"
else
  echo "  ✔ Plugin rate-limiting đã được cấu hình sẵn"
fi

if ! echo "$EXISTING_PLUGINS" | grep -q '"name":"correlation-id"'; then
  curl -sf -X POST "$KONG_ADMIN_URL/services/unirequest-backend/plugins" \
    --data "name=correlation-id" \
    --data "config.header_name=X-Correlation-ID" \
    --data "config.generator=uuid" \
    --data "config.echo_downstream=true" >/dev/null
  echo "  ✔ Đã bật plugin correlation-id (X-Correlation-ID)"
else
  echo "  ✔ Plugin correlation-id đã được cấu hình sẵn"
fi

echo "=================================================="
echo "✅ Hoàn tất cấu hình Kong API Gateway!"
echo "  - Keycloak SSO Proxy : http://localhost:8000/auth"
echo "  - Backend API Proxy  : http://localhost:8000/api"
echo "=================================================="
