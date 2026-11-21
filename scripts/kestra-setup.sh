#!/bin/sh
# ==============================================================================
# UniRequest-OS - Idempotent Kestra GitOps Flow Bootstrap Script (Apache-2.0)
# Tự động nạp toàn bộ các file YAML Workflow trong config/kestra/flows/ vào Kestra Engine
# ==============================================================================
set -eu

KESTRA_URL="${KESTRA_URL:-http://localhost:8085}"
FLOWS_DIR="${FLOWS_DIR:-./config/kestra/flows}"
KESTRA_USER="${KESTRA_BASIC_AUTH_USER:-admin@unirequest.edu.vn}"
KESTRA_PASS="${KESTRA_BASIC_AUTH_PASSWORD:-KestraAdmin2026!}"

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

found=0
for FLOW_FILE in "$FLOWS_DIR"/*.yml; do
  [ -f "$FLOW_FILE" ] || continue
  found=$((found + 1))

  FLOW_ID=$(sed -n 's/^id:[[:space:]]*//p' "$FLOW_FILE" | head -n 1 | tr -d '\r"'\''')
  NAMESPACE=$(sed -n 's/^namespace:[[:space:]]*//p' "$FLOW_FILE" | head -n 1 | tr -d '\r"'\''')

  if [ -z "$FLOW_ID" ] || [ -z "$NAMESPACE" ]; then
    echo "❌ Không đọc được id/namespace trong file: $FLOW_FILE"
    exit 1
  fi

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
      echo "❌ Lỗi POST tạo Workflow [$NAMESPACE/$FLOW_ID] (HTTP $POST_CODE):"
      cat /tmp/kestra_resp.json || true
      exit 1
    fi
  else
    echo "❌ Lỗi đồng bộ Workflow [$NAMESPACE/$FLOW_ID] (HTTP $HTTP_CODE):"
    cat /tmp/kestra_resp.json || true
    exit 1
  fi
done

if [ "$found" -eq 0 ]; then
  echo "❌ Không tìm thấy file workflow *.yml nào trong: $FLOWS_DIR"
  exit 1
fi

echo "=================================================="
echo "✅ Kestra Workflow Engine đã sẵn sàng ($found workflows)!"
echo "  - Kestra UI : http://localhost:8085"
echo "=================================================="
