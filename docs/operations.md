# Hướng dẫn Vận hành, Workflow Kestra & Kiểm chứng Chất lượng

Tài liệu hợp nhất quy trình triển khai sạch, cấu trúc workflow tự động hóa `unirequest.dxos`, ma trận bằng chứng kiểm thử (`42/42` Unit Tests + `7/7` E2E) và xử lý sự cố cho **UniRequest-OS (`v0.9.0`)**.

---

## 1. Triển khai Máy sạch & Internet HTTPS

### Khởi chạy cục bộ bằng 1 lệnh
1. Cài sẵn **Docker Engine `24.0+`**, **Docker Compose `v2.20+`**, **GNU Make `4.0+`**, RAM tối thiểu `4 GB`.
2. Chạy `git clone https://github.com/vothuong1706/UniRequest-OS.git && cd UniRequest-OS && make build`.
3. Lệnh `make build` tự động chạy `make env` (tạo `.env` từ `.env.example` nếu chưa có), build Docker images (`backend`, `frontend`) và chạy tổng cộng 8 dịch vụ nền kèm 3 container init (`kong-migration`, `kong-init`, `kestra-init`).
4. Trên Windows WSL2, có thể chạy bằng [`scripts/windows/Start_UniRequest.bat`](../scripts/windows/Start_UniRequest.bat) và dừng bằng `Stop_UniRequest.bat`.

### Mở demo công khai qua Internet HTTPS (Mục 6 OLP)
- **Không cần tên miền (Cloudflare Quick Tunnel):** `bash scripts/internet-demo.sh` (trỏ `cloudflared` vào `:3000`).
- **VPS có tên miền riêng (Caddy Automatic HTTPS):** `PUBLIC_DOMAIN=unirequest.domain.vn bash scripts/internet-demo.sh caddy` (bật profile `internet` từ [`config/caddy/Caddyfile`](../config/caddy/Caddyfile)).
- Nhờ Nginx Same-Origin (`apps/demo-app/nginx.conf`), helper `resolveServiceUrl()` và proxy `GET /api/upload/files/:objectName`, cả giao diện, Keycloak SSO (`/auth`), API (`/api`), Socket.IO và ảnh MinIO đều đi trên 1 tên miền HTTPS duy nhất.

---

## 2. Đặc tả Workflow Tự động hóa (`unirequest.dxos`) & Trạng thái

Toàn bộ các luồng nghiệp vụ và quy trình ngầm được đồng bộ idempotent qua [`scripts/kestra-setup.sh`](../scripts/kestra-setup.sh) và chạy thống nhất múi giờ `Asia/Ho_Chi_Minh (+07:00)`:

| Workflow / Luồng | Trigger & Đầu vào | Luồng chính (Happy Path) | Cơ chế lỗi & Phục hồi (Fail-Safe) |
| :--- | :--- | :--- | :--- |
| **`unirequest-lifecycle`** | Webhook từ `RequestController` (`request.created` / `status_changed`) | Phân tuyến `target_department`, phân loại SLA (`URGENT`/`HIGH`/`NORMAL`), ghi `workflow_execution_id` về PostgreSQL | Nếu Kestra đang khởi động hoặc timeout, `workflow-service.ts` ghi log cảnh báo và bảo toàn giao dịch `PENDING` trong PostgreSQL (không làm mất đơn) |
| **`unirequest-sla-watchdog`** | Cron `*/15 * * * *` (hoặc chạy tay với `testThresholdMinutes`) | Quét đơn `PENDING` chưa bị ẩn quá ngưỡng SLA -> gọi `POST /api/internal/kestra/sla-alert` (`x-kestra-key`) -> ghi audit `SLA_WARNING` + bắn thông báo `URGENT` đúng Ban | Chống lặp cảnh báo trùng trong 6 giờ trên `request_audit_logs`; từ chối HTTP `401` nếu thiếu hoặc sai `x-kestra-key` |
| **`unirequest-daily-report`** | Cron `30 17 * * *` (hoặc chạy tay) | Truy vấn song song tổng hợp theo Ban + KPI -> chuyển `IonToCsv` -> upload lên `unirequest-files/reports/daily/` trên MinIO | Cho phép kích hoạt thủ công trên Kestra UI (`:8085`) bất kỳ lúc nào mà không chờ tới cuối ngày |
| **Gợi ý phân tuyến AI `[I]`** | `POST /api/requests/ai-suggest` | Gọi `Ollama` (`OLLAMA_MODEL=qwen2.5:3b`, JSON schema, timeout `3.5s`) -> đối chiếu Group/Danh mục thật | Khi tắt Ollama hoặc máy không có GPU, tự fallback trong vài mili-giây sang `rule-nlp-engine` tiếng Việt nội bộ |
| **Upload & Kiểm dịch tệp** | `POST /api/upload` (`multipart`, `<= 20MB`) | Kiểm tra phần mở rộng + `Magic Bytes` trên RAM Buffer -> đẩy MinIO -> trả đường dẫn `/api/upload/files/:objectName` | Chặn HTTP `400 UNSUPPORTED_OR_SPOOFED_FILE` nếu phát hiện `.exe`, `.sh`, `.svg`, `.html`, `.js` hoặc tệp giả mạo chữ ký |

### Bản đồ trạng thái thực thể (`requests`)
- `PENDING` -> `APPROVED` (do `canbo`/`giangvien`/`admin` cùng phạm vi Ban duyệt, nối chuỗi `SHA-256`).
- `PENDING` -> `REJECTED` (bắt buộc nhập `review_note`, nối chuỗi `SHA-256`).
- Cờ ẩn 2 phía độc lập: `hidden_by_sender` (Sinh viên xóa lịch sử) và `hidden_by_receiver` (Ban xóa hàng đợi); khi cả hai `TRUE` hệ thống tự xóa vật lý khỏi PostgreSQL.

---

## 3. Ma trận Hoàn thiện & Bằng chứng Kiểm thử Thực chứng

| Hạng mục | Mức độ | Tệp kiểm thử & Phạm vi thật trong repo | Lệnh xác minh | Kết quả mới nhất |
| :--- | :---: | :--- | :--- | :--- |
| Phân quyền 3 phạm vi & Cây Group | **Hoàn thiện** | `apps/backend-api/tests/request-scope.test.ts` (8 tests), `category-scope.test.ts` (3 tests) | `make unit-test` | **11/11 đạt** |
| Xóa độc lập 2 phía & Tự dọn DB | **Hoàn thiện** | `apps/backend-api/tests/independent-delete.test.ts` (4 tests) | `make unit-test` | **4/4 đạt** |
| Hybrid AI `[I]` (Ollama + NLP Fallback) | **Hoàn thiện** | `apps/backend-api/tests/ai-triage.test.ts` (6 tests) | `make unit-test` | **6/6 đạt** |
| Kiểm dịch Magic Bytes & Sổ cái SHA-256 | **Hoàn thiện** | `apps/backend-api/tests/file-security.test.ts` (4 tests), `audit-hash-chain.test.ts` (3 tests) | `make unit-test` | **7/7 đạt** |
| Callback Kestra Watchdog & Bảo mật key | **Hoàn thiện** | `apps/backend-api/tests/internal-kestra-routes.test.ts` (5 tests) | `make unit-test` | **5/5 đạt** |
| Tiện ích UI, Múi giờ `+07:00` & Same-Origin | **Hoàn thiện** | `apps/demo-app/src/features/requests/utils/__tests__/priority.test.ts` (4), `src/lib/__tests__/format.test.ts` (5) | `make unit-test` | **9/9 đạt** |
| Clean Code, PWA Build & Cấu hình hạ tầng | **Hoàn thiện** | `tsc -b`, `eslint`, `prettier --check`, `vite build` + Workbox SW, `tsc`, Compose, `realm-export.json` | `make lint` | **Đạt 100%** |
| Kiểm thử tích hợp toàn trình 8 containers | **Hoàn thiện** | [`scripts/test-e2e.sh`](../scripts/test-e2e.sh): Kong, OIDC, `/api/health`, 6x HTTP `401`, MinIO, PWA, Socket.IO, 3 Kestra flows | `make test` | **7/7 bước đạt** |
| Sao lưu & Kiểm chứng phục hồi toàn vẹn | **Hoàn thiện** | [`scripts/backup.sh`](../scripts/backup.sh) + [`scripts/restore.sh`](../scripts/restore.sh) kiểm tra `SHA256SUMS`, `gzip -t`, `tar -tzf` | `make backup` / `make restore` | **Toàn vẹn 100%** |

---

## 4. Tự chẩn đoán & Xử lý sự cố thường gặp

| Triệu chứng | Nguyên nhân | Cách khắc phục |
| :--- | :--- | :--- |
| Truy cập `http://localhost:8000/` báo JSON `404 no Route matched` | Kong Gateway chỉ định tuyến `/api/*` và `/auth/*`, không mở giao diện ở `/` | Truy cập Portal tại <http://localhost:3000> hoặc kiểm tra Kong tại <http://localhost:8000/api/health> |
| Mở bằng IP LAN (`http://192.168.x.x:3000`) không đăng nhập được Keycloak | Trình duyệt chặn Web Crypto PKCE `S256` trên origin HTTP khác `localhost` | Dùng `http://localhost:3000` hoặc chạy `bash scripts/internet-demo.sh` để dùng qua `https://` |
| Xung đột cổng `3000`, `4000`, `5432`, `8000`, `8080`, `8085`, `9000` | Có tiến trình khác trên máy đang chiếm cổng | Dừng dịch vụ trùng cổng hoặc đổi ánh xạ cổng host trong [`docker-compose.yml`](../docker-compose.yml) rồi `make build` |
| Chưa chạy Ollama trên máy chấm thi | `OLLAMA_URL` không phản hồi hoặc máy không có GPU | Bình thường: `AiTriageService` tự chuyển sang `rule-nlp-engine` trong vài mili-giây |
| Kiểm tra nhanh trạng thái & log từng container | Cần xem log lỗi riêng `backend` hoặc `kestra` | Chạy `make ps` và `make logs SERVICE=backend` (hoặc `kestra`, `keycloak`, `kong`) |
