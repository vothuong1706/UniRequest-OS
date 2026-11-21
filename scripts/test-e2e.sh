#!/bin/bash
# ==============================================================================
# UniRequest-OS End-to-End System Verification Script
# ==============================================================================
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=================================================="
echo "🧪 Kiểm tra Hệ thống UniRequest-OS (E2E Verification)"
echo "=================================================="

# 1. Trạng thái Docker Containers
echo -e "\n${YELLOW}[1/7] Kiểm tra trạng thái Docker Compose...${NC}"
if command -v docker >/dev/null 2>&1; then
  docker compose ps
else
  echo -e "${RED}Docker không khả dụng trong môi trường hiện tại.${NC}"
  exit 1
fi

# 2. Xác minh cấu hình Kong Gateway (/auth, /api, plugins)
echo -e "\n${YELLOW}[2/7] Xác minh cấu hình Kong API Gateway (:8001)...${NC}"
sh ./kong-setup.sh

# 3. Kiểm tra Keycloak OIDC Discovery qua Kong (/auth)
echo -e "\n${YELLOW}[3/7] Kiểm tra Keycloak SSO OIDC qua Kong (:8000/auth)...${NC}"
OIDC_JSON=$(curl -sf http://localhost:8000/auth/realms/unirequest/.well-known/openid-configuration)
echo "$OIDC_JSON" | grep -q '"issuer":"http://localhost:8000/auth/realms/unirequest"' \
  && echo -e "${GREEN}✔ Keycloak Realm [unirequest] OIDC Discovery hợp lệ${NC}" \
  || { echo -e "${RED}✘ Không xác minh được OIDC issuer của Realm unirequest${NC}"; exit 1; }

# 4. Kiểm tra Backend Health Check trực tiếp và qua Kong (kèm X-Correlation-ID)
echo -e "\n${YELLOW}[4/7] Kiểm tra Backend API Health Check (:4000 & :8000/api)...${NC}"
curl -sf http://localhost:4000/api/health
echo ""
KONG_HEALTH_HEADERS=$(curl -sD - -o /dev/null http://localhost:8000/api/health)
echo "$KONG_HEALTH_HEADERS" | grep -qi "200 OK" \
  && echo -e "${GREEN}✔ Kong Proxy /api/health trả về 200 OK${NC}" \
  || { echo -e "${RED}✘ Kong Proxy /api/health thất bại${NC}"; exit 1; }
echo "$KONG_HEALTH_HEADERS" | grep -qi "X-Correlation-ID" \
  && echo -e "${GREEN}✔ Plugin Kong X-Correlation-ID hoạt động${NC}" \
  || echo -e "${YELLOW}⚠ Chưa thấy header X-Correlation-ID${NC}"

# 5. Kiểm tra bảo mật Zero-Trust JWT Guard (không có token phải trả về 401)
echo -e "\n${YELLOW}[5/7] Kiểm tra Middleware bảo mật JWT (không có Token -> 401)...${NC}"
UNAUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/requests)
if [ "$UNAUTH_CODE" = "401" ]; then
  echo -e "${GREEN}✔ API /api/requests chặn truy cập trái phép đúng chuẩn (HTTP 401)${NC}"
else
  echo -e "${RED}✘ Kỳ vọng HTTP 401 khi thiếu JWT, nhưng nhận HTTP $UNAUTH_CODE${NC}"
  exit 1
fi
UNAUTH_CAT_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/categories)
if [ "$UNAUTH_CAT_CODE" = "401" ]; then
  echo -e "${GREEN}✔ API /api/categories chặn truy cập trái phép đúng chuẩn (HTTP 401)${NC}"
else
  echo -e "${RED}✘ Kỳ vọng HTTP 401 cho /api/categories khi thiếu JWT, nhưng nhận HTTP $UNAUTH_CAT_CODE${NC}"
  exit 1
fi
UNAUTH_NOTI_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/notifications)
if [ "$UNAUTH_NOTI_CODE" = "401" ]; then
  echo -e "${GREEN}✔ API /api/notifications chặn truy cập trái phép đúng chuẩn (HTTP 401)${NC}"
else
  echo -e "${RED}✘ Kỳ vọng HTTP 401 cho /api/notifications khi thiếu JWT, nhưng nhận HTTP $UNAUTH_NOTI_CODE${NC}"
  exit 1
fi
UNAUTH_DEPT_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/departments)
if [ "$UNAUTH_DEPT_CODE" = "401" ]; then
  echo -e "${GREEN}✔ API /api/departments chặn truy cập trái phép đúng chuẩn (HTTP 401)${NC}"
else
  echo -e "${RED}✘ Kỳ vọng HTTP 401 cho /api/departments khi thiếu JWT, nhưng nhận HTTP $UNAUTH_DEPT_CODE${NC}"
  exit 1
fi
UNAUTH_KESTRA_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Content-Type: application/json" -d '{}' http://localhost:8000/api/internal/kestra/sla-alert)
if [ "$UNAUTH_KESTRA_CODE" = "401" ]; then
  echo -e "${GREEN}✔ Callback /api/internal/kestra/sla-alert chặn truy cập thiếu x-kestra-key (HTTP 401)${NC}"
else
  echo -e "${RED}✘ Kỳ vọng HTTP 401 cho /api/internal/kestra/sla-alert khi thiếu key, nhưng nhận HTTP $UNAUTH_KESTRA_CODE${NC}"
  exit 1
fi
UNAUTH_PUSH_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8000/api/push/subscribe)
if [ "$UNAUTH_PUSH_CODE" = "401" ]; then
  echo -e "${GREEN}✔ API /api/push/subscribe chặn truy cập trái phép đúng chuẩn (HTTP 401)${NC}"
else
  echo -e "${RED}✘ Kỳ vọng HTTP 401 cho /api/push/subscribe khi thiếu JWT, nhưng nhận HTTP $UNAUTH_PUSH_CODE${NC}"
  exit 1
fi

# 6. Kiểm tra MinIO S3, Frontend PWA & Socket.IO qua Kong
echo -e "\n${YELLOW}[6/7] Kiểm tra MinIO S3 (:9000), Frontend PWA (:3000) & Socket.IO (:8000)...${NC}"
curl -sf -I http://localhost:9000/minio/health/live | head -n 1
FRONTEND_HEALTH=$(curl -sf http://localhost:3000/health)
echo -e "${GREEN}✔ Frontend Nginx (/health): ${FRONTEND_HEALTH}${NC}"
curl -sf http://localhost:3000/manifest.webmanifest | grep -q '"short_name":"UniRequest"' \
  && echo -e "${GREEN}✔ PWA Web Manifest (/manifest.webmanifest) hợp lệ${NC}" \
  || { echo -e "${RED}✘ Không tải được PWA manifest.webmanifest${NC}"; exit 1; }
SW_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/sw.js)
if [ "$SW_CODE" = "200" ]; then
  echo -e "${GREEN}✔ PWA Service Worker (/sw.js) sẵn sàng (HTTP 200)${NC}"
else
  echo -e "${RED}✘ Không tải được Service Worker /sw.js (HTTP $SW_CODE)${NC}"
  exit 1
fi
SIO_HANDSHAKE=$(curl -sf "http://localhost:8000/api/socket.io/?EIO=4&transport=polling")
echo "$SIO_HANDSHAKE" | grep -q '"sid":' \
  && echo -e "${GREEN}✔ Socket.IO Realtime Gateway (/api/socket.io qua Kong) hoạt động${NC}" \
  || { echo -e "${RED}✘ Socket.IO handshake qua Kong thất bại${NC}"; exit 1; }

# 7. Kiểm tra Kestra Workflow Engine (Apache-2.0) & kích hoạt Webhook thật
echo -e "\n${YELLOW}[7/7] Kiểm tra Kestra Workflow Engine (:8085) & GitOps Flow...${NC}"
sh ./scripts/kestra-setup.sh
WEBHOOK_KEY="${KESTRA_WEBHOOK_KEY:-unirequest-dxos-webhook-2026}"
KESTRA_USER="${KESTRA_BASIC_AUTH_USER:-admin@unirequest.edu.vn}"
KESTRA_PASS="${KESTRA_BASIC_AUTH_PASSWORD:-KestraAdmin2026!}"
for flow_id in unirequest-lifecycle unirequest-sla-watchdog unirequest-daily-report; do
  FLOW_CODE=$(curl -s -u "${KESTRA_USER}:${KESTRA_PASS}" -o /dev/null -w "%{http_code}" "http://localhost:8085/api/v1/main/flows/unirequest.dxos/${flow_id}")
  if [ "$FLOW_CODE" = "200" ]; then
    echo -e "${GREEN}✔ Kestra Flow [unirequest.dxos/${flow_id}] đã sẵn sàng (HTTP 200)${NC}"
  else
    echo -e "${RED}✘ Thiếu Kestra Flow [unirequest.dxos/${flow_id}] (HTTP $FLOW_CODE)${NC}"
    exit 1
  fi
done
EXEC_RESP=$(curl -sf -u "${KESTRA_USER}:${KESTRA_PASS}" -X POST "http://localhost:8085/api/v1/main/executions/webhook/unirequest.dxos/unirequest-lifecycle/${WEBHOOK_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"event":"request.created","request_id":"e2e-probe-001","title":"E2E Workflow Probe","priority":"URGENT","status":"PENDING","created_by":"sinhvien"}')
echo "$EXEC_RESP" | grep -q '"id":' \
  && echo -e "${GREEN}✔ Kestra Webhook kích hoạt Execution thành công: $(echo "$EXEC_RESP" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')${NC}" \
  || { echo -e "${RED}✘ Kestra Webhook không tạo được execution${NC}"; exit 1; }

echo -e "\n${GREEN}=================================================="
echo "🎉 Toàn bộ 7/7 kiểm tra E2E UniRequest-OS ĐẠT CHUẨN!"
echo -e "==================================================${NC}"
