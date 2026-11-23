# Hướng dẫn Vận hành, Quy trình Kestra & Kết quả Kiểm thử - UniRequest-OS

Tài liệu này hướng dẫn chi tiết cách cài đặt hệ thống từ máy sạch, mở kết nối HTTPS qua Internet, mô tả 3 quy trình tự động hóa Kestra (`unirequest.dxos`), bảng tổng hợp kết quả kiểm thử theo quy trình 7 bước SDLC (xem chi tiết tại [`research/README.md`](research/README.md)) và cách xử lý các lỗi thường gặp cho **UniRequest-OS: Nền tảng Quản lý Yêu cầu Đại học (Student Request Management)** phiên bản `v1.0.0`.

---

## 1. Hướng dẫn Cài đặt từ Máy sạch & Mở Demo HTTPS qua Internet

### Khởi chạy cục bộ từ mã nguồn
1. Chuẩn bị môi trường: **Docker Engine `24.0+`**, **Docker Compose `v2.20+`**, **GNU Make `4.0+`**, bộ nhớ RAM trống tối thiểu `4 GB` *(khuyến nghị `6 GB`; mức tiêu thụ đo thực tế bằng `docker stats --no-stream` sau khi tối ưu `KONG_NGINX_WORKER_PROCESSES=2` và JVM heap `-Xms192m -Xmx512m` đạt `~2.17 GiB` trên toàn bộ 8 container, giảm từ `3.28 GiB`)*.
2. Tải mã nguồn và khởi dựng:
   ```bash
   git clone https://github.com/vothuong1706/UniRequest-OS.git
   cd UniRequest-OS
   make build
   ```
3. Lệnh `make build` sẽ tự động gọi `make env` (tạo tệp `.env` từ `.env.example` nếu chưa tồn tại), đóng gói image `backend` (`USER node` non-root) và `frontend`, khởi chạy 8 container dịch vụ cùng 3 container cấu hình ban đầu (`kong-migration`, `kong-init`, `kestra-init`), đồng thời **tự động nạp dữ liệu mẫu từ [`config/seed/demo-data.json`](../config/seed/demo-data.json)** nếu cơ sở dữ liệu trống (có thể chạy lại idempotent bất kỳ lúc nào qua `make seed`, hoặc tắt bằng `SEED_DEMO_DATA=false`).
4. Trên Windows WSL2, người dùng có thể nhấp đúp chạy [`scripts/windows/Start_UniRequest.bat`](../scripts/windows/Start_UniRequest.bat) và dừng hệ thống bằng `Stop_UniRequest.bat`.

### Mở demo công khai qua Internet HTTPS (`tunnel` & `caddy`)
- **Chạy nhanh không cần tên miền riêng (Cloudflare Quick Tunnel):**
  ```bash
  bash scripts/internet-demo.sh
  ```
  Script sẽ tạo đường hầm HTTPS công khai trỏ trực tiếp vào cổng `:3000`.
- **Chạy trên máy chủ VPS có tên miền riêng (Caddy Automatic HTTPS):**
  ```bash
  PUBLIC_DOMAIN=unirequest.domain.vn bash scripts/internet-demo.sh caddy
  ```
  Lệnh này bật profile `internet` sử dụng cấu hình [`config/caddy/Caddyfile`](../config/caddy/Caddyfile).
- Nhờ cấu hình Nginx Same-Origin (`apps/demo-app/nginx.conf`), hàm `resolveServiceUrl()` và route chuyển tiếp file `GET /api/upload/files/:objectName`, toàn bộ giao diện, đăng nhập Keycloak SSO (`/auth`), REST API (`/api`), Socket.IO và hình ảnh lưu trên MinIO đều hoạt động chung trên một tên miền HTTPS duy nhất.

---

## 2. Mô tả 3 Quy trình Tự động hóa Kestra (`unirequest.dxos`) & Các Luồng Xử lý

Cả 3 quy trình Kestra được nạp tự động qua script [`scripts/kestra-setup.sh`](../scripts/kestra-setup.sh) và sử dụng thống nhất múi giờ `Asia/Ho_Chi_Minh (+07:00)`:

| Quy trình / Module | Sự kiện kích hoạt | Luồng xử lý chính | Cơ chế dự phòng khi gặp lỗi |
| :--- | :--- | :--- | :--- |
| **`unirequest-lifecycle`** | Webhook từ `RequestController` (`request.created` / `status_changed`) | Phân luồng theo `target_department`, xác định khung thời gian SLA (`URGENT`/`HIGH`/`NORMAL`), trả `workflow_execution_id` về lưu trong PostgreSQL | Nếu Kestra đang khởi động hoặc phản hồi chậm, `workflow-service.ts` ghi nhận log cảnh báo và vẫn giữ nguyên yêu cầu `PENDING` trong PostgreSQL để không làm mất đơn của sinh viên |
| **`unirequest-sla-watchdog`** | Chạy định kỳ theo lịch Cron `*/15 * * * *` (hoặc bấm chạy thử với `testThresholdMinutes`) | Quét các yêu cầu `PENDING` chưa bị ẩn đã quá hạn SLA -> gọi `POST /api/internal/kestra/sla-alert` kèm khóa `x-kestra-key` -> ghi lịch sử `SLA_WARNING` và gửi thông báo `URGENT` cho đúng phòng ban | Kiểm tra bảng `request_audit_logs` để tránh gửi cảnh báo lặp lại cho cùng một đơn; trả về HTTP `401` nếu thiếu hoặc sai khóa `x-kestra-key` |
| **`unirequest-daily-report`** | Chạy định kỳ cuối mỗi ngày theo lịch Cron `30 17 * * *` (hoặc bấm chạy tay) | Truy vấn thống kê số lượng yêu cầu theo từng phòng ban -> chuyển đổi dữ liệu qua `IonToCsv` -> tải tệp báo cáo CSV lên thư mục `unirequest-files/reports/daily/` trên MinIO | Cho phép quản trị viên bấm chạy thủ công trên giao diện Kestra UI (`:8085`) bất kỳ lúc nào để xuất báo cáo ngay |
| **Gợi ý phân tuyến AI `[I]`** | `POST /api/requests/ai-suggest` | Gọi dịch vụ `Ollama` (`OLLAMA_MODEL=qwen2.5:3b`, định dạng JSON) -> đối chiếu với cây nhóm phòng ban và danh mục thật | Khi máy không bật Ollama hoặc không có GPU, hệ thống tự động chuyển sang bộ phân tích từ khóa tiếng Việt nội bộ với thời gian phản hồi `< 5ms` |
| **Tải lên & Kiểm tra file** | `POST /api/upload` (`multipart`, `<= 20MB`) | Kiểm tra chữ ký file thật (`Magic Bytes`) trong bộ nhớ trước khi lưu lên MinIO -> trả về đường dẫn `/api/upload/files/:objectName` | Từ chối với mã lỗi HTTP `400 UNSUPPORTED_OR_SPOOFED_FILE` nếu phát hiện file thực thi/script (`.exe`, `.sh`, `.svg`, `.html`, `.js`) hoặc file đổi đuôi giả mạo |

### Trạng thái vòng đời của một yêu cầu (`requests`)
- `PENDING` -> `APPROVED`: Cán bộ, giảng viên hoặc quản trị viên thuộc phạm vi phòng ban phụ trách phê duyệt đơn, hệ thống nối tiếp mã băm `SHA-256` vào lịch sử xử lý.
- `PENDING` -> `REJECTED`: Bắt buộc nhập lý do phản hồi `review_note` tối thiểu 5 ký tự, hệ thống nối tiếp mã băm `SHA-256` vào lịch sử xử lý.
- Hai cờ ẩn đơn độc lập: `hidden_by_sender` (sinh viên xóa đơn khỏi danh sách lịch sử cá nhân) và `hidden_by_receiver` (cán bộ xóa đơn khỏi danh sách hàng đợi phòng ban); khi cả hai cờ cùng bằng `TRUE`, bản ghi được dọn khỏi PostgreSQL.

---

## 3. Bảng Tổng hợp Kết quả Kiểm thử Hệ thống (7 Bước SDLC)

| Hạng mục kiểm thử | Tệp kiểm thử & Phạm vi xác minh trong dự án | Lệnh chạy | Kết quả thực tế |
| :--- | :--- | :--- | :--- |
| Kiểm tra giấy phép nguồn mở, SPDX & cấu hình hạ tầng | `apps/backend-api/tests/sdlc-compliance-hygiene.test.ts` (8 bài test: `LICENSE`, `NOTICE`, `CHANGELOG`/`CONTRIBUTING`/`SECURITY`, SPDX 98 tệp, liên kết Markdown, `realm-export.json`, 3 Kestra flows, 7 bảng SQL, zero-hardcode `.env`, 12 ảnh) | `make unit-test` | **8/8 PASS** |
| Dữ liệu mẫu ngoài JSON & Chuỗi `SHA-256` | `apps/backend-api/tests/seed-demo-data.test.ts` (5 bài test: `config/seed/demo-data.json` 15 danh mục + 18 yêu cầu 7 ngày + 2 đơn quá hạn SLA, `verifyAuditChain` hợp lệ 100%, idempotency) | `make unit-test` | **5/5 PASS** |
| Ký URL tệp đính kèm HMAC & Private MinIO Proxy | `apps/backend-api/tests/attachment-signing.test.ts` (4 bài test: ký/xác minh HMAC, chặn hết hạn/tráo tên, chặn `401` thiếu chữ ký/JWT, cho phép `200` khi hợp lệ) | `make unit-test` | **4/4 PASS** |
| Phân quyền 3 phạm vi & Danh mục phòng ban | `apps/backend-api/tests/request-scope.test.ts` (8 bài test), `category-scope.test.ts` (3 bài test) | `make unit-test` | **11/11 PASS** |
| Xóa đơn độc lập 2 phía & Tự dọn CSDL | `apps/backend-api/tests/independent-delete.test.ts` (4 bài test) | `make unit-test` | **4/4 PASS** |
| Kiểm tra dữ liệu đầu vào & Bộ câu mẫu tiếng Việt AI | `apps/backend-api/tests/request-controller-acceptance.test.ts` (8 bài test `Given/When/Then` cho API yêu cầu & kiểm thử gợi ý AI trên 5 phòng ban `< 5ms`) | `make unit-test` | **8/8 PASS** |
| Gợi ý phân loại AI `[I]` (Ollama + Từ khóa tiếng Việt) | `apps/backend-api/tests/ai-triage.test.ts` (6 bài test) | `make unit-test` | **6/6 PASS** |
| Kiểm tra bảo mật ứng dụng theo các nguy cơ OWASP | `apps/backend-api/tests/security-owasp-audit.test.ts` (7 bài test: chặn thiếu JWT `401`, chặn sai vai trò `403`, chống IDOR chéo phòng ban, kiểm tra UUID, chặn XSS `attachment_url`, CORS allowlist, giới hạn đầu ra AI) | `make unit-test` | **7/7 PASS** |
| Kiểm tra chữ ký file `Magic Bytes` & Mã băm `SHA-256` | `apps/backend-api/tests/file-security.test.ts` (4 bài test), `audit-hash-chain.test.ts` (3 bài test) | `make unit-test` | **7/7 PASS** |
| Callback Kestra cảnh báo SLA & Khóa nội bộ | `apps/backend-api/tests/internal-kestra-routes.test.ts` (5 bài test) | `make unit-test` | **5/5 PASS** |
| Tiện ích giao diện, Múi giờ `+07:00` & Same-Origin | `apps/demo-app/src/features/requests/utils/__tests__/priority.test.ts` (4), `src/lib/__tests__/format.test.ts` (5) | `make unit-test` | **9/9 PASS** |
| **Tổng hợp bộ Unit & Integration Test** | **14 tệp kiểm thử (`12` tệp Backend `65/65` + `2` tệp Frontend `9/9`) phủ đủ 7 bước SDLC** | `make unit-test` | **74/74 PASS (100%)** |
| Kiểm tra mã nguồn, đóng gói PWA & cấu hình | `tsc -b`, `eslint`, `prettier --check`, `vite build` + Workbox SW, `tsc`, Compose, `realm-export.json`, `demo-data.json` | `make lint` | **Đạt 100%** |
| Kiểm thử toàn trình 7 bước trên 8 container | [`scripts/test-e2e.sh`](../scripts/test-e2e.sh): Kong, OIDC, `/api/health`, chặn `401` khi thiếu JWT/chữ ký tệp, chặn `403` `/api/internal/*` từ Nginx/Kong, MinIO, PWA, Socket.IO, 3 Kestra flows | `make test` | **7/7 bước PASS** |
| Sao lưu & Phục hồi dữ liệu kèm mã băm đối chiếu | [`scripts/backup.sh`](../scripts/backup.sh) + [`scripts/restore.sh`](../scripts/restore.sh) sao lưu đủ 3 CSDL (`postgres`, `kestra`, `kong`) + MinIO, kiểm tra `SHA256SUMS`, `gzip -t`, `tar -tzf` | `make backup` / `make restore` | **Toàn vẹn 100%** |

---

## 4. Cách Xử lý Các Lỗi Thường Gặp

| Hiện tượng gặp phải | Nguyên nhân kỹ thuật | Cách xử lý |
| :--- | :--- | :--- |
| Mở `http://localhost:8000/` hiển thị JSON `404 no Route matched` | Cổng Kong Gateway chỉ chuyển tiếp `/api/*` và `/auth/*`, không phục vụ giao diện web ở đường dẫn gốc `/` | Mở giao diện tại <http://localhost:3000> hoặc kiểm tra Kong tại <http://localhost:8000/api/health> |
| Truy cập qua IP mạng LAN (`http://192.168.x.x:3000`) không đăng nhập được Keycloak | Trình duyệt chỉ cho phép Web Crypto PKCE `S256` hoạt động trên `localhost` hoặc kết nối `https://` | Dùng `http://localhost:3000` trên máy cục bộ hoặc chạy `bash scripts/internet-demo.sh` để truy cập qua `https://` |
| Báo lỗi trùng cổng `3000`, `4000`, `5432`, `8000`, `8080`, `8085`, `9000` | Có phần mềm khác trên máy đang sử dụng một trong các cổng này | Tắt tiến trình đang chiếm cổng hoặc đổi cổng ánh xạ bên ngoài trong [`docker-compose.yml`](../docker-compose.yml) rồi chạy lại `make build` |
| Máy chạy thử chưa cài đặt Ollama | Địa chỉ `OLLAMA_URL` không có dịch vụ lắng nghe hoặc máy không có card đồ họa | Hệ thống vẫn hoạt động bình thường: `AiTriageService` tự động chuyển sang bộ phân tích từ khóa tiếng Việt nội bộ (`< 5ms`) |
| Cần kiểm tra trạng thái và nhật ký của từng container | Muốn theo dõi quá trình khởi động của `backend`, `keycloak` hoặc `kestra` | Chạy `make ps` và `make logs SERVICE=backend` (hoặc `kestra`, `keycloak`, `kong`) |
