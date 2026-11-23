#!/bin/bash
# ==============================================================================
# UniRequest-OS - Verified Restore (PostgreSQL + MinIO Object Data)
# Hỗ trợ:
#   bash scripts/restore.sh --dry-run [thư_mục_backup]  (Kiểm chứng checksum + giải nén thử)
#   bash scripts/restore.sh <thư_mục_backup>            (Phục hồi dữ liệu thật)
# ==============================================================================
set -euo pipefail

DRY_RUN=false
TARGET_DIR=""

for arg in "$@"; do
  if [ "$arg" = "--dry-run" ]; then
    DRY_RUN=true
  elif [ -z "$TARGET_DIR" ]; then
    TARGET_DIR="$arg"
  fi
done

if [ -z "$TARGET_DIR" ]; then
  TARGET_DIR="$(ls -1dt backups/*/ 2>/dev/null | head -n 1 || true)"
  TARGET_DIR="${TARGET_DIR%/}"
fi

if [ -z "$TARGET_DIR" ] || [ ! -d "$TARGET_DIR" ]; then
  echo "❌ Không tìm thấy thư mục backup hợp lệ. Hãy chạy 'make backup' trước hoặc truyền đường dẫn."
  exit 1
fi

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

PG_USER="${POSTGRES_USER:-keycloak}"
PG_DB="${POSTGRES_DB:-keycloak}"

echo "=================================================="
echo "♻️  UniRequest-OS Restore Verification: ${TARGET_DIR}"
echo "=================================================="

echo "[1/3] Kiểm tra chữ ký toàn vẹn SHA256SUMS..."
(
  cd "$TARGET_DIR"
  sha256sum -c SHA256SUMS
)

echo "[2/3] Kiểm tra cấu trúc nén postgres.sql.gz & minio-data.tar.gz..."
gzip -t "${TARGET_DIR}/postgres.sql.gz"
tar -tzf "${TARGET_DIR}/minio-data.tar.gz" >/dev/null

if [ "$DRY_RUN" = true ]; then
  echo "✅ [DRY-RUN] Kiểm chứng bản sao lưu hợp lệ 100%, sẵn sàng phục hồi khi cần!"
  exit 0
fi

echo "[3/3] Phục hồi PostgreSQL & MinIO..."
gzip -dc "${TARGET_DIR}/postgres.sql.gz" | docker exec -i unirequest-postgres psql -U "$PG_USER" -d "$PG_DB" >/dev/null
mkdir -p config/minio/data
tar -xzf "${TARGET_DIR}/minio-data.tar.gz" -C config/minio/data

echo "✅ Phục hồi dữ liệu PostgreSQL & MinIO hoàn tất!"
