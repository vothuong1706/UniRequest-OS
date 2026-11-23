#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# ==============================================================================
# UniRequest-OS - Đóng gói bản phát hành định dạng mở (.tar.gz + .sha256)
# Chỉ đưa vào mã nguồn/cấu hình/tài liệu sạch (loại trừ .env, node_modules,
# dữ liệu volume, BAOCAO nội bộ, .agents và các thư mục tạm).
# ==============================================================================
set -euo pipefail

VERSION="${1:-1.0.0}"
OUT_DIR="releases"
PKG_NAME="UniRequest-OS-v${VERSION}"
ARCHIVE="${OUT_DIR}/${PKG_NAME}.tar.gz"
CHECKSUM="${ARCHIVE}.sha256"

mkdir -p "$OUT_DIR"

tar -czf "$ARCHIVE" \
  --transform "s,^\.,${PKG_NAME}," \
  --exclude='./.git' \
  --exclude='./.env' \
  --exclude='./**/.env' \
  --exclude='./.env.local' \
  --exclude='./.agents' \
  --exclude='./agency-agents' \
  --exclude='./BAOCAO' \
  --exclude='./backups' \
  --exclude='./releases' \
  --exclude='./images' \
  --exclude='./tmp' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='build' \
  --exclude='coverage' \
  --exclude='./config/postgres/data' \
  --exclude='./config/kong/db-data' \
  --exclude='./config/minio/data' \
  --exclude='./config/kestra/storage' \
  --exclude='./docs/specs' \
  --exclude='./docs/DevOops.md' \
  --exclude='./docs/KEHOACH.md' \
  --exclude='./docs/TichHopDuAn.md' \
  --exclude='./docs/TongQuanDuAn.md' \
  --exclude='*.docx' \
  --exclude='*.log' \
  .

# Tự kiểm tra gói phát hành sạch: không chứa .env thật, node_modules hay .agents
CONTENTS="$(tar -tzf "$ARCHIVE")"
if echo "$CONTENTS" | grep -qE '(^|/)\.env$|/node_modules/|/\.agents/|/BAOCAO/'; then
  echo "❌ Phát hiện tệp nhạy cảm hoặc thư viện biên dịch lọt vào gói phát hành!"
  rm -f "$ARCHIVE"
  exit 1
fi

(
  cd "$OUT_DIR"
  sha256sum "${PKG_NAME}.tar.gz" > "${PKG_NAME}.tar.gz.sha256"
)

echo "✅ Đã tạo gói phát hành chuẩn định dạng mở:"
ls -lh "$ARCHIVE" "$CHECKSUM"
cat "$CHECKSUM"
