# Changelog

Mọi thay đổi đáng chú ý của dự án **UniRequest-OS** đều được ghi nhận tại tệp này.

Định dạng tuân thủ chuẩn [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/) và đánh số phiên bản theo [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-23

### Added
- **Dữ liệu mẫu khởi tạo máy sạch (`make seed` & auto-seed idempotent):** Tự động nạp 15 danh mục phủ đủ 5 nhóm phòng ban Keycloak (`CTSV`, `KETOAN`, `Phòng Quản trị Thiết bị`, `Phòng khoa học và QLSV`, `Chăm sóc sắc đẹp`), 18 yêu cầu mẫu rải đều 7 ngày gần nhất (gồm 2 yêu cầu `PENDING` quá hạn SLA), bình luận, thông báo và chuỗi băm `request_audit_logs` `SHA-256` hợp lệ 100%.
- **Bảo mật tệp đính kèm bằng MinIO Private Bucket & HMAC Signed URL:** Chuyển bucket `unirequest-files` sang chế độ Private hoàn toàn; bảo vệ `GET /api/upload/files/:objectName` bằng chữ ký HMAC-SHA256 ngắn hạn (`?exp=...&sig=...`) hoặc `Bearer JWT`.
- **Chặn biên mạng cho tuyến nội bộ `/api/internal/`:** Chặn `HTTP 403` không phân biệt hoa/thường từ cả Nginx (`:3000`) và Kong (`:8000`) trong khi Kestra vẫn gọi trực tiếp nội bộ `http://backend:4000/api/internal/kestra/sla-alert` kèm khóa `x-kestra-key`.
- **Trợ lý AI v3.0 (Trang riêng `Trợ lý AI` & Ultra-Lean Enum Router trên `qwen2.5:3b`):** Thay thế gợi ý tĩnh bằng trang hội thoại riêng (`POST /api/ai/assistant`, `GET /api/ai/config`) dùng `Ollama /api/chat` (`format: json_schema` 3 trường enum/boolean, `num_predict: 120`, TB `352ms`/lượt, `34/34` Live Eval PASS), đọc toàn bộ cấu hình prompt/danh bạ phòng ban từ `config/ai/assistant-config.json`, chống History Poisoning/Bleed, chống Prompt Injection (có dấu & không dấu), bảo vệ Zero Information Disclosure và đồng nhất 100% với lõi dự phòng offline.
- **Đồng bộ nhãn Lớp / Nhóm người gửi (`sender_group`) động từ Keycloak:** Tự động trích nhãn lớp ngắn (`K11A1`, `k11A2`, `K11A3`...) từ JWT và backfill qua Keycloak Admin API; gom/lọc theo Lớp người gửi cho Cán bộ Ban và theo Phòng ban tiếp nhận cho Sinh viên (Zero-Hardcode).
- **Tích hợp Gmail SMTP (`nodemailer`) cho Kestra SLA Watchdog & Daily Report:** Tự lấy email Cán bộ theo từng Ban từ Keycloak Admin API (gộp fallback `SMTP_ALERT_TO`), gửi email HTML cảnh báo đơn quá hạn SLA (chống lặp 6h) và báo cáo tổng hợp cuối ngày 17:30 (`POST /api/internal/kestra/daily-report-notify`); tự bỏ qua êm ái khi chạy offline không điền `SMTP_PASS`.
- **Chống spam Trao đổi & Tối ưu UX Form / Bảng Quản lý:** Khóa mục `Trao đổi` chỉ mở khi yêu cầu ở trạng thái `APPROVED` (chặn `403 COMMENTS_ONLY_WHEN_APPROVED` trên API và ẩn khung chat trên UI khi `PENDING`/`REJECTED`); Form tạo đơn chọn **Loại yêu cầu** trước để tự động khóa đúng Phòng ban (`400 CATEGORY_DEPARTMENT_MISMATCH`); tối ưu bảng `Quản lý & Phê duyệt` cắt gọn cột `Tiêu đề` 1 dòng + `...`, sửa dấu `...` trên badge, thu cột đính kèm thành icon, đồng bộ hoàn toàn chế độ xem phẳng và `Gom theo Lớp / Ban`.
- **Chuẩn hóa quản trị Phần mềm Nguồn Mở (FOSS):** Thêm header `// SPDX-License-Identifier: Apache-2.0` cho toàn bộ 115 tệp `.ts/.tsx`, đồng bộ phiên bản `1.0.0` giữa Frontend & Backend, bổ sung `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`.
- **Đóng gói phát hành & Sao lưu đủ 3 CSDL:** Bổ sung `scripts/release.sh` (`make release VERSION=1.0.0`) tạo gói nguồn mở `.tar.gz` + `.sha256` sạch (không dính `.env`/`.agents/`/`backups/`); nâng cấp `scripts/backup.sh` & `scripts/restore.sh` sao lưu/phục hồi đầy đủ 3 CSDL (`postgres.sql.gz`, `kestra.sql.gz`, `kong.sql.gz`) + `minio-data.tar.gz` + `SHA256SUMS`.
- **Bộ kiểm thử toàn diện (`107/107` Unit Tests + `34/34` Live AI Eval PASS):** Mở rộng thêm `ai-assistant.test.ts` (`19/19`), `comment-status-guard.test.ts` (`4/4`), `mail-service.test.ts` (`4/4`), `request-list-view.test.tsx` (`3/3`), `eval-ai.ts` (`34/34` live trên dữ liệu thật), nâng tổng bộ test lên **95/95 Backend + 12/12 Frontend = 107/107 PASS**.

### Changed
- **Zero-Hardcode Secrets:** Gỡ mật khẩu mặc định và `VAPID_PRIVATE_KEY` khỏi `docker-compose.yml` và `environment.ts`; dùng `{{ envs.webhook_key }}` trong `unirequest-lifecycle.yml`; tự động nạp `.env` trong `scripts/test-e2e.sh` và `scripts/kestra-setup.sh`.
- **Tối ưu RAM & Ghim phiên bản Docker ổn định:** Ghim `kestra/kestra:v2.0.11` và `pgsty/silo:RELEASE.2026-11-12T00-00-00Z`; giới hạn `KONG_NGINX_WORKER_PROCESSES=2` và JVM heap `-Xms192m -Xmx512m` cho Keycloak & Kestra; bind cổng quản trị (`4000`, `5432`, `8001`, `9000`) về `127.0.0.1`.
- **Tăng cường bảo mật Backend & Keycloak:** Bổ sung `helmet()`, siết CORS allowlist đồng bộ cho cả Express HTTP lẫn Socket.IO, chặn URL độc hại (`javascript:`/URL ngoài) trong `attachment_url`, thu hẹp `redirectUris` trong `realm-export.json` (loại bỏ `https://*` mở rộng), chạy container Backend dưới quyền non-root `USER node`.
- **Đồng bộ 100% tài liệu <-> mã nguồn:** Cập nhật chính xác vai trò Kong (Rate-Limit + `X-Correlation-ID`) vs Express (`auth-middleware.ts` xác minh JWT `RS256`), giấy phép `pgsty/silo` là `AGPL-3.0-or-later`, cờ `MODE=apply` trong `Makefile` và lộ trình phát triển thực tế.

### Fixed
- Sửa `request-list-view.tsx` sử dụng `resolveAttachmentUrl()` đồng nhất với `request-detail-dialog.tsx` khi mở tệp đính kèm qua Same-Origin HTTPS.

## [0.9.0] - 2026-11-23

### Added
- Hoàn thiện kiến trúc 3 tầng DX-OS Open-Core (`H-P-D-I`): Không gian `[I]` Hybrid AI phân tuyến phòng ban/danh mục/mức ưu tiên (Ollama + Rule-NLP Fallback).
- Kiểm tra định dạng tệp thật theo Magic Bytes trong RAM (`file-security.ts`) và chuỗi băm kiểm toán `SHA-256` (`audit-hash-chain.ts`).
- Bộ tài liệu thiết kế, quy trình phát triển 7 bước (`docs/research/`), bộ kiểm thử chấp nhận & bảo mật OWASP.

## [0.7.0] - 2026-11-21

### Added
- Định tuyến yêu cầu động theo cây nhóm phòng ban Keycloak (`target_department`), tách thông báo theo phòng ban và xóa độc lập 2 phía (`hidden_by_sender`, `hidden_by_receiver`).
- Chuyển đổi động cơ quy trình sang **Kestra OSS (`Apache-2.0`)** với 3 GitOps YAML workflows (`unirequest-lifecycle`, `unirequest-sla-watchdog`, `unirequest-daily-report`).
- Triển khai Same-Origin Proxy trên Nginx (`:3000/api/*`, `:3000/auth/*`) và cấu hình Caddy HTTPS (`docker-compose.yml` profile `internet`).

## [0.5.0] - 2026-11-18

### Added
- Hoàn thiện ứng dụng Web PWA React 19 + TypeScript + Tailwind CSS v4, Socket.IO realtime, bình luận trực tiếp, danh mục yêu cầu động và Web Push (VAPID).
- Đóng gói hệ thống 1-lệnh `make build`, `make test` (7 bước E2E), `make backup` & `make restore`.
