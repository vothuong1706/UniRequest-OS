# Bước 7: Đóng gói Docker Compose, Sao lưu Dữ liệu & Bàn giao Hệ thống

Tài liệu này trình bày bước cuối cùng trong quy trình 7 bước phát triển dự án **UniRequest-OS: Nền tảng Quản lý Yêu cầu Đại học (Student Request Management)**: đóng gói toàn bộ hệ thống bằng Docker Compose, kiểm thử toàn trình 7 bước (`make test`), sao lưu và phục hồi dữ liệu kèm đối chiếu mã băm (`make backup` / `make restore`) và danh mục sản phẩm bàn giao.

---

## 1. Quy trình Đóng gói & Khởi chạy từ Máy sạch (`make build`)

Nhóm chuẩn hóa toàn bộ thao tác khởi dựng hạ tầng và ứng dụng vào tệp [`Makefile`](../../Makefile) và [`docker-compose.yml`](../../docker-compose.yml):
1. **Tự động chuẩn bị biến môi trường (`make env`):** Nếu máy người dùng chưa có tệp `.env`, hệ thống tự động sao chép từ [`.env.example`](../../.env.example).
2. **Đóng gói multi-stage Docker image:**
   - `apps/backend-api/Dockerfile`: Biên dịch mã nguồn TypeScript sang JavaScript trên `node:20-alpine` và khởi chạy máy chủ Express + Socket.IO ở cổng `:4000`.
   - `apps/demo-app/Dockerfile`: Đóng gói ứng dụng React 19 PWA bằng Vite 8, sau đó đưa sang `nginx:alpine` kèm cấu hình `nginx.conf` (Same-Origin Proxy cho `/api` và `/auth`) ở cổng `:3000`.
3. **Tự động cấu hình hạ tầng khi khởi chạy:**
   - `postgres` tự chạy 11 tệp SQL trong `config/postgres/init/`.
   - `keycloak` tự nạp cấu hình realm, nhóm phòng ban và 4 tài khoản mẫu từ `config/keycloak/realm-export.json`.
   - `kong-init` tự chạy `kong-setup.sh` để đăng ký route `/api`, `/auth`, plugin giới hạn tần suất gọi API và `X-Correlation-ID`.
   - `kestra-init` tự chạy `scripts/kestra-setup.sh` để nạp 3 quy trình YAML dưới namespace `unirequest.dxos`.

---

## 2. Kiểm thử Toàn trình 7 Bước trên Hệ thống Đang Chạy (`make test`)

Script [`scripts/test-e2e.sh`](../../scripts/test-e2e.sh) kiểm tra thực tế toàn bộ 8 container dịch vụ:
- **Bước 1:** Kiểm tra trạng thái hoạt động của 8 container (`postgres`, `keycloak`, `kong-db`, `kong`, `minio`, `kestra`, `backend`, `frontend`).
- **Bước 2:** Kiểm tra cấu hình route và plugin trên Kong Admin API (`:8001`).
- **Bước 3:** Kiểm tra endpoint OIDC Discovery của Keycloak Realm `unirequest`.
- **Bước 4:** Kiểm tra `/api/health` đi qua cổng Kong (`:8000`) và xác nhận phản hồi có gắn header `X-Correlation-ID`.
- **Bước 5:** Kiểm tra bảo mật biên mạng & Zero-Trust: xác nhận Nginx (`:3000`) và Kong (`:8000`) chặn `HTTP 403` cho cả `/api/internal/...` và `/api/INTERNAL/...`; xác nhận `/api/requests`, `/api/categories`, `/api/notifications`, `/api/departments`, `/api/push/subscribe` trả `HTTP 401` khi thiếu JWT; xác nhận `/api/upload/files/:objectName` trả `HTTP 401` khi thiếu chữ ký HMAC/JWT; xác nhận callback nội bộ `127.0.0.1:4000/api/internal/kestra/sla-alert` trả `HTTP 401` khi thiếu khóa `x-kestra-key`.
- **Bước 6:** Kiểm tra kết nối MinIO, tệp cấu hình PWA (`manifest.webmanifest`, `sw.js`), giao diện Same-Origin (`:3000`) và kết nối Socket.IO handshake.
- **Bước 7:** Kiểm tra cả 3 quy trình tự động trên Kestra (`unirequest-lifecycle`, `unirequest-sla-watchdog`, `unirequest-daily-report`) và kích hoạt thử nghiệm webhook.

---

## 3. Quy trình Sao lưu & Phục hồi Dữ liệu (`make backup` / `make restore`)

- **Sao lưu (`make backup` -> [`scripts/backup.sh`](../../scripts/backup.sh)):**
  - Xuất đồng bộ toàn bộ 3 cơ sở dữ liệu (`postgres.sql.gz` gồm `keycloak` + ứng dụng, `kestra.sql.gz` và `kong.sql.gz`) rồi kiểm tra tính toàn vẹn của từng tệp nén bằng `gzip -t`.
  - Đóng gói dữ liệu file đính kèm và báo cáo CSV của MinIO ra `minio-data.tar.gz` và kiểm tra bằng `tar -tzf`.
  - Tạo tệp `SHA256SUMS` lưu mã băm `SHA-256` của toàn bộ 4 tệp sao lưu.
- **Phục hồi (`make restore` -> [`scripts/restore.sh`](../../scripts/restore.sh)):**
  - Tự động đối chiếu mã băm `sha256sum -c SHA256SUMS` trước khi khôi phục.
  - Hỗ trợ chế độ kiểm tra an toàn `--dry-run` (mặc định) và chế độ khôi phục thật vào container khi truyền cờ `MODE=apply` (ví dụ: `make restore MODE=apply`).

---

## 4. Danh mục Sản phẩm Bàn giao (`v1.0.0`)

- [x] **Mã nguồn ứng dụng & cấu hình hạ tầng:** `apps/backend-api`, `apps/demo-app`, `config/` (gồm `config/seed/demo-data.json`), `scripts/`, `docker-compose.yml`, `Makefile`, `.env.example`.
- [x] **Bộ 74 bài kiểm thử tự động (`14` tệp test):** Chạy qua `make unit-test` đạt **`74/74` PASS (100%)**, kèm `make seed` idempotent (**18/18** chuỗi `SHA-256` hợp lệ).
- [x] **Hệ thống tài liệu kỹ thuật & hồ sơ dự thi:**
  - Trang chủ & Quản trị FOSS: [`README.md`](../../README.md), [`LICENSE`](../../LICENSE), [`NOTICE`](../../NOTICE), [`CHANGELOG.md`](../../CHANGELOG.md), [`CONTRIBUTING.md`](../../CONTRIBUTING.md), [`SECURITY.md`](../../SECURITY.md)
  - Tài liệu hệ thống: [`docs/README.md`](../README.md), [`docs/architecture.md`](../architecture.md), [`docs/operations.md`](../operations.md), [`docs/uml.md`](../uml.md), [`docs/hoi-dap-hoi-dong.md`](../hoi-dap-hoi-dong.md), [`docs/images/README.md`](../images/README.md)
  - Hồ sơ dự thi OLP PMNM 2026: [`docs/du-thi/README.md`](../du-thi/README.md), [`docs/du-thi/pof-checklist.md`](../du-thi/pof-checklist.md), [`docs/du-thi/ke-hoach-phat-trien.md`](../du-thi/ke-hoach-phat-trien.md), [`docs/du-thi/hoi-dap-hoi-dong.md`](../du-thi/hoi-dap-hoi-dong.md)
  - Hồ sơ nghiên cứu 7 bước SDLC: [`docs/research/README.md`](README.md) và các tệp từ [`01-phan-tich-yeu-cau.md`](01-phan-tich-yeu-cau.md) đến [`07-dong-goi-ban-giao.md`](07-dong-goi-ban-giao.md).
