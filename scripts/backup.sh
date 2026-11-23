#!/bin/bash
# ==============================================================================
# UniRequest-OS - Snapshot Backup (PostgreSQL + MinIO Object Data + SHA-256)
# ==============================================================================
set -euo pipefail

TZ_OPT="${TZ:-Asia/Ho_Chi_Minh}"
STAMP="$(TZ="$TZ_OPT" date +%Y%m%d_%H%M%S)"
BACKUP_ROOT="${BACKUP_ROOT:-backups}"
BACKUP_DIR="${BACKUP_ROOT}/${STAMP}"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

PG_USER="${POSTGRES_USER:-keycloak}"
PG_DB="${POSTGRES_DB:-keycloak}"

mkdir -p "$BACKUP_DIR"

echo "=================================================="
echo "💾 UniRequest-OS Backup Snapshot -> ${BACKUP_DIR}"
echo "=================================================="

echo "[1/3] Kết xuất PostgreSQL (${PG_DB})..."
docker exec unirequest-postgres pg_dump -U "$PG_USER" -d "$PG_DB" --clean --if-exists \
  | gzip -9 > "${BACKUP_DIR}/postgres.sql.gz"

echo "[2/3] Đóng gói kho lưu trữ đối tượng MinIO (config/minio/data)..."
if [ -d config/minio/data ] && [ -r config/minio/data ]; then
  tar -czf "${BACKUP_DIR}/minio-data.tar.gz" -C config/minio/data . 2>/dev/null \
    || docker run --rm -v "$(pwd)/config/minio/data:/data:ro" alpine tar -czf - -C /data . > "${BACKUP_DIR}/minio-data.tar.gz"
else
  docker run --rm -v "$(pwd)/config/minio/data:/data:ro" alpine tar -czf - -C /data . > "${BACKUP_DIR}/minio-data.tar.gz"
fi

echo "[3/3] Tạo mã kiểm tra toàn vẹn SHA256SUMS..."
(
  cd "$BACKUP_DIR"
  sha256sum postgres.sql.gz minio-data.tar.gz > SHA256SUMS
)

echo "✅ Backup hoàn tất!"
ls -lh "$BACKUP_DIR"
