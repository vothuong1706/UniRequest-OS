# Hướng dẫn Đóng góp (Contributing Guide)

Cảm ơn bạn đã quan tâm và đóng góp cho **UniRequest-OS** — nền tảng tiếp nhận và xử lý yêu cầu Đại học theo mô hình DX-OS Open-Core (giấy phép **Apache-2.0**).

Tài liệu này mô tả quy trình làm việc chuẩn dành cho **đội phát triển 3 thành viên** và cộng đồng nguồn mở bên ngoài.

---

## 1. Quy trình phối hợp phát triển trong nhóm & cộng đồng nguồn mở

### 1.1. Mô hình làm việc của nhóm phát triển (3 thành viên dùng chung máy trạm)
Trong giai đoạn hoàn thiện sản phẩm dự thi, **3 thành viên trong nhóm cùng phát triển và kiểm thử trực tiếp trên một máy trạm phát triển và tài khoản GitHub chung của đội**, phân công rõ mảng kỹ thuật để không dẫm chân lên nhau:

- **Thành viên 1 (Hạ tầng & DevOps - Keycloak / Kong / Kestra / Docker):** Quản lý `docker-compose.yml`, `config/`, `scripts/`, `kong-setup.sh`, `Makefile`, CI/CD.
- **Thành viên 2 (Backend API & Bảo mật `[H-P-D-I]`):** Quản lý `apps/backend-api/src/`, `apps/backend-api/tests/`, `db/init.sql`, AI Triage, chuỗi băm `SHA-256`, ký HMAC tệp MinIO.
- **Thành viên 3 (Frontend PWA, UI/UX & Tài liệu Kiểm thử):** Quản lý `apps/demo-app/src/`, giao diện PWA/Responsive, `docs/`, kiểm thử E2E và kịch bản trình diễn.

Quy tắc trước mỗi lần commit trên máy chung:
1. Chạy bắt buộc `make lint && make unit-test` (và `make test` nếu có thay đổi hạ tầng/API).
2. Ghi rõ phạm vi thay đổi theo chuẩn Conventional Commits; có thể ghi thêm dòng `Co-authored-by: <Tên Thành Viên> <email>` trong commit message khi nhiều thành viên cùng đóng góp.

### 1.2. Quy trình đóng góp dành cho cộng đồng bên ngoài (Fork & Pull Request)
1. Fork kho mã nguồn và tạo nhánh mới từ `main`: `feat/<ten-tinh-nang>`, `fix/<ten-loi>`, `docs/<noi-dung>`.
2. Bảo đảm tuân thủ chuẩn SPDX, Zero-Hardcode và chạy xanh `make lint && make unit-test`.
3. Mở Pull Request về nhánh `main` kèm mô tả rõ thay đổi và kết quả kiểm thử để nhóm rà soát và gộp mã.

---

## 2. Quy ước Commit (Conventional Commits)

Sử dụng tiền tố rõ ràng, dễ tra cứu lịch sử:

- `feat(backend): them co che ky HMAC cho tep dinh kem MinIO`
- `fix(frontend): dung resolveAttachmentUrl trong bang danh sach yeu cau`
- `sec(gateway): chan tuyen /api/internal tu cong cong khai Kong va Nginx`
- `test(backend): bo sung unit test kiem chung chuoi SHA-256 cho seed data`
- `docs(architecture): dong bo vai tro Kong Rate-Limit va Express JWT RS256`

---

## 3. Quy chuẩn Mã nguồn & Bản quyền FOSS

1. **SPDX License Header (bắt buộc):** Mọi tệp `.ts` và `.tsx` mới do nhóm phát triển trong `apps/backend-api/src`, `apps/backend-api/tests`, `apps/demo-app/src` PHẢI bắt đầu bằng dòng đầu tiên:
   ```ts
   // SPDX-License-Identifier: Apache-2.0
   ```
2. **Zero-Hardcode Secrets:** Không bao giờ commit tệp `.env`, mật khẩu thật, `VAPID_PRIVATE_KEY` hay khóa API vào Git. Mọi biến môi trường mới phải được khai báo mẫu trong `.env.example` và đồng bộ với `docker-compose.yml`.
3. **Định dạng & Kiểm tra tĩnh:** Trước khi mở PR, chạy đầy đủ lệnh kiểm tra sau tại thư mục gốc:
   ```bash
   make lint       # TypeScript, ESLint, Prettier, Docker Compose & Keycloak JSON
   make unit-test  # Toàn bộ Vitest tests (Backend + Frontend)
   make test       # Kiểm thử tích hợp 7 bước trên Docker Compose (nếu thay đổi hạ tầng/API)
   ```

---

## 4. Thiết lập Môi trường Phát triển Nhanh

```bash
# 1. Tạo tệp .env từ mẫu
make env

# 2. Khởi chạy toàn bộ 8 dịch vụ Docker (tự động nạp Seed Data nếu DB trống)
make build

# 3. Hoặc nạp lại dữ liệu mẫu bất kỳ lúc nào (idempotent)
make seed

# 4. Chạy dev server riêng cho Frontend (:5173) hoặc Backend (:4000)
make dev-fe
make dev-be
```

---

## 5. Giấy phép Đóng góp

Bằng việc gửi Pull Request vào kho mã nguồn này, bạn đồng ý rằng đóng góp của bạn sẽ được phát hành dưới giấy phép **Apache License, Version 2.0** (xem tệp [`LICENSE`](LICENSE) và [`NOTICE`](NOTICE)).
