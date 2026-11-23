# Đặc tả Kiến trúc, Dữ liệu & Chính sách Giấy phép - UniRequest-OS

Tài liệu này mô tả cấu trúc 3 tầng DX-OS của **UniRequest-OS (`v0.9.0`)**, ranh giới giữa Lõi Headless và Ứng dụng, mô hình dữ liệu PostgreSQL 16 kèm sổ cái SHA-256, danh mục thành phần thượng nguồn và các quyết định kiến trúc cốt lõi.

---

## 1. Nguyên tắc & Kiến trúc 3 tầng DX-OS

1. **Điều phối thay cho viết lại:** UniRequest-OS không tự viết lại Identity Provider, API Gateway, Object Storage hay Workflow Engine; dự án kết nối các thành phần nguồn mở chuẩn OSI nguyên bản thông qua cấu hình GitOps và Domain API.
2. **Chuỗi tiến hóa nhân quả `[H] -> [P] -> [D] -> [I]`:**
   - **`[H]` Con người số:** Chuẩn hóa định danh & Group phòng ban ngay từ Keycloak JWT (`RS256`, PKCE `S256`).
   - **`[P]` Quy trình số:** Dùng danh tính và cây Group để định tuyến động, áp ràng buộc 2 lớp (Poka-yoke) và điều phối qua Kestra (`unirequest.dxos`).
   - **`[D]` Dữ liệu thực chứng:** Lưu dữ liệu sạch vào PostgreSQL 16 (nối chuỗi băm `SHA-256`) và tệp qua kiểm dịch Magic Bytes vào MinIO S3.
   - **`[I]` Trí tuệ số:** `AiTriageService` gợi ý phân tuyến trên dữ liệu/danh mục thật; kết quả luôn được đối chiếu lại với Keycloak Group và để con người duyệt cuối.

### Ranh giới 3 tầng & Cổng giao tiếp

| Tầng | Thành phần trong repo | Vai trò & Ranh giới |
| :--- | :--- | :--- |
| **Tầng 1: Lõi không giao diện** *(Headless Core)* | `keycloak`, `kong` + `kong-db`, `kestra`, `postgres`, `minio` (`pgsty/silo`), `caddy` *(profile `internet`)* | Hạ tầng dùng chung không chứa màn hình nghiệp vụ; chạy bằng image thượng nguồn chính thức trong [`docker-compose.yml`](../docker-compose.yml). |
| **Tầng 2: Không gian `H-P-D-I`** | Phân hệ Auth/Group, Routing & 2-sided Soft-Delete, Magic Bytes & Audit `SHA-256`, `AiTriageService`, Socket.IO & Web Push VAPID | Lớp năng lực số hóa dùng chung trong `apps/backend-api/src/services/`, `middlewares/` và `utils/`. |
| **Tầng 3: Ứng dụng Nghiệp vụ** | `apps/demo-app` (React 19 PWA + Nginx Same-Origin) & `apps/backend-api` REST routes | Giao diện Cổng dịch vụ Một cửa Đại học (`:3000`) gọi lõi `/api/*` và `/auth/*` qua Kong Gateway (`:8000`). |

> Xem sơ đồ trực quan tại [`images/architecture.png`](images/architecture.png) ([bản SVG động](images/architecture-animated.svg)) và toàn bộ 6 sơ đồ UML 2.x BCE tại [`uml.md`](uml.md).

---

## 2. Mô hình Dữ liệu PostgreSQL 16 (7 bảng) & Bảo toàn Dữ liệu

Cơ sở dữ liệu khởi tạo idempotent qua chuỗi **11 script SQL** trong [`config/postgres/init/`](../config/postgres/init) (`01`..`11`), đồng bộ 100% với [`apps/backend-api/db/init.sql`](../apps/backend-api/db/init.sql) và `ensureTablesExist()` trong `apps/backend-api/src/config/database.ts`.

| Bảng | Khóa chính & Quan hệ | Chức năng chính |
| :--- | :--- | :--- |
| `requests` | `id UUID` | Yêu cầu sinh viên (`target_department`, `priority`, `status`, `workflow_execution_id`, cờ `hidden_by_sender` / `hidden_by_receiver`) |
| `request_audit_logs` | `id UUID`, `FK request_id -> requests` | Sổ cái lịch sử hành động kèm `prev_hash` -> `entry_hash` (`SHA-256`) và chống lặp `SLA_WARNING` |
| `request_categories` | `id UUID`, `code UNIQUE` | Danh mục yêu cầu tách riêng theo `department`, cờ `requires_evidence` và `sla_hours` |
| `request_comments` | `id UUID`, `FK request_id -> requests` | Trao đổi 2 chiều theo thời gian thực giữa sinh viên và cán bộ Ban |
| `notifications` | `id UUID`, `FK request_id -> requests` | Thông báo tách theo `recipient_department` và vai trò |
| `notification_reads` | `PK (notification_id, username)` | Trạng thái `is_read` / `is_hidden` độc lập cho từng tài khoản trong cùng Ban |
| `push_subscriptions` | `id UUID`, `endpoint UNIQUE` | Đăng ký Web Push VAPID kèm mảng `groups TEXT[]` để bắn push đúng phòng ban |

### Chuỗi băm kiểm toán SHA-256 & Trạm kiểm dịch tệp RAM
- **Sổ cái `SHA-256` ([`audit-hash-chain.ts`](../apps/backend-api/src/utils/audit-hash-chain.ts)):** Mỗi bản ghi mới trong `request_audit_logs` nối từ `GENESIS` theo công thức `SHA-256(prev_hash | request_id | actor | action | to_status | note | epoch_sec)`. Khi gọi `GET /api/requests/:id`, `verifyAuditChain()` kiểm tra lại toàn bộ chuỗi để phát hiện sửa đổi trái phép trực tiếp trên DB.
- **Kiểm dịch `Magic Bytes` ([`file-security.ts`](../apps/backend-api/src/utils/file-security.ts)):** Chặn danh sách đuôi thực thi/script (`.exe`, `.sh`, `.bat`, `.svg`, `.html`, `.js`...) và đọc chữ ký nhị phân ngay trong `Buffer` RAM trước khi gọi `minioClient.putObject()`. Tệp giả mạo (như `.exe` đổi đuôi `.png`) bị từ chối với HTTP `400 UNSUPPORTED_OR_SPOOFED_FILE`.

---

## 3. Phân quyền 3 Phạm vi & Xóa độc lập 2 phía

Hàm `resolveRequestAccessScope()` trong [`request-service.ts`](../apps/backend-api/src/services/request-service.ts) đọc JWT claims (`roles` + `groups` cấu hình `full.path: true` từ Keycloak):
- **`ALL`:** Role `admin`, hoặc `canbo`/`giangvien` không gắn Group.
- **`DEPARTMENT`:** `canbo`/`giangvien` thuộc Group bất kỳ (như `/CTSV`, `/KETOAN`); khớp đệ quy cả Group con bên trong, chặn xem/sửa/xóa chéo Ban.
- **`PERSONAL`:** Role `sinhvien` (kể cả khi thuộc `/Lớp/K11A1` hay `/Lớp/k11A2`) luôn chỉ thấy và xóa đơn do chính mình tạo.
- **Soft-Delete độc lập 2 phía:** Người gửi xóa ở *Lịch sử* chỉ đặt `hidden_by_sender = TRUE`; cán bộ xóa ở *Hàng đợi* chỉ đặt `hidden_by_receiver = TRUE`. Bản ghi chỉ bị `DELETE` vật lý khi cả hai cờ cùng `TRUE`.

---

## 4. Thành phần Thượng nguồn & Chính sách Giấy phép OSI

UniRequest-OS phát hành mã nguồn tự phát triển theo **[`Apache License 2.0`](../LICENSE)** kèm [`NOTICE`](../NOTICE), không commit `node_modules/`, `vendor/` và không sửa đổi mã nguồn thượng nguồn (chỉ tùy biến bằng cấu hình `.env`, `realm-export.json`, `kong-setup.sh`, `config/kestra/flows/*.yml`):

| Thành phần | Image / Gói | Giấy phép OSI | Cách tích hợp / Cách ly |
| :--- | :--- | :---: | :--- |
| **Keycloak** | `quay.io/keycloak/keycloak:26.0` | `Apache-2.0` | Image gốc + `--import-realm` từ `config/keycloak/realm-export.json` |
| **Kong Gateway** | `kong:3.7.1` | `Apache-2.0` | Image gốc + script cấu hình route/plugin [`kong-setup.sh`](../kong-setup.sh) |
| **Kestra OSS** | `kestra/kestra:latest` | `Apache-2.0` | Image gốc + 3 GitOps YAML đồng bộ qua `scripts/kestra-setup.sh` |
| **Caddy** | `caddy:2-alpine` | `Apache-2.0` | Profile `internet`, reverse proxy automatic TLS từ `config/caddy/Caddyfile` |
| **PostgreSQL** | `postgres:16-alpine` | `PostgreSQL` | Image gốc + migration SQL idempotent `01..11` |
| **MinIO / Silo S3** | `pgsty/silo:latest` | `AGPL-3.0` / `Apache-2.0` | Chạy container tách biệt, giao tiếp hoàn toàn qua S3 HTTP API (không liên kết mã vào repo `Apache-2.0`) |
| **Frontend / Backend** | React 19, Vite 8, Express, Socket.IO, Lucide | `MIT` / `ISC` | Tự dựng trong `apps/` qua `Dockerfile` multi-stage `node:20-alpine` & `nginx:alpine` |

---

## 5. Bản ghi Quyết định Kiến trúc (ADR)

| Mã | Quyết định | Lý do lựa chọn & Tác động |
| :---: | :--- | :--- |
| **QĐ-001** | Chọn **Kestra OSS (`Apache-2.0`)** thay vì n8n | n8n dùng *Sustainable Use License* (không đạt chuẩn OSI cho cuộc thi PMNM); Kestra khai báo 100% bằng YAML GitOps, chạy ổn định trên PostgreSQL dùng chung. |
| **QĐ-002** | Định tuyến động qua **Keycloak Group Tree API** | Tránh hardcode tên phòng ban trong mã nguồn; nhà trường thêm Group trên Keycloak Console là Portal tự nhận ngay qua `GET /api/departments`. |
| **QĐ-003** | **Nginx Same-Origin Proxy** (`/api`, `/auth`, `/api/upload/files`) | Giải quyết triệt để lỗi CORS/Web Crypto PKCE `S256`/Mixed Content khi demo trên điện thoại qua Cloudflare Tunnel hoặc Caddy HTTPS. |
| **QĐ-004** | **Hybrid AI `[I]`** (`Ollama` + Local Vietnamese NLP Fallback) | Tận dụng `qwen2.5:3b` khi có GPU nhưng vẫn phản hồi trong vài mili-giây khi máy chấm thi không có Ollama/mất mạng. |
| **QĐ-005** | **SHA-256 Chain** trên bảng PostgreSQL thay vì thêm DB rời | Giảm tiêu tốn RAM (chạy tốt từ `4 GB` RAM) mà vẫn phát hiện sửa xóa ngầm qua `verifyAuditChain()`. |
