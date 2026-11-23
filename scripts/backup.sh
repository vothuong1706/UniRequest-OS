#!/bin/bash
# SPDX-License-Identifier: Apache-2.0
# ==============================================================================
# UniRequest-OS - Snapshot Backup (3 PostgreSQL DBs + MinIO Object Data + SHA-256)
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
KONG_USER="${KONG_PG_USER:-kong}"
KONG_DB="${KONG_PG_DB:-kong}"

mkdir -p "$BACKUP_DIR"

echo "=================================================="
echo "💾 UniRequest-OS Backup Snapshot -> ${BACKUP_DIR}"
echo "=================================================="

echo "[1/5] Kết xuất PostgreSQL chính (${PG_DB})..."
docker exec unirequest-postgres pg_dump -U "$PG_USER" -d "$PG_DB" --clean --if-exists \
  | gzip -9 > "${BACKUP_DIR}/postgres.sql.gz"

echo "[2/5] Kết xuất PostgreSQL Kestra (kestra)..."
docker exec unirequest-postgres pg_dump -U "$PG_USER" -d "kestra" --clean --if-exists \
  | gzip -9 > "${BACKUP_DIR}/kestra.sql.gz"

echo "[3/5] Kết xuất PostgreSQL Kong Gateway (${KONG_DB})..."
docker exec unirequest-kong-db pg_dump -U "$KONG_USER" -d "$KONG_DB" --clean --if-exists \
  | gzip -9 > "${BACKUP_DIR}/kong.sql.gz"

echo "[4/5] Đóng gói kho lưu trữ đối tượng MinIO (config/minio/data)..."
if [ -d config/minio/data ] && [ -r config/minio/data ]; then
  tar -czf "${BACKUP_DIR}/minio-data.tar.gz" -C config/minio/data . 2>/dev/null \
    || docker run --rm -v "$(pwd)/config/minio/data:/data:ro" alpine tar -czf - -C /data . > "${BACKUP_DIR}/minio-data.tar.gz"
else
  docker run --rm -v "$(pwd)/config/minio/data:/data:ro" alpine tar -czf - -C /data . > "${BACKUP_DIR}/minio-data.tar.gz"
fi

echo "[5/5] Tạo mã kiểm tra toàn vẹn SHA256SUMS..."
(
  cd "$BACKUP_DIR"
  sha256sum postgres.sql.gz kestra.sql.gz kong.sql.gz minio-data.tar.gz > SHA256SUMS
)

echo "✅ Backup đầy đủ 3 CSDL + MinIO hoàn tất!"
ls -lh "$BACKUP_DIR"
