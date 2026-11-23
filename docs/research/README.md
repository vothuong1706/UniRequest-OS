# Tổng quan Quy trình Nghiên cứu & Phát triển Phần mềm 7 Bước SDLC - UniRequest-OS

Tài liệu này tổng hợp quá trình nhóm sinh viên nghiên cứu, thiết kế kiến trúc, lập trình từng module và kiểm thử thực tế cho dự án **UniRequest-OS: Nền tảng Quản lý Yêu cầu Đại học (Student Request Management)** phiên bản `v1.0.0` theo quy trình phát triển phần mềm 7 bước (SDLC).

---

## 1. Định vị Bài toán Thực tế: Ai dùng - Dùng cái gì - Dùng như thế nào

Mục tiêu của **UniRequest-OS: Nền tảng Quản lý Yêu cầu Đại học (Student Request Management)** là khắc phục tình trạng tiếp nhận đơn từ rời rạc qua giấy tờ, email hoặc tin nhắn nhóm tại trường đại học bằng một nền tảng quản lý yêu cầu tập trung vận hành trên hạ tầng phần mềm nguồn mở 3 tầng:

| Ai dùng? (Nhóm người dùng) | Dùng cái gì? (Phân hệ trên hệ thống) | Dùng như thế nào? (Luồng thao tác thực tế) | Kết quả nghiệm thu |
| :--- | :--- | :--- | :--- |
| **Sinh viên** (`sinhvien`) | **Cổng Sinh viên** (`React 19 PWA` trên máy tính và điện thoại) | Đăng nhập SSO Keycloak (`PKCE S256`) → Nhập tiêu đề và bấm **Gợi ý phân tuyến AI `[I]`** → Tải file minh chứng (được kiểm tra chữ ký file thật `Magic Bytes` trong bộ nhớ trước khi lưu lên MinIO để chặn file thực thi đổi đuôi) → Theo dõi trạng thái trực tiếp, trao đổi bình luận 2 chiều & xóa lịch sử cá nhân độc lập. | Tách biệt phạm vi `PERSONAL` giữa `/Lớp/K11A1` và `/Lớp/k11A2` (`8/8` bài test phân quyền PASS). |
| **Cán bộ / Giảng viên** (`canbo`, `giangvien`) | **Cổng Điều hành Phòng ban** (`CTSV`, `KETOAN`, `DAOTAO`, `CSVC`...) | Nhận thông báo Socket.IO & Web Push VAPID theo đúng phòng ban → Xem thẻ tóm tắt yêu cầu từ AI (`ai_insight`) & kiểm tra lịch sử xử lý kèm mã băm `SHA-256` (`audit_integrity`) → Phê duyệt hoặc Từ chối đơn & tự quản lý danh mục thủ tục riêng của phòng ban. | Tách biệt phạm vi `DEPARTMENT` (hỗ trợ đệ quy nhóm con), chặn truy cập chéo phòng ban (`403 Forbidden`). |
| **Quản trị viên & Nhà trường** (`admin`) | **Keycloak Console, Kestra UI & Bảng thống kê `[D]`** | Quản lý cây nhóm phòng ban trên Keycloak (giao diện cổng tự đồng bộ qua `GET /api/departments`), theo dõi 3 quy trình tự động trên Kestra (`unirequest.dxos`), xem thống kê 7 ngày (`+07:00`), xuất báo cáo CSV cuối mỗi ngày lên MinIO & sao lưu kèm `SHA256SUMS`. | Khởi chạy từ mã nguồn bằng lệnh `make build`, `make test` (`7/7` bước E2E), `make backup`/`restore` toàn vẹn 100%. |

---

## 2. Quy trình Nghiên cứu & Phát triển 7 Bước SDLC của Nhóm

Nhóm chia quá trình phát triển thành **7 bước nối tiếp nhau** (mỗi bước có tài liệu đặc tả và bộ bài kiểm thử tự động tương ứng):

| Bước SDLC | Tài liệu nghiên cứu chi tiết | Nội dung thực hiện trong dự án UniRequest-OS | Tệp kiểm thử tự động (`make unit-test`) |
| :--- | :--- | :--- | :--- |
| **Bước 1: Phân tích yêu cầu** | [`01-phan-tich-yeu-cau.md`](01-phan-tich-yeu-cau.md) | Phân tích bài toán tại trường đại học, bảng **Ai dùng - Dùng cái gì - Dùng như thế nào**, yêu cầu chức năng (FR), phi chức năng (NFR), kịch bản `Given/When/Then` và giấy phép `Apache-2.0`. | [`sdlc-compliance-hygiene.test.ts`](../../apps/backend-api/tests/sdlc-compliance-hygiene.test.ts) (`8/8` PASS) |
| **Bước 2: Thiết kế kiến trúc** | [`02-thiet-ke-kien-truc.md`](02-thiet-ke-kien-truc.md) | Thiết kế kiến trúc 3 tầng DX-OS, phân rã module Backend/Frontend, thiết kế 7 bảng PostgreSQL 16, quy ước REST API & bảng mã lỗi, 5 quyết định thiết kế. | [`sdlc-compliance-hygiene.test.ts`](../../apps/backend-api/tests/sdlc-compliance-hygiene.test.ts) (Kiểm tra 7 bảng SQL, 3 Kestra YAML & dữ liệu mẫu JSON) |
| **Bước 3: Lập trình từng module** | [`03-lap-trinh-tung-module.md`](03-lap-trinh-tung-module.md) | Quy chuẩn lập trình sạch, quản lý biến môi trường (`.env.example` đồng bộ `docker-compose.yml` và `environment.ts`), dữ liệu mẫu tách ngoài `config/seed/demo-data.json`, cơ chế dự phòng khi Kestra/Ollama chưa bật. | [`seed-demo-data.test.ts`](../../apps/backend-api/tests/seed-demo-data.test.ts) (`5/5`), [`priority.test.ts`](../../apps/demo-app/src/features/requests/utils/__tests__/priority.test.ts) (`4/4`), [`format.test.ts`](../../apps/demo-app/src/lib/__tests__/format.test.ts) (`5/5`) |
| **Bước 4: Kiểm thử đơn vị (Unit Test)** | [`04-unit-test.md`](04-unit-test.md) | Kiểm thử đơn vị theo cấu trúc Arrange-Act-Assert (Happy Path / Edge Case / Error Case) cho phân quyền 3 phạm vi, danh mục phòng ban và xóa đơn độc lập 2 phía. | [`request-scope.test.ts`](../../apps/backend-api/tests/request-scope.test.ts) (`8/8`), [`category-scope.test.ts`](../../apps/backend-api/tests/category-scope.test.ts) (`3/3`), [`independent-delete.test.ts`](../../apps/backend-api/tests/independent-delete.test.ts) (`4/4`) |
| **Bước 5: Rà soát & Kiểm thử tích hợp** | [`05-review-kiem-thu.md`](05-review-kiem-thu.md) | Rà soát mã nguồn (`make lint`), kiểm thử dữ liệu đầu vào ở API `RequestController`, callback Kestra cảnh báo SLA và bộ câu mẫu tiếng Việt để kiểm thử gợi ý của AI `[I]`. | [`request-controller-acceptance.test.ts`](../../apps/backend-api/tests/request-controller-acceptance.test.ts) (`8/8`), [`ai-triage.test.ts`](../../apps/backend-api/tests/ai-triage.test.ts) (`6/6`), [`internal-kestra-routes.test.ts`](../../apps/backend-api/tests/internal-kestra-routes.test.ts) (`5/5`) |
| **Bước 6: Kiểm tra an toàn thông tin** | [`06-kiem-tra-bao-mat.md`](06-kiem-tra-bao-mat.md) | Kiểm tra 11 hạng mục bảo mật: Kong Rate-Limit & chặn `/api/internal/*` không phân biệt hoa/thường (`403`), Express (`auth-middleware.ts`) xác minh JWT `RS256` JWKS, CORS allowlist cả Express & Socket.IO, chống IDOR chéo phòng ban, chặn Stored XSS `attachment_url`, MinIO Private + chữ ký HMAC, kiểm tra `Magic Bytes`, lịch sử `SHA-256`, giới hạn đầu ra AI. | [`security-owasp-audit.test.ts`](../../apps/backend-api/tests/security-owasp-audit.test.ts) (`7/7`), [`attachment-signing.test.ts`](../../apps/backend-api/tests/attachment-signing.test.ts) (`4/4`), [`file-security.test.ts`](../../apps/backend-api/tests/file-security.test.ts) (`4/4`), [`audit-hash-chain.test.ts`](../../apps/backend-api/tests/audit-hash-chain.test.ts) (`3/3`) |
| **Bước 7: Đóng gói & Bàn giao** | [`07-dong-goi-ban-giao.md`](07-dong-goi-ban-giao.md) | Đóng gói Docker Compose khởi chạy bằng 1 lệnh (`kestra:v2.0.11`, `pgsty/silo:RELEASE.2026-11-12T00-00-00Z`), dữ liệu mẫu `make seed`, sao lưu/phục hồi kèm `SHA256SUMS` và kiểm thử toàn trình E2E 7 bước. | `make unit-test` (**`74/74` PASS**), `make lint` (**100%**), `make test` (**`7/7` E2E PASS**) |

---

## 3. Bảng Tổng kết Bộ 74 Bài Kiểm thử Tự động (`make unit-test`)

Chạy lệnh `make unit-test` sẽ thực thi toàn bộ **14 tệp kiểm thử tự động (74 bài test)** mà không cần bật Docker, hoàn tất trong chưa đầy 2 giây:

| Tệp kiểm thử | Bước SDLC | Số bài test | Nội dung kiểm tra chính | Kết quả |
| :--- | :---: | :---: | :--- | :---: |
| `apps/backend-api/tests/sdlc-compliance-hygiene.test.ts` | Bước 1, 2, 3, 7 | **8** | Giấy phép `Apache-2.0`, `NOTICE`/`CHANGELOG`/`CONTRIBUTING`/`SECURITY`, SPDX 98 tệp, liên kết Markdown, `realm-export.json`, 3 Kestra flows, 7 bảng SQL, zero-hardcode `.env` & 12 ảnh | **8/8 PASS** |
| `apps/backend-api/tests/seed-demo-data.test.ts` | Bước 3, 7 | **5** | Tệp dữ liệu mẫu ngoài `config/seed/demo-data.json` (15 danh mục, 18 yêu cầu 7 ngày, 2 đơn quá hạn SLA), `verifyAuditChain` hợp lệ 100% & idempotency | **5/5 PASS** |
| `apps/backend-api/tests/attachment-signing.test.ts` | Bước 6 | **4** | Chữ ký HMAC ngắn hạn cho tệp MinIO Private, chặn hết hạn/giả mạo, chặn `401` khi thiếu chữ ký/JWT & cho phép `200` khi hợp lệ | **4/4 PASS** |
| `apps/backend-api/tests/request-scope.test.ts` | Bước 4 | **8** | Phân giải 3 phạm vi `ALL`, `DEPARTMENT` (đệ quy nhóm con), `PERSONAL` | **8/8 PASS** |
| `apps/backend-api/tests/category-scope.test.ts` | Bước 4 | **3** | Phân quyền tạo/sửa/xóa danh mục riêng theo từng phòng ban | **3/3 PASS** |
| `apps/backend-api/tests/independent-delete.test.ts` | Bước 4 | **4** | Xóa đơn độc lập 2 phía (`hidden_by_sender` / `hidden_by_receiver`) & tự dọn CSDL | **4/4 PASS** |
| `apps/backend-api/tests/request-controller-acceptance.test.ts` | Bước 5 | **8** | Kiểm thử `Given/When/Then` cho kiểm tra dữ liệu đầu vào + bộ câu mẫu tiếng Việt kiểm thử gợi ý AI 5 phòng ban (`< 5ms`) | **8/8 PASS** |
| `apps/backend-api/tests/ai-triage.test.ts` | Bước 5 | **6** | Gợi ý phân loại AI `[I]` (Ollama JSON + dự phòng bộ phân tích từ khóa tiếng Việt) | **6/6 PASS** |
| `apps/backend-api/tests/internal-kestra-routes.test.ts` | Bước 5 | **5** | Callback Kestra cảnh báo SLA, khóa `x-kestra-key` (`timingSafeEqual`) & tránh gửi cảnh báo lặp lại | **5/5 PASS** |
| `apps/backend-api/tests/security-owasp-audit.test.ts` | Bước 6 | **7** | Kiểm tra bảo mật OWASP: JWT `401`, Role `403`, chống IDOR chéo phòng ban, kiểm tra UUID, chặn XSS `attachment_url`, CORS allowlist, giới hạn đầu ra AI & vệ sinh `.env` | **7/7 PASS** |
| `apps/backend-api/tests/file-security.test.ts` | Bước 6 | **4** | Kiểm tra chữ ký file thật (`Magic Bytes`) trong bộ nhớ, chặn `.exe` đổi đuôi `.png` và file `.svg`/`.html` | **4/4 PASS** |
| `apps/backend-api/tests/audit-hash-chain.test.ts` | Bước 6 | **3** | Lưu lịch sử xử lý kèm mã băm `SHA-256` (`GENESIS -> entry_hash`) & phát hiện nếu dữ liệu bị sửa trực tiếp trong CSDL | **3/3 PASS** |
| `apps/demo-app/src/features/requests/utils/__tests__/priority.test.ts` | Bước 3, 4 | **4** | Trích xuất & chuẩn hóa mức độ ưu tiên (`NORMAL`, `HIGH`, `URGENT`) trên giao diện | **4/4 PASS** |
| `apps/demo-app/src/lib/__tests__/format.test.ts` | Bước 3, 4 | **5** | Định dạng thời gian `Asia/Ho_Chi_Minh (+07:00)` & Same-Origin URL Proxy (chặn `javascript:`/`data:`) | **5/5 PASS** |
| **TỔNG CỘNG (`make unit-test`)** | **Phủ đủ 7 bước** | **74 bài test** | **`12` tệp Backend (`65/65`) + `2` tệp Frontend (`9/9`)** | **74/74 (100%)** |
