# Thiết kế Kiến trúc, Cơ sở Dữ liệu & Công nghệ Nguồn mở - UniRequest-OS

Tài liệu này trình bày thiết kế kiến trúc 3 tầng DX-OS của dự án **UniRequest-OS: Nền tảng Quản lý Yêu cầu Đại học (Student Request Management)** phiên bản `v1.0.0`, cấu trúc 7 bảng PostgreSQL 16 kèm mã băm lịch sử `SHA-256`, cơ chế kiểm tra file tải lên, phân quyền 3 phạm vi theo nhóm Keycloak, danh mục công nghệ nguồn mở và 5 quyết định thiết kế của nhóm.

---

## 1. Thiết kế Kiến trúc 3 tầng DX-OS

1. **Kết nối các phần mềm nguồn mở chuẩn thay cho tự viết lại từ đầu:** Nhóm không tự viết lại hệ thống đăng nhập, cổng API, kho lưu trữ đối tượng hay công cụ chạy quy trình, mà kết nối các phần mềm nguồn mở chuẩn OSI thông qua tệp cấu hình và REST API.
2. **Liên kết mạch lạc 4 nhóm chức năng `[H] -> [P] -> [D] -> [I]`:**
   - **`[H]` Quản lý người dùng & tương tác:** Chuẩn hóa tài khoản đăng nhập và nhóm phòng ban từ Keycloak JWT (`RS256`, PKCE `S256`).
   - **`[P]` Định tuyến quy trình:** Sử dụng thông tin tài khoản và cây nhóm phòng ban để phân luồng yêu cầu, kiểm tra dữ liệu đầu vào ở cả giao diện và API, đồng thời điều phối quy trình qua Kestra (`unirequest.dxos`).
   - **`[D]` Lưu trữ & bảo vệ dữ liệu:** Lưu dữ liệu yêu cầu vào PostgreSQL 16 (lưu lịch sử xử lý kèm mã băm `SHA-256` để phát hiện nếu dữ liệu bị sửa trực tiếp trong CSDL) và kiểm tra chữ ký file thật (`Magic Bytes`) trong bộ nhớ trước khi lưu lên MinIO để chặn file thực thi đổi đuôi.
   - **`[I]` Trợ lý AI v3.0 & Hỗ trợ phân loại:** Trang **Trợ lý AI** (`POST /api/ai/assistant`) dùng **Ultra-Lean JSON-Schema Enum Router** trên `Ollama qwen2.5:3b` (`~352ms`/lượt) kết hợp **Hybrid Catalog** từ 5 Phòng ban & danh mục thật, cấu hình ngoài tại [`config/ai/assistant-config.json`](../config/ai/assistant-config.json), chống Prompt Injection, bảo vệ Zero Information Disclosure và đồng nhất 100% với bộ dự phòng khi chạy offline.

### Ranh giới 3 tầng & Cổng giao tiếp

| Tầng kiến trúc | Thành phần trong kho mã nguồn | Vai trò & Ranh giới |
| :--- | :--- | :--- |
| **Tầng 1: Hạ tầng dịch vụ lõi** *(Headless Core)* | `keycloak`, `kong` + `kong-db`, `kestra`, `postgres`, `minio` (`pgsty/silo`), `caddy` *(profile `internet`)* | Hạ tầng dùng chung không chứa giao diện nghiệp vụ riêng; chạy bằng Docker image chính thức trong [`docker-compose.yml`](../docker-compose.yml). |
| **Tầng 2: Các module nghiệp vụ `H-P-D-I`** | Xác thực JWT/Group, Định tuyến phòng ban & Xóa độc lập 2 phía, Kiểm tra `Magic Bytes` & Lịch sử `SHA-256`, `AiTriageService`, Socket.IO & Web Push VAPID | Lớp dịch vụ dùng chung được nhóm lập trình trong `apps/backend-api/src/services/`, `middlewares/` và `utils/`. |
| **Tầng 3: Ứng dụng Cổng Quản lý Yêu cầu** | `apps/demo-app` (React 19 PWA + Nginx Same-Origin) & `apps/backend-api` REST routes | Giao diện Cổng Quản lý Yêu cầu Đại học (`:3000`) gọi các API `/api/*` và `/auth/*` thông qua cổng Kong Gateway (`:8000`). |

> Xem sơ đồ kiến trúc tại [`images/architecture.png`](images/architecture.png) ([bản SVG động](images/architecture-animated.svg)) và bộ 6 sơ đồ UML 2.x tại [`uml.md`](uml.md).

---

## 2. Thiết kế Cơ sở Dữ liệu PostgreSQL 16 (7 bảng) & Bảo vệ Dữ liệu

Cơ sở dữ liệu được khởi tạo tự động thông qua chuỗi **13 tệp SQL** trong [`config/postgres/init/`](../config/postgres/init) (`01`..`13`), đồng bộ 100% với [`apps/backend-api/db/init.sql`](../apps/backend-api/db/init.sql) và hàm `ensureTablesExist()` trong `apps/backend-api/src/config/database.ts`.

| Tên bảng | Khóa chính & Quan hệ | Chức năng trong hệ thống |
| :--- | :--- | :--- |
| `requests` | `id UUID` | Lưu thông tin yêu cầu (`target_department`, `sender_group` đồng bộ lớp từ Keycloak, `priority`, `status`, `workflow_execution_id`, hai cờ `hidden_by_sender` / `hidden_by_receiver`) |
| `request_audit_logs` | `id UUID`, `FK request_id -> requests` | Lưu lịch sử xử lý kèm `prev_hash` -> `entry_hash` (`SHA-256`) và hỗ trợ kiểm tra tránh gửi cảnh báo `SLA_WARNING` lặp lại trong 6 giờ |
| `request_categories` | `id UUID`, `code UNIQUE` | Danh mục loại yêu cầu tách riêng theo từng `department`, cờ `requires_evidence` và thời hạn `sla_hours` |
| `request_comments` | `id UUID`, `FK request_id -> requests` | Lưu nội dung trao đổi bình luận 2 chiều (khóa chống spam: chỉ mở khi đơn đạt trạng thái `APPROVED`, chặn `403` ở `PENDING`/`REJECTED`) |
| `notifications` | `id UUID`, `FK request_id -> requests` | Thông báo gửi theo đúng phòng ban (`recipient_department`) và vai trò người nhận |
| `notification_reads` | `PK (notification_id, username)` | Lưu trạng thái đã đọc (`is_read`) và đã ẩn (`is_hidden`) riêng cho từng tài khoản trong cùng phòng ban |
| `push_subscriptions` | `id UUID`, `endpoint UNIQUE` | Lưu thông tin đăng ký Web Push VAPID kèm mảng `groups TEXT[]` để gửi thông báo đẩy đúng phòng ban |

### Cơ chế lưu mã băm lịch sử SHA-256 & Kiểm tra chữ ký file tải lên
- **Lưu lịch sử xử lý kèm mã băm `SHA-256` ([`audit-hash-chain.ts`](../apps/backend-api/src/utils/audit-hash-chain.ts)):** Mỗi bản ghi mới trong `request_audit_logs` được nối tiếp từ `GENESIS` theo công thức `SHA-256(prev_hash | request_id | actor | action | to_status | note | epoch_sec)`. Khi người dùng xem chi tiết yêu cầu qua `GET /api/requests/:id`, hàm `verifyAuditChain()` tính toán lại toàn bộ chuỗi mã băm để phát hiện nếu dữ liệu bị sửa trực tiếp trong CSDL.
- **Kiểm tra chữ ký file thật `Magic Bytes` ([`file-security.ts`](../apps/backend-api/src/utils/file-security.ts)):** Hệ thống chặn danh sách phần mở rộng file thực thi hoặc mã kịch bản (`.exe`, `.sh`, `.bat`, `.svg`, `.html`, `.js`...) và đọc chữ ký nhị phân đầu file ngay trong bộ nhớ `Buffer` trước khi gọi `minioClient.putObject()`. File giả mạo (ví dụ file `.exe` đổi tên thành `.png`) sẽ bị từ chối với mã lỗi HTTP `400 UNSUPPORTED_OR_SPOOFED_FILE`.

---

## 3. Phân quyền 3 Phạm vi theo Nhóm Keycloak & Xóa đơn độc lập 2 phía

Hàm `resolveRequestAccessScope()` trong [`request-service.ts`](../apps/backend-api/src/services/request-service.ts) đọc thông tin từ JWT token (`roles` và `groups` được cấu hình `full.path: true` trên Keycloak):
- **`ALL` (Toàn trường):** Tài khoản có vai trò `admin`, hoặc `canbo`/`giangvien` không gắn vào nhóm phòng ban cụ thể.
- **`DEPARTMENT` (Theo phòng ban):** Tài khoản `canbo`/`giangvien` thuộc một nhóm phòng ban (như `/CTSV`, `/KETOAN`); hệ thống khớp đệ quy cả các nhóm con bên trong và chặn truy cập chéo sang đơn của phòng ban khác.
- **`PERSONAL` (Cá nhân sinh viên):** Tài khoản `sinhvien` (dù thuộc nhóm lớp `/Lớp/K11A1` hay `/Lớp/k11A2`) luôn chỉ nhìn thấy và thao tác trên các yêu cầu do chính mình gửi.
- **Xóa đơn độc lập ở 2 phía:** Khi sinh viên xóa đơn trong mục *Lịch sử*, hệ thống chỉ bật cờ `hidden_by_sender = TRUE`; khi cán bộ xóa đơn trong *Hàng đợi phòng ban*, hệ thống chỉ bật cờ `hidden_by_receiver = TRUE`. Bản ghi chỉ bị xóa hoàn toàn khỏi bảng `requests` khi cả hai phía đều đã bấm xóa (`hidden_by_sender AND hidden_by_receiver`).

---

## 4. Danh mục Công nghệ Nguồn mở & Chính sách Giấy phép OSI

Dự án **UniRequest-OS: Nền tảng Quản lý Yêu cầu Đại học (Student Request Management)** phát hành toàn bộ mã nguồn do nhóm viết theo giấy phép **[`Apache License 2.0`](../LICENSE)** kèm tệp [`NOTICE`](../NOTICE), không đưa `node_modules/` hay `vendor/` lên kho Git và chỉ cấu hình các dịch vụ qua `.env`, `realm-export.json`, `kong-setup.sh`, `config/kestra/flows/*.yml`:

| Thành phần | Docker Image / Thư viện | Giấy phép OSI | Cách tích hợp trong dự án |
| :--- | :--- | :---: | :--- |
| **Keycloak** | `quay.io/keycloak/keycloak:26.0` | `Apache-2.0` | Dùng image gốc + tự động nạp realm từ `config/keycloak/realm-export.json` |
| **Kong Gateway** | `kong:3.7.1` | `Apache-2.0` | Dùng image gốc + script khởi tạo route và plugin [`kong-setup.sh`](../kong-setup.sh) |
| **Kestra OSS** | `kestra/kestra:v2.0.11` | `Apache-2.0` | Dùng image ổn định cố định + 3 quy trình YAML đồng bộ qua `scripts/kestra-setup.sh` |
| **Caddy** | `caddy:2-alpine` | `Apache-2.0` | Chạy theo profile `internet`, cấp chứng chỉ HTTPS tự động từ `config/caddy/Caddyfile` |
| **PostgreSQL** | `postgres:16-alpine` | `PostgreSQL` | Dùng image gốc + 13 tệp SQL khởi tạo schema `01..13` (`sender_group`, `request_embeddings`, chuỗi `SHA-256`) & nạp dữ liệu mẫu từ `config/seed/demo-data.json` |
| **MinIO / Silo S3** | `pgsty/silo:RELEASE.2026-11-12T00-00-00Z` | `AGPL-3.0-or-later` | Chạy container độc lập (bucket Private + HMAC Signed URL), giao tiếp hoàn toàn qua giao thức S3 HTTP API nên không xung đột `Apache-2.0` |
| **Frontend / Backend** | React 19, Vite 8, Express, Socket.IO, Lucide | `MIT` / `ISC` | Đóng gói trong `apps/` bằng `Dockerfile` multi-stage `node:20-alpine` & `nginx:alpine` |

---

## 5. Năm Quyết định Thiết kế của Nhóm (ADR)

| Mã | Quyết định thiết kế | Lý do lựa chọn & Hiệu quả thực tế |
| :---: | :--- | :--- |
| **QĐ-001** | Chọn **Kestra OSS (`Apache-2.0`)** thay vì n8n | n8n sử dụng *Sustainable Use License* (không phải giấy phép nguồn mở chuẩn OSI); Kestra khai báo quy trình hoàn toàn bằng tệp YAML, dễ quản lý trên Git và dùng chung PostgreSQL. |
| **QĐ-002** | Đồng bộ phòng ban động từ **Keycloak Group Tree API** | Không cần ghi cứng danh sách phòng ban trong code; quản trị viên thêm nhóm phòng ban trên Keycloak Console là giao diện cổng tự động cập nhật qua `GET /api/departments`. |
| **QĐ-003** | **Nginx Same-Origin Proxy** (`/api`, `/auth`, `/api/upload/files`) | Giúp cả giao diện, đăng nhập Keycloak, API, Socket.IO và ảnh đính kèm đi qua cùng một địa chỉ trang web, tránh lỗi CORS và lỗi Web Crypto PKCE `S256` khi mở qua HTTPS trên điện thoại. |
| **QĐ-004** | **Kết hợp Ollama và Bộ phân tích từ khóa tiếng Việt** | Tận dụng được mô hình ngôn ngữ `qwen2.5:3b` khi máy chủ có cài Ollama, đồng thời vẫn phản hồi tức thì (`< 5ms`) trên máy chấm thi không có GPU nhờ bộ phân tích tiếng Việt nội bộ. |
| **QĐ-005** | **Nối mã băm `SHA-256`** ngay trên bảng PostgreSQL | Tiết kiệm bộ nhớ RAM (toàn hệ thống chạy tốt từ `4 GB` RAM) mà vẫn kiểm tra và phát hiện được việc sửa đổi dữ liệu lịch sử xử lý qua hàm `verifyAuditChain()`. |
