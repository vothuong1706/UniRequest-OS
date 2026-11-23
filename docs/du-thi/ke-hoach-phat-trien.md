# Quá trình Nghiên cứu & Kế hoạch Phát triển Dự án - UniRequest-OS

Tài liệu này trình bày quá trình nhóm sinh viên nghiên cứu, xây dựng và hoàn thiện dự án **UniRequest-OS: Nền tảng Quản lý Yêu cầu Đại học (Student Request Management)** qua từng phiên bản, cách phân chia hạng mục ưu tiên và định hướng phát triển tiếp theo.

---

## 1. Quá trình Phát triển qua các Giai đoạn (`v0.1.0` -> `v1.0.0`)

| Giai đoạn | Phiên bản | Mục tiêu nghiên cứu & Các hạng mục nhóm đã hoàn thành | Kết quả kiểm chứng |
| :--- | :---: | :--- | :--- |
| **Giai đoạn 0: Khởi tạo môi trường & Dựng khung kho mã nguồn** | `v0.1.0` | - Khởi tạo cấu trúc thư mục thực tế của dự án (`apps/`, `config/`, `scripts/`, `docs/`).<br>- Cấu hình môi trường WSL2 (Ubuntu) chạy Docker Engine & Docker Compose.<br>- Dựng thành công Docker Compose cơ bản với `PostgreSQL 16` và `Keycloak 26.0` (quản lý định danh người dùng trong Realm `unirequest`).<br>- Thiết kế lược đồ cơ sở dữ liệu ban đầu cho bảng `requests` và `request_audit_logs` trong `config/postgres/init/`. | Chạy đồng bộ container bằng `docker compose up -d`, kết nối và xác minh lược đồ DB thành công. |
| **Giai đoạn 1: Tích hợp Định danh & Cổng giao tiếp** | `v0.2.0` | - Cấu hình `Keycloak` (`config/keycloak/realm-export.json` gồm Realm, Client `unirequest-portal`, Roles: `sinhvien`, `giangvien`, `canbo`, `admin` và cây nhóm phòng ban).<br>- Thiết lập `Kong Gateway` (`kong-setup.sh`) định tuyến `/auth/*`, `/api/*`, bật `rate-limiting` và `X-Correlation-ID`.<br>- Khởi tạo dự án Frontend `React (Vite)` trong `apps/demo-app/` và tích hợp `keycloak-js` (`PKCE S256`). | Đăng nhập thành công qua SSO, Express (`auth-middleware.ts`) xác minh chữ ký JWT `RS256` đi qua Kong Gateway. |
| **Giai đoạn 2: Dịch vụ lưu trữ & API cốt lõi** | `v0.3.0` | - Thiết lập `MinIO / pgsty/silo` (S3) làm dịch vụ lưu trữ file đính kèm.<br>- Xây dựng `Express API` trong `apps/backend-api/` cung cấp các endpoint CRUD cho yêu cầu và danh mục.<br>- Xử lý tải file đính kèm qua `/api/upload` và lưu siêu dữ liệu vào PostgreSQL. | Tạo yêu cầu và tải tệp minh chứng thành công lên MinIO. |
| **Giai đoạn 3: Giao diện PWA & Luồng xử lý nghiệp vụ** | `v0.4.0` | - Thiết kế và hiện thực hóa vòng đời trạng thái yêu cầu (*PENDING -> APPROVED / REJECTED*) tại Backend kèm nhật ký kiểm toán `request_audit_logs`.<br>- Hoàn thiện giao diện `React PWA` (Tailwind CSS v4): Dashboard thống kê, Form tạo yêu cầu, Màn hình duyệt dành cho cán bộ/giảng viên. | Luồng nghiệp vụ E2E cơ bản từ sinh viên gửi đơn tới cán bộ duyệt hoạt động ổn định. |
| **Giai đoạn 4: Đóng gói Multi-stage & Tự động hóa DevOps** | `v0.5.0` | - Tối ưu hóa `Dockerfile` (multi-stage build `node:20-alpine` & `nginx:alpine`) cho `apps/backend-api` và `apps/demo-app`.<br>- Chuẩn hóa tệp `.env.example`, `Makefile` (`make env`, `make build`, `make test`) và tài liệu cài đặt `README.md`. | Hệ thống khởi chạy 1-lệnh từ mã nguồn trên máy sạch. |
| **Giai đoạn 5: Giao tiếp trực tiếp & Thông báo đa kênh** | `v0.6.0` | - Tích hợp bình luận trao đổi 2 chiều (`request_comments`), thông báo trực tiếp qua Socket.IO đi qua Kong (`/api/socket.io`) và thông báo đẩy Web Push VAPID (`push_subscriptions`). | Phản hồi trực tiếp cross-tab giữa sinh viên và cán bộ không cần tải lại trang. |
| **Giai đoạn 6: Đồng bộ phòng ban động & tự động hóa Kestra** | `v0.7.0` | - Đồng bộ cây nhóm phòng ban động từ Keycloak Admin API (`GET /api/departments`), phân quyền dữ liệu theo 3 phạm vi (`ALL`, `DEPARTMENT`, `PERSONAL`).<br>- Tách danh mục loại yêu cầu riêng cho từng phòng ban (`request_categories`) và xóa đơn độc lập ở 2 phía (`hidden_by_sender` / `hidden_by_receiver`).<br>- Triển khai **Kestra OSS (`Apache-2.0`)** với 3 quy trình YAML (`unirequest-lifecycle`, `unirequest-sla-watchdog`, `unirequest-daily-report`) thay vì các công cụ không chuẩn OSI.<br>- Đồng bộ múi giờ `Asia/Ho_Chi_Minh (+07:00)` xuyên suốt toàn hệ thống. | Hoàn thành các bài unit test cho phân quyền phòng ban, danh mục, xóa độc lập 2 phía và callback Kestra. |
| **Giai đoạn 7: Gợi ý AI `[I]`, bảo vệ dữ liệu & kiểm thử 7 bước SDLC** | `v0.9.0` | - Xây dựng module gợi ý phân loại yêu cầu bằng AI (`POST /api/requests/ai-suggest`) kết hợp mô hình **Ollama nội bộ** và **bộ phân tích từ khóa tiếng Việt** (`< 5ms`).<br>- Kiểm tra chữ ký file thật (`Magic Bytes`) trong bộ nhớ trước khi lưu lên MinIO để chặn file thực thi đổi đuôi.<br>- Lưu lịch sử xử lý kèm mã băm `SHA-256` nối tiếp (`prev_hash -> entry_hash`) và kiểm tra tính toàn vẹn qua `verifyAuditChain()`.<br>- Cấu hình Nginx Same-Origin Proxy, Caddyfile HTTPS và cặp lệnh `make backup` / `make restore` (`MODE=apply`) kèm đối chiếu `SHA256SUMS`. | `make lint` đạt **100%**, `make test` đạt **`7/7` bước E2E PASS**, hoàn thiện hồ sơ 7 bước SDLC (`docs/research/`). |
| **Giai đoạn 8: Trợ lý AI v3.0, Gmail SMTP, Tối ưu UX/Bảo mật & Chuẩn hóa FOSS** | `v1.0.0` | - Xây dựng trang **Trợ lý AI v3.0** (`Ultra-Lean JSON-Schema Enum Router` trên `qwen2.5:3b`, `34/34` Live Eval PASS TB `352ms`, cấu hình ngoài `config/ai/assistant-config.json`), đồng bộ nhãn lớp `sender_group` động từ Keycloak (`K11A1`, `k11A2`, `K11A3`...), khóa nhất quán Loại yêu cầu <-> Phòng ban, khóa mục Trao đổi chống spam chỉ mở khi `APPROVED` và tối ưu bảng `Quản lý & Phê duyệt` gọn 1 dòng + `...` đồng bộ chế độ Gom nhóm.<br>- Tích hợp **Gmail SMTP** (`nodemailer`) cho Kestra SLA Watchdog (tự tra email cán bộ theo Ban từ Keycloak) và Kestra Daily Report 17:30, tự bỏ qua an toàn khi chạy offline.<br>- Xây dựng **Seed Data idempotent** đọc từ [`config/seed/demo-data.json`](../../config/seed/demo-data.json) (`make seed`, 15 danh mục, 18 yêu cầu, `SHA-256` 18/18); bảo mật MinIO Private + HMAC Signed URL, chặn `/api/internal/*` (`403`), `helmet()`, CORS allowlist, `USER node`, tối ưu RAM `~2.2 GiB`.<br>- Hoàn thiện chuẩn FOSS: `SPDX-License-Identifier: Apache-2.0` trên **115** tệp `.ts/.tsx`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, đồng bộ version `1.0.0`. | `make unit-test` đạt **`107/107` PASS (100%)**, Live AI Eval đạt **`34/34` PASS (`352ms`)**, `make lint` đạt **100%**, `make test` đạt **`7/7` bước E2E PASS**. |

---

## 2. Phân chia Hạng mục Ưu tiên trong Phiên bản `v1.0.0`

Nhóm sắp xếp các tính năng theo thứ tự ưu tiên để đảm bảo hệ thống vừa giải quyết trọn vẹn bài toán thực tế tại trường đại học, vừa chạy ổn định trên máy tính có cấu hình từ `4 GB` RAM:

1. **Nhóm tính năng bắt buộc phải có (Đã hoàn thành 100%):**
   - Đăng nhập tập trung qua Keycloak SSO (`PKCE S256`, xác thực JWT `RS256`).
   - Đồng bộ phòng ban động từ cây nhóm Keycloak (`/api/departments`) và phân quyền 3 phạm vi (`ALL`, `DEPARTMENT`, `PERSONAL`).
   - Quản lý danh mục yêu cầu tách riêng theo từng phòng ban và xóa đơn độc lập ở 2 phía người gửi / người nhận.
   - Điều phối 3 quy trình tự động trên Kestra (`unirequest.dxos`).
   - Lưu lịch sử xử lý kèm mã băm `SHA-256` và kiểm tra chữ ký file thật (`Magic Bytes`) trong bộ nhớ trước khi lưu lên MinIO.
   - Thông báo trực tiếp qua Socket.IO và Web Push VAPID theo đúng phòng ban.
2. **Nhóm tính năng nâng cao trải nghiệm & vận hành (Đã hoàn thành 100%):**
   - Gợi ý phân loại yêu cầu bằng AI `[I]` (kết hợp Ollama nội bộ và bộ phân tích từ khóa tiếng Việt `< 5ms`) kèm thẻ tóm tắt yêu cầu cho cán bộ.
   - Bảng thống kê số liệu 7 ngày theo múi giờ `+07:00`.
   - Hỗ trợ truy cập thử nghiệm qua Internet HTTPS bằng Nginx Same-Origin Proxy, Cloudflare Quick Tunnel và Caddy.
   - Sao lưu và phục hồi đủ 3 cơ sở dữ liệu (`postgres`, `kestra`, `kong`) + MinIO kèm kiểm tra mã băm `SHA256SUMS`.
3. **Nhóm tính năng định hướng mở rộng tiếp theo (Chưa bật mặc định trong `v1.0.0`):**
   - Xem chi tiết tại Mục 3 dưới đây.

---

## 3. Định hướng Phát triển Tiếp theo

Sau phiên bản `v1.0.0`, nhóm đề xuất 3 hướng nghiên cứu mở rộng để phục vụ quy mô triển khai lớn hơn tại các trường đại học:

- **Kho dữ liệu thống kê nhiều năm học (Lakehouse):** Kết hợp thêm `Redpanda`, `Apache Iceberg` và `Trino/DuckDB` để đồng bộ dữ liệu yêu cầu qua nhiều năm học phục vụ phân tích xu hướng cho nhà trường mà không ảnh hưởng tốc độ xử lý của PostgreSQL hằng ngày.
- **Trợ lý AI tra cứu văn bản quy chế nhà trường (RAG + Qdrant):** Tích hợp cơ sở dữ liệu vector `Qdrant` để nạp sổ tay sinh viên và các văn bản quy định học vụ PDF, giúp hệ thống trích dẫn đúng điều khoản quy chế khi hướng dẫn sinh viên tạo đơn hoặc gợi ý nội dung phản hồi cho cán bộ.
- **Tăng cường bảo mật tài khoản & giám sát máy chủ:** Bổ sung xác thực hai lớp (`WebAuthn/TOTP`) cho tài khoản cán bộ và quản trị viên trên Keycloak, tự động sinh tài liệu OpenAPI/Swagger từ Backend và bổ sung bảng theo dõi tài nguyên bằng `Prometheus + Grafana`.

> Xem thêm: [Bảng tự rà soát 6 tiêu chí PMNM](pof-checklist.md) · [Tổng quan quy trình nghiên cứu 7 bước SDLC](../research/README.md) · [Hỏi - Đáp với Hội đồng](hoi-dap-hoi-dong.md).
