# ==============================================================================
# UniRequest-OS - DevOps Automation Makefile (Two-Tier Open-Core Platform)
# Sử dụng: chạy `make help` để xem toàn bộ danh sách lệnh.
# ==============================================================================

SHELL := /bin/bash
.DEFAULT_GOAL := help

COMPOSE := docker compose
SERVICE ?=

.PHONY: help env up build down restart ps logs test smoke unit-test lint dev-fe dev-be clean

help: ## Hiển thị danh sách toàn bộ lệnh hỗ trợ
	@echo "=============================================================="
	@echo "  UniRequest-OS (DX-OS Open-Core) - DevOps Command Reference"
	@echo "=============================================================="
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36mmake %-12s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "Ví dụ xem log riêng 1 dịch vụ: make logs SERVICE=backend"

env: ## Tạo file .env từ .env.example nếu chưa tồn tại
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "✔ Đã khởi tạo .env từ .env.example"; \
	else \
		echo "✔ File .env đã tồn tại (giữ nguyên)"; \
	fi

up: env ## Khởi chạy toàn bộ hệ thống Docker Compose ở chế độ nền
	$(COMPOSE) up -d

build: env ## Build lại image và khởi chạy toàn bộ hệ thống (1-lệnh chạy ngay)
	$(COMPOSE) up -d --build
	@docker exec unirequest-kong kong reload >/dev/null 2>&1 || true

down: ## Dừng toàn bộ hệ thống Docker (an toàn, giữ nguyên dữ liệu DB & MinIO)
	$(COMPOSE) down

restart: ## Khởi động lại toàn bộ (hoặc 1 dịch vụ qua SERVICE=<tên>)
	$(COMPOSE) restart $(SERVICE)

ps: ## Xem trạng thái các container đang chạy
	$(COMPOSE) ps

logs: ## Xem log thời gian thực (mặc định tất cả; lọc bằng SERVICE=backend|frontend|kestra)
	$(COMPOSE) logs -f --tail=100 $(SERVICE)

test: ## Chạy kịch bản kiểm thử E2E 7 bước (Kong, Keycloak, Backend, JWT 401, MinIO, Frontend, Kestra)
	bash scripts/test-e2e.sh

smoke: test ## Bí danh (alias) của `make test`

unit-test: ## Chạy bộ kiểm thử đơn vị (Vitest) cho cả Backend & Frontend
	@echo "🧪 [1/2] Chạy Backend Unit & Route Tests (apps/backend-api)..."
	cd apps/backend-api && npm test
	@echo "🧪 [2/2] Chạy Frontend Unit Tests (apps/demo-app)..."
	cd apps/demo-app && npm test
	@echo "✅ Toàn bộ Unit Tests đạt 100%!"

lint: ## Kiểm tra Clean Code cho cả Frontend (tsc, eslint, prettier, build) & Backend (tsc)
	@echo "🔍 [1/3] Kiểm tra Frontend (apps/demo-app)..."
	cd apps/demo-app && npm run typecheck && npm run lint && npm run format:check && npm run build
	@echo "🔍 [2/3] Kiểm tra Backend (apps/backend-api)..."
	cd apps/backend-api && npm run build
	@echo "🔍 [3/3] Kiểm tra cú pháp Docker Compose & Keycloak Realm JSON..."
	$(COMPOSE) --env-file .env.example config -q
	python3 -m json.tool config/keycloak/realm-export.json >/dev/null
	@echo "✅ Toàn bộ kiểm tra Clean Code & Hạ tầng ĐẠT 100%!"

dev-fe: ## Chạy Frontend Vite HMR cục bộ trên cổng 5173 (không đụng Docker Frontend :3000)
	cd apps/demo-app && npm run dev -- --port 5173 --host

dev-be: ## Chạy Backend Express chế độ phát triển cục bộ
	cd apps/backend-api && npm run dev

clean: ## [NGUY HIỂM] Dừng hệ thống và xóa toàn bộ container, network, volume & dữ liệu DB cục bộ
	@echo "⚠️  CẢNH BÁO: Thao tác này sẽ XÓA SẠCH Database (PostgreSQL, Kong, Kestra) và tệp MinIO!"
	@read -r -p "Nhập chính xác 'YES' để xác nhận xóa toàn bộ dữ liệu: " confirm; \
	if [ "$$confirm" = "YES" ]; then \
		$(COMPOSE) down -v --remove-orphans; \
		rm -rf config/postgres/data config/kong/db-data config/minio/data 2>/dev/null || \
			docker run --rm -v "$$(pwd)/config:/cfg" postgres:16-alpine rm -rf /cfg/postgres/data /cfg/kong/db-data /cfg/minio/data 2>/dev/null || \
			sudo rm -rf config/postgres/data config/kong/db-data config/minio/data 2>/dev/null || true; \
		echo "🧹 Đã dọn sạch container, volumes và dữ liệu cục bộ."; \
	else \
		echo "✖ Đã hủy thao tác make clean (dữ liệu được giữ an toàn)."; \
	fi
