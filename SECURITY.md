# Chính sách Bảo mật (Security Policy)

## 1. Phiên bản được hỗ trợ

| Phiên bản | Trạng thái hỗ trợ bản vá bảo mật |
| :---: | :---: |
| `1.0.x` | Đang hỗ trợ tích cực |
| `< 1.0.0` | Khuyến nghị nâng cấp lên `1.0.0` |

---

## 2. Quy trình Báo cáo Lỗ hổng Bảo mật

Nhóm phát triển **UniRequest-OS** coi trọng mọi phản hồi liên quan đến an toàn thông tin. **Vui lòng không mở GitHub Issue công khai** cho các lỗ hổng bảo mật chưa được vá.

Hãy gửi báo cáo qua một trong hai kênh sau:
1. **GitHub Security Advisories:** Mở báo cáo riêng tư tại tab **Security → Advisories → Report a vulnerability** trên kho GitHub của dự án.
2. **Email nhóm phát triển:** Liên hệ trực tiếp quản trị viên dự án qua email kỹ thuật (`admin@unirequest.edu.vn` hoặc email nhóm trên hồ sơ dự thi).

### Nội dung khuyến nghị trong báo cáo
- Mô tả chi tiết lỗ hổng, thành phần ảnh hưởng (`Kong`, `Nginx`, `Backend API`, `Frontend SPA`, `Keycloak`, `Kestra`, `MinIO`).
- Các bước tái hiện tối thiểu (PoC / lệnh `curl` hoặc ảnh chụp).
- Đánh giá mức độ ảnh hưởng và đề xuất khắc phục (nếu có).

### Cam kết thời gian phản hồi
- **Xác nhận tiếp nhận:** Trong vòng **48 giờ**.
- **Đánh giá & kế hoạch vá:** Trong vòng **5 ngày làm việc**.
- **Phát hành bản vá & công bố minh bạch:** Ngay sau khi kiểm thử hồi quy (`make unit-test` & `make test`) đạt 100%, ghi nhận trong `CHANGELOG.md`.

---

## 3. Các lớp Phòng thủ Bảo mật Hiện có trong UniRequest-OS

1. **Biên mạng (Nginx & Kong API Gateway):**
   - Giới hạn tốc độ truy cập (`rate-limiting`: 120 req/phút) và gắn mã truy vết `X-Correlation-ID`.
   - Chặn hoàn toàn tuyến nội bộ `/api/internal/*` từ cả Nginx (`:3000`) và Kong (`:8000`) bằng `HTTP 403`.
   - Các cổng quản trị và hạ tầng nội bộ (`4000`, `5432`, `8001`, `9000`) mặc định chỉ bind về `127.0.0.1`.
2. **Định danh & Phân quyền (Keycloak 26.0 + Express Middleware):**
   - Đăng nhập OIDC Authorization Code + `PKCE S256`; thu hẹp `redirectUris` trong `realm-export.json`.
   - Express Backend (`auth-middleware.ts`) xác minh chữ ký JWT `RS256` bằng khóa công khai JWKS của Realm trên cả REST API và Socket.IO.
   - Phân quyền theo vai trò kết hợp nhóm phòng ban Keycloak (chống leo thang đặc quyền dọc & IDOR ngang phòng ban).
3. **Bảo vệ Dữ liệu & Tệp đính kèm:**
   - Kiểm tra định dạng thật bằng **Magic Bytes** trong RAM trước khi tải lên MinIO (`file-security.ts`).
   - Bucket MinIO cấu hình **Private** hoàn toàn; `GET /api/upload/files/:objectName` yêu cầu chữ ký **HMAC-SHA256 ngắn hạn** (`?exp=...&sig=...`) hoặc `Bearer JWT`.
   - Nhật ký kiểm toán `request_audit_logs` được liên kết bằng chuỗi băm `SHA-256` (`prev_hash` → `entry_hash`).
4. **Hardening Ứng dụng & Bí mật:**
   - Sử dụng `helmet()`, CORS theo danh sách origin cho phép, chạy Backend container dưới tài khoản non-root `USER node`.
   - Không lưu mật khẩu production hoặc `VAPID_PRIVATE_KEY` trong mã nguồn / `docker-compose.yml`.

---

## 4. Danh sách Kiểm tra trước khi Triển khai Production

- [ ] Đổi toàn bộ mật khẩu `change_me_*` và `KESTRA_WEBHOOK_KEY` trong `.env`.
- [ ] Sinh cặp khóa VAPID mới bằng `npx web-push generate-vapid-keys`.
- [ ] Thu hẹp `CORS_ALLOWED_ORIGINS` và `redirectUris` trong Keycloak về đúng tên miền HTTPS chính thức của nhà trường.
- [ ] Bật TLS (Caddy profile `internet` hoặc Reverse Proxy HTTPS của trường) và cấu hình `make backup` định kỳ.
