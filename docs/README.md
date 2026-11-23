# Bản đồ Tài liệu UniRequest-OS (Xem nhanh trong 5 phút)

Tài liệu kỹ thuật của **UniRequest-OS** được tổ chức tối giản thành **4 tệp chính trong `docs/`** giúp Ban Giám khảo và người triển khai nắm toàn bộ kiến trúc, luồng nghiệp vụ, cách vận hành và bằng chứng kiểm thử chỉ trong vài phút.

## 1. Xem nhanh hệ thống

1. **Tổng quan & Cài đặt 1 lệnh (1 phút):** Xem [`README.md`](../README.md) (mục *Giới thiệu* và *Quick Start*).
2. **Dùng thử trên giao diện (2 phút):** Sau `make build`, mở <http://localhost:3000> với 4 tài khoản mẫu tách phạm vi (`sinhvien`, `sinhvien2`, `canbo`, `giangvien`) trong [`README.md`](../README.md#tài-khoản-kiểm-thử-configkeycloakrealm-exportjson).
3. **Kiến trúc 3 tầng DX-OS & Mô hình dữ liệu:** [`architecture.md`](architecture.md) và [`uml.md`](uml.md).
4. **Vận hành, Workflow Kestra & Bằng chứng kiểm thử:** [`operations.md`](operations.md).

## 2. Tìm gì ở đâu (Ánh xạ Tiêu chí PoF / OLP PMNM 2026)

| Hạng mục chấm điểm | Xem ở đâu trong kho mã nguồn | Lệnh / Bằng chứng tự kiểm |
| :--- | :--- | :--- |
| **Mã nguồn mở & Công khai** | Repo công khai, nhánh `main`, không cần đăng nhập | `git log --oneline -n 20` |
| **Giấy phép OSI (`Apache-2.0`)** | [`LICENSE`](../LICENSE) (toàn văn) & [`NOTICE`](../NOTICE) (mục đích, bên thứ ba) | `head -n 5 LICENSE` |
| **Chính sách Thư viện & Container** | [`architecture.md`](architecture.md#4-thành-phần-thượng-nguồn--chính-sách-giấy-phép-osi) | `git ls-files \| grep -E '(vendor\|node_modules\|third_party)/'` -> rỗng |
| **Cài từ mã nguồn (không sửa mã)** | [`README.md`](../README.md#quick-start-chạy-bằng-1-lệnh), [`.env.example`](../.env.example), [`Makefile`](../Makefile) | `make build` (tự tạo `.env` từ `.env.example`) |
| **Kiến trúc 3 tầng DX-OS & `H-P-D-I`** | [`architecture.md`](architecture.md), [`uml.md`](uml.md), [`docs/images/architecture.png`](images/architecture.png) | Kiểm tra `docs/images/*.svg` trong [CI](../.github/workflows/ci.yml) |
| **Quy trình, Demo & Bằng chứng Test** | [`operations.md`](operations.md), [`scripts/test-e2e.sh`](../scripts/test-e2e.sh) | `make unit-test` (`42/42`), `make lint`, `make test` (`7/7`) |
| **Demo Internet HTTPS & Sao lưu** | [`operations.md`](operations.md#1-triển-khai-máy-sạch--internet-https), [`scripts/internet-demo.sh`](../scripts/internet-demo.sh) | `bash scripts/internet-demo.sh`, `make backup && make restore` |
| **Tài nguyên hình ảnh & AI** | [`images/README.md`](images/README.md), [`NOTICE`](../NOTICE) | Minh bạch toàn bộ ảnh chụp thật & phần dùng AI |

## 3. Tự kiểm chuẩn PoF trước ngày chấm

```bash
# 1. Xác nhận không đóng gói kèm thư viện phụ thuộc (vendor/node_modules)
git ls-files | grep -E '(vendor|third_party|node_modules)/' && echo "VI PHẠM" || echo "SẠCH"

# 2. Kiểm tra mã sạch, typecheck, build PWA, compose và JSON realm
make lint

# 3. Chạy 42 unit/integration tests độc lập (không cần bật Docker)
make unit-test

# 4. Dựng toàn hệ thống sạch bằng 1 lệnh và chạy 7 bước E2E thật
make build && make test
```

## 4. Giới hạn đã biết (Minh bạch kỹ thuật)

- **Phạm vi đóng gói Docker dev/chấm thi:** [`docker-compose.yml`](../docker-compose.yml) có ánh xạ thêm các cổng quản trị cục bộ (`4000`, `5432`, `8001`, `8080`, `8085`, `9000`-`9001`) để giám khảo kiểm chứng trực tiếp từng dịch vụ lõi; khi đưa ra Internet thật dùng profile `caddy` (`80/443`) hoặc Cloudflare Tunnel trỏ duy nhất vào `:3000`.
- **Realm Keycloak nạp lần đầu:** `keycloak` chạy `--import-realm` khi CSDL trống; nếu sửa [`realm-export.json`](../config/keycloak/realm-export.json) về sau cần cập nhật qua Admin Console hoặc `make clean && make build`.
- **Giới hạn tính năng tương lai:** Mô hình Lakehouse (`Redpanda/Iceberg`), `Qdrant RAG` tra cứu quy chế trường và bắt buộc `MFA WebAuthn/TOTP` thuộc lộ trình mở rộng (Mục 4 của `README.md`), chưa bật mặc định trong bản `v0.9.0`.
