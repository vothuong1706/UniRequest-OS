#!/bin/sh
# ==============================================================================
# UniRequest-OS - Idempotent Kestra GitOps Flow Bootstrap Script (Apache-2.0)
# Tự động nạp các file YAML Workflow trong config/kestra/flows/ vào Kestra Engine
# ==============================================================================
set -eu

KESTRA_URL="${KESTRA_URL:-http://localhost:8085}"
FLOWS_DIR="${FLOWS_DIR:-./config/kestra/flows}"
KESTRA_USER="${KESTRA_BASIC_AUTH_USER:-admin@unirequest.edu.vn}"
KESTRA_PASS="${KESTRA_BASIC_AUTH_PASSWORD:-KestraAdmin2026!}"
NAMESPACE="unirequest.dxos"
FLOW_ID="unirequest-lifecycle"
FLOW_FILE="$FLOWS_DIR/unirequest-lifecycle.yml"

echo "=================================================="
echo "⚙️  Cấu hình Kestra Workflow Engine (UniRequest-OS)"
echo "Kestra URL: $KESTRA_URL"
echo "=================================================="

attempt=0
until curl -sf "$KESTRA_URL/ping" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 45 ]; then
    echo "❌ Kestra API không phản hồi sau 45 lần thử."
    exit 1
  fi
  echo "⏳ Đang chờ Kestra Engine khởi động ($attempt/45)..."
  sleep 2
done

if [ ! -f "$FLOW_FILE" ]; then
  echo "❌ Không tìm thấy file workflow: $FLOW_FILE"
  exit 1
fi

# Upsert Flow: thử PUT trước nếu đã tồn tại, nếu 404 thì POST tạo mới
HTTP_CODE=$(curl -s -o /tmp/kestra_resp.json -w "%{http_code}" \
  -u "$KESTRA_USER:$KESTRA_PASS" \
  -X PUT "$KESTRA_URL/api/v1/main/flows/$NAMESPACE/$FLOW_ID" \
  -H "Content-Type: application/x-yaml" \
  --data-binary "@$FLOW_FILE")

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
  echo "  ✔ Đã cập nhật Workflow YAML [$NAMESPACE/$FLOW_ID] (HTTP $HTTP_CODE)"
elif [ "$HTTP_CODE" = "404" ]; then
  POST_CODE=$(curl -s -o /tmp/kestra_resp.json -w "%{http_code}" \
    -u "$KESTRA_USER:$KESTRA_PASS" \
    -X POST "$KESTRA_URL/api/v1/main/flows" \
    -H "Content-Type: application/x-yaml" \
    --data-binary "@$FLOW_FILE")
  if [ "$POST_CODE" = "200" ] || [ "$POST_CODE" = "201" ]; then
    echo "  ✔ Đã khởi tạo mới Workflow YAML [$NAMESPACE/$FLOW_ID] (HTTP $POST_CODE)"
  else
    echo "❌ Lỗi POST tạo Workflow (HTTP $POST_CODE):"
    cat /tmp/kestra_resp.json || true
    exit 1
  fi
else
  echo "❌ Lỗi đồng bộ Workflow vào Kestra (HTTP $HTTP_CODE):"
  cat /tmp/kestra_resp.json || true
  exit 1
fi

echo "=================================================="
echo "✅ Kestra Workflow Engine đã sẵn sàng!"
echo "  - Kestra UI : http://localhost:8085"
echo "  - Flow      : $NAMESPACE / $FLOW_ID"
echo "=================================================="
