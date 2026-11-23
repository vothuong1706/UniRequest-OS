# Hỏi - Đáp với Hội đồng Giám khảo (OLP PMNM 2026)

Tổng hợp 10 câu hỏi kỹ thuật trọng tâm của Ban Giám khảo dành cho **UniRequest-OS (`v0.9.0`)** kèm bằng chứng kiểm chứng trực tiếp trong mã nguồn và câu trả lời súc tích (~30 giây/câu). Tài liệu chỉ nêu các thông số đã đo hoặc xác minh trong repo; phần chưa làm được nêu thẳng để bảo đảm tính trung thực kỹ thuật.

| # | Câu hỏi trọng tâm | Chủ đề chấm thi |
| :---: | :--- | :--- |
| 1 | [Open-Core 3 tầng nằm ở đâu, ứng dụng khác tái sử dụng lõi thế nào?](#1-open-core-3-tầng-nằm-ở-đâu-ứng-dụng-khác-tái-sử-dụng-lõi-thế-nào) | Kiến trúc DX-OS |
| 2 | [Vì sao chọn nguồn mở và có tránh được lệ thuộc nhà cung cấp (vendor lock-in)?](#2-vì-sao-chọn-nguồn-mở-và-có-tránh-được-lệ-thuộc-nhà-cung-cấp) | Giấy phép & Chủ quyền số |
| 3 | [Định tuyến phòng ban động khác gì so với phân quyền RBAC thông thường?](#3-định-tuyến-phòng-ban-động-khác-gì-so-với-rbac-thông-thường) | Bài toán nghiệp vụ |
| 4 | [Bảo mật: chống truy cập chéo, tệp giả mạo và sửa xóa ngầm CSDL thế nào?](#4-bảo-mật-chống-truy-cập-chéo-tệp-giả-mạo-và-sửa-xóa-ngầm-csdl) | An toàn thông tin |
| 5 | [AI `[I]` có tự ý duyệt đơn hay gửi dữ liệu sinh viên ra ngoài Cloud không?](#5-ai-i-có-tự-ý-duyệt-đơn-hay-gửi-dữ-liệu-sinh-viên-ra-ngoài-cloud-không) | Trí tuệ nhân tạo `[I]` |
| 6 | [Nếu Kestra hoặc Ollama gặp sự cố, sinh viên có gửi được yêu cầu không?](#6-nếu-kestra-hoặc-ollama-gặp-sự-cố-sinh-viên-có-gửi-được-yêu-cầu-không) | Tính sẵn sàng (Fail-Safe) |
| 7 | [Vì sao truy cập `localhost:8000/` báo 404 và compose vẫn mở các cổng khác?](#7-vì-sao-truy-cập-localhost8000-báo-404-và-compose-vẫn-mở-các-cổng-khác) | Biên mạng & Demo |
| 8 | [Xóa đơn độc lập 2 phía hoạt động ra sao và có gây mất dấu vết không?](#8-xóa-đơn-độc-lập-2-phía-hoạt-động-ra-sao-và-có-gây-mất-dấu-vết-không) | Vòng đời dữ liệu |
| 9 | [Khi trường tăng lên hàng chục nghìn sinh viên thì mở rộng và sao lưu thế nào?](#9-khi-trường-tăng-lên-hàng-chục-nghìn-sinh-viên-thì-mở-rộng-và-sao-lưu-thế-nào) | Quy mô & Khôi phục |
| 10 | [Những hạng mục nào nhóm chưa làm trong bản `v0.9.0`?](#10-những-hạng-mục-nào-nhóm-chưa-làm-trong-bản-v090) | Minh bạch kỹ thuật |

---

## 1. Open-Core 3 tầng nằm ở đâu, ứng dụng khác tái sử dụng lõi thế nào?
Tầng 1 (Headless Core) gồm `keycloak`, `kong`, `kestra`, `postgres`, `minio` chạy hoàn toàn từ image gốc trong [`docker-compose.yml`](../docker-compose.yml), không có màn hình nghiệp vụ. Tầng 2 cung cấp các năng lực dùng chung `H-P-D-I` (xác thực JWT/Group, kiểm dịch tệp RAM, audit SHA-256, AI triage, realtime notification). Ứng dụng mới ở Tầng 3 chỉ cần khai báo thêm client Keycloak, route `/api/<ung-dung>` trên Kong và dùng chung token OIDC cùng các dịch vụ lõi.
- **Bằng chứng:** [`docs/architecture.md`](architecture.md), [`kong-setup.sh`](../kong-setup.sh), [`apps/backend-api/src/routes/index.ts`](../apps/backend-api/src/routes/index.ts).

## 2. Vì sao chọn nguồn mở và có tránh được lệ thuộc nhà cung cấp?
Mã nguồn của nhóm phát hành theo `Apache-2.0` ([`LICENSE`](../LICENSE), [`NOTICE`](../NOTICE)); toàn bộ thành phần lõi đều dùng chuẩn mở (PostgreSQL, OIDC, S3 HTTP, YAML GitOps). Đặc biệt nhóm thay **n8n** (*Sustainable Use License*, không phải chuẩn OSI) bằng **Kestra OSS (`Apache-2.0`)**, còn **MinIO/Silo (`AGPL-3.0`/`Apache-2.0`)** chạy như dịch vụ container độc lập qua giao thức S3 nên không xung đột giấy phép.
- **Bằng chứng:** [`docs/architecture.md#4-thành-phần-thượng-nguồn--chính-sách-giấy-phép-osi`](architecture.md#4-thành-phần-thượng-nguồn--chính-sách-giấy-phép-osi), [`NOTICE`](../NOTICE).

## 3. Định tuyến phòng ban động khác gì so với RBAC thông thường?
Thay vì hardcode danh sách phòng ban trong CSDL hoặc chỉ kiểm tra role tĩnh (`canbo`, `sinhvien`), UniRequest-OS đồng bộ đệ quy cây Group thực tế từ Keycloak Admin API (`/api/departments`) và giải quyết quyền theo **3 phạm vi** (`ALL`, `DEPARTMENT`, `PERSONAL`). Khi trường thêm khoa/tổ chuyên môn trên Keycloak Console, danh mục gửi đơn, hàng đợi xử lý, thông báo và Socket.IO tự động nhận diện mà không sửa dòng code nào.
- **Bằng chứng:** [`apps/backend-api/src/services/keycloak-group-service.ts`](../apps/backend-api/src/services/keycloak-group-service.ts), [`apps/backend-api/tests/request-scope.test.ts`](../apps/backend-api/tests/request-scope.test.ts) (8/8 pass).

## 4. Bảo mật: chống truy cập chéo, tệp giả mạo và sửa xóa ngầm CSDL?
- **Chống truy cập chéo:** JWT `RS256` kèm claim `groups` (`full.path: true`) ép điều kiện lọc ngay trong truy vấn SQL; sinh viên ở `/Lớp/K11A1` không thấy đơn `/Lớp/k11A2`, cán bộ `CTSV` không xem/sửa/xóa đơn `KETOAN`.
- **Chống tệp giả mạo:** Chặn phần mở rộng thực thi/script (`.exe`, `.sh`, `.svg`, `.html`, `.js`...) và kiểm tra chữ ký nhị phân **Magic Bytes** ngay trong RAM Buffer trước khi đẩy lên MinIO.
- **Chống sửa xóa ngầm DB:** Bảng `request_audit_logs` nối chuỗi băm `SHA-256` (`prev_hash -> entry_hash` từ `GENESIS`); mỗi lần gọi `GET /api/requests/:id`, `verifyAuditChain()` kiểm tra lại toàn bộ chuỗi để phát hiện can thiệp SQL trực tiếp.
- **Bằng chứng:** [`apps/backend-api/tests/file-security.test.ts`](../apps/backend-api/tests/file-security.test.ts) (4/4 pass), [`apps/backend-api/tests/audit-hash-chain.test.ts`](../apps/backend-api/tests/audit-hash-chain.test.ts) (3/3 pass), [`scripts/test-e2e.sh`](../scripts/test-e2e.sh) (6 endpoint trả HTTP `401` khi thiếu token).

## 5. AI `[I]` có tự ý duyệt đơn hay gửi dữ liệu sinh viên ra ngoài Cloud không?
**Không.** Module `AiTriageService` ưu tiên gọi **Ollama nội bộ** (`OLLAMA_URL`, mặc định `qwen2.5:3b`) trong mạng Docker/máy chủ, hoàn toàn không phụ thuộc API AI trả phí bên ngoài. Kết quả AI chỉ điền sẵn gợi ý *Phòng ban, Danh mục, Độ ưu tiên* sau khi đã đối chiếu khớp với cây Group Keycloak & danh mục thật trong PostgreSQL; sinh viên và cán bộ luôn là người xác nhận cuối cùng.
- **Bằng chứng:** [`apps/backend-api/src/services/ai-triage-service.ts`](../apps/backend-api/src/services/ai-triage-service.ts), [`apps/backend-api/tests/ai-triage.test.ts`](../apps/backend-api/tests/ai-triage.test.ts) (6/6 pass).

## 6. Nếu Kestra hoặc Ollama gặp sự cố, sinh viên có gửi được yêu cầu không?
**Có (Fail-Safe).** Khi `POST /api/requests` chạy, Backend ghi giao dịch vào PostgreSQL và phát thông báo realtime trước; nếu Kestra timeout hoặc đang khởi động, hệ thống ghi nhận cảnh báo log và bảo toàn yêu cầu `PENDING` trong DB. Tương tự, nếu Ollama tắt hoặc máy không có GPU, `AiTriageService` tự chuyển sang bộ suy luận ngữ nghĩa tiếng Việt (`rule-nlp-engine`) trong vài mili-giây.
- **Bằng chứng:** [`apps/backend-api/src/services/workflow-service.ts`](../apps/backend-api/src/services/workflow-service.ts), [`docs/operations.md`](operations.md#2-đặc-tả-workflow-tự-động-hóa-unirequestdxos--trạng-thái).

## 7. Vì sao truy cập `localhost:8000/` báo 404 và compose vẫn mở các cổng khác?
Kong (`:8000`) là **API Gateway**, trong [`kong-setup.sh`](../kong-setup.sh) chỉ khai báo tuyến `/api` và `/auth`, nên đường gốc `/` trả JSON `404` đúng thiết kế (endpoint kiểm tra trực tiếp là `http://localhost:8000/api/health`). Người dùng truy cập Portal tại `http://localhost:3000` (Nginx tự proxy `/api/` và `/auth/` vào Kong). Các cổng quản trị (`4000`, `8001`, `8080`, `8085`, `9001`) được giữ trên localhost trong [`docker-compose.yml`](../docker-compose.yml) để giám khảo dễ kiểm chứng; khi demo qua Internet HTTPS thì chỉ đi qua 1 điểm vào duy nhất (`:3000` qua Tunnel hoặc `:443` qua Caddy).
- **Bằng chứng:** [`apps/demo-app/nginx.conf`](../apps/demo-app/nginx.conf), [`config/caddy/Caddyfile`](../config/caddy/Caddyfile), [`scripts/internet-demo.sh`](../scripts/internet-demo.sh).

## 8. Xóa đơn độc lập 2 phía hoạt động ra sao và có gây mất dấu vết không?
Yêu cầu chưa xóa hoàn toàn ngay khi một phía bấm xóa: sinh viên xóa ở *Lịch sử* chỉ bật `hidden_by_sender = TRUE`, cán bộ xóa ở *Hàng đợi* chỉ bật `hidden_by_receiver = TRUE`. Trong suốt thời gian phía còn lại chưa xóa, yêu cầu, bình luận và sổ cái `SHA-256` vẫn còn nguyên vẹn; chỉ khi **cả hai phía** đều xác nhận xóa (`hidden_by_sender AND hidden_by_receiver`) hệ thống mới xóa bản ghi khỏi PostgreSQL.
- **Bằng chứng:** [`config/postgres/init/10-independent-request-hide.sql`](../config/postgres/init/10-independent-request-hide.sql), [`apps/backend-api/tests/independent-delete.test.ts`](../apps/backend-api/tests/independent-delete.test.ts) (4/4 pass).

## 9. Khi trường tăng lên hàng chục nghìn sinh viên thì mở rộng và sao lưu thế nào?
Bản `v0.9.0` thiết kế cho quy mô một trường hoặc từng đơn vị/khoa trên Docker Compose (`>= 4 GB` RAM) và **chưa đo tải (load-test) hàng chục nghìn kết nối đồng thời**. Về nguyên tắc, React SPA, Nginx và Backend REST là stateless nên có thể nhân bản sau load balancer khi đổi `rate-limiting` của Kong từ `local` sang `redis` và chia cụm PostgreSQL; trước mắt hệ thống đã có sẵn `make backup` (đóng gói `postgres.sql.gz` + `minio-data.tar.gz` + `SHA256SUMS`) và `make restore` (`--dry-run` / `apply`).
- **Bằng chứng:** [`scripts/backup.sh`](../scripts/backup.sh), [`scripts/restore.sh`](../scripts/restore.sh).

## 10. Những hạng mục nào nhóm chưa làm trong bản `v0.9.0`?
Nhóm ghi rõ các giới hạn hiện tại: (1) chưa dựng kho dữ liệu phân tích Lakehouse (`Redpanda + Apache Iceberg`) cho dữ liệu nhiều năm; (2) chưa tích hợp `Qdrant RAG` tra cứu bộ quy chế PDF riêng của từng trường; (3) chưa bật bắt buộc `MFA WebAuthn/TOTP` và `Prometheus/Grafana` mặc định trong Compose để giữ mức RAM tối thiểu `4 GB` khi chấm thi; (4) `realm-export.json` chỉ tự nạp khi DB Keycloak khởi tạo lần đầu.
- **Bằng chứng:** [`docs/README.md#4-giới-hạn-đã-biết-minh-bạch-kỹ-thuật`](README.md#4-giới-hạn-đã-biết-minh-bạch-kỹ-thuật), [`README.md#mục-4-định-hướng-phát-triển`](../README.md#mục-4-định-hướng-phát-triển).
