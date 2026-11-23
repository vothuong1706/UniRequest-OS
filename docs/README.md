# Hướng dẫn Đọc Tài liệu Dự án UniRequest-OS

Thư mục `docs/` tổng hợp toàn bộ tài liệu kỹ thuật của nhóm sinh viên khi nghiên cứu và phát triển dự án **UniRequest-OS: Nền tảng Quản lý Yêu cầu Đại học (Student Request Management)**, được tổ chức rõ ràng theo từng mảng để người đọc và Hội đồng Giám khảo thuận tiện tra cứu.

## 1. Thứ tự đọc tài liệu gợi ý

1. **Giới thiệu bài toán & Cách cài đặt nhanh:** Xem [`README.md`](../README.md) ở thư mục gốc để nắm bài toán tại trường đại học, chức năng của từng nhóm người dùng (**Ai dùng - Dùng cái gì - Dùng như thế nào**) và cách khởi chạy hệ thống.
2. **Dùng thử trên trình duyệt:** Sau khi chạy `make build`, truy cập <http://localhost:3000> và đăng nhập bằng 4 tài khoản mẫu (`sinhvien`, `sinhvien2`, `canbo`, `giangvien`) trong [`README.md`](../README.md#tài-khoản-dùng-thử-configkeycloakrealm-exportjson).
3. **Hồ sơ dự thi OLP Phần mềm Nguồn mở 2026:** [`du-thi/README.md`](du-thi/README.md), bảng rà soát 6 tiêu chí phần mềm nguồn mở [`du-thi/pof-checklist.md`](du-thi/pof-checklist.md) và quá trình phát triển [`du-thi/ke-hoach-phat-trien.md`](du-thi/ke-hoach-phat-trien.md).
4. **Quy trình nghiên cứu, xây dựng và kiểm thử 7 bước SDLC của nhóm (`107/107` bài test):** [`research/README.md`](research/README.md) cùng 7 tài liệu chi tiết từ [`01-phan-tich-yeu-cau.md`](research/01-phan-tich-yeu-cau.md) đến [`07-dong-goi-ban-giao.md`](research/07-dong-goi-ban-giao.md).
5. **Thiết kế kiến trúc 3 tầng & Cơ sở dữ liệu PostgreSQL:** [`architecture.md`](architecture.md) và bộ sơ đồ UML tại [`uml.md`](uml.md).
6. **Hướng dẫn vận hành, quy trình Kestra & Kết quả kiểm thử:** [`operations.md`](operations.md).
7. **Câu hỏi thường gặp & Giải thích kỹ thuật với Hội đồng:** [`hoi-dap-hoi-dong.md`](hoi-dap-hoi-dong.md) (hoặc bản đồng bộ tại [`du-thi/hoi-dap-hoi-dong.md`](du-thi/hoi-dap-hoi-dong.md)).

## 2. Bảng tra cứu tài liệu trong dự án

| Nội dung cần tìm | Vị trí tài liệu / tệp mã nguồn | Lệnh kiểm tra thực tế |
| :--- | :--- | :--- |
| **Mã nguồn mở & Lịch sử phát triển** | Kho mã nguồn nhánh `main`, [`du-thi/ke-hoach-phat-trien.md`](du-thi/ke-hoach-phat-trien.md) | `git log --oneline -n 20` |
| **Giấy phép chuẩn OSI (`Apache-2.0`)** | [`LICENSE`](../LICENSE), [`NOTICE`](../NOTICE), [`du-thi/pof-checklist.md`](du-thi/pof-checklist.md) | `head -n 5 LICENSE` |
| **Chính sách thư viện & Docker image gốc** | [`architecture.md`](architecture.md#4-danh-mục-công-nghệ-nguồn-mở--chính-sách-giấy-phép-osi) | `git ls-files \| grep -E '(vendor\|node_modules\|third_party)/'` -> rỗng |
| **Khởi chạy từ mã nguồn qua `.env`** | [`README.md`](../README.md#2-hướng-dẫn-chạy-nhanh-quick-start), [`.env.example`](../.env.example), [`Makefile`](../Makefile) | `make build` (tự tạo `.env` từ `.env.example`) |
| **Kiến trúc 3 tầng & 4 nhóm chức năng `H-P-D-I`** | [`architecture.md`](architecture.md), [`uml.md`](uml.md), [`docs/images/architecture.png`](images/architecture.png) | Kiểm tra `docs/images/*.svg` trong [CI](../.github/workflows/ci.yml) |
| **Quy trình nghiên cứu 7 bước SDLC & 107 bài test** | [`research/README.md`](research/README.md), [`operations.md`](operations.md), [`scripts/test-e2e.sh`](../scripts/test-e2e.sh) | `make unit-test` (`107/107`), `make lint`, `make test` (`7/7`) |
| **Chạy thử qua Internet HTTPS & Sao lưu** | [`operations.md`](operations.md#1-hướng-dẫn-cài-đặt-từ-máy-sạch--mở-demo-https-qua-internet), [`scripts/internet-demo.sh`](../scripts/internet-demo.sh) | `bash scripts/internet-demo.sh`, `make backup && make restore` |
| **Hỏi - Đáp kỹ thuật với Hội đồng** | [`hoi-dap-hoi-dong.md`](hoi-dap-hoi-dong.md), [`du-thi/hoi-dap-hoi-dong.md`](du-thi/hoi-dap-hoi-dong.md) | 10 câu hỏi kỹ thuật kèm đường dẫn tới mã nguồn & bài test |
| **Danh mục hình ảnh & Minh bạch AI** | [`images/README.md`](images/README.md), [`NOTICE`](../NOTICE) | Danh sách 12 ảnh chụp giao diện thực tế & phần có dùng công cụ AI |

## 3. Các lệnh tự kiểm tra hệ thống

```bash
# 1. Đảm bảo không đưa thư mục thư viện (vendor/node_modules) lên Git
git ls-files | grep -E '(vendor|third_party|node_modules)/' && echo "VI PHẠM" || echo "SẠCH"

# 2. Kiểm tra kiểu dữ liệu TypeScript, ESLint, Prettier, đóng gói PWA và cấu hình
make lint

# 3. Chạy 107 bài unit test (chạy độc lập, không cần bật Docker)
make unit-test

# 4. Khởi dựng toàn bộ container và chạy kiểm thử tích hợp E2E 7 bước
make build && make test
```

## 4. Các giới hạn hiện tại của phiên bản `v1.0.0`

- **Các cổng dịch vụ trong môi trường phát triển & chấm thi:** Trong [`docker-compose.yml`](../docker-compose.yml), các cổng nội bộ/quản trị (`4000`, `5432`, `8001`, `9000`) được gắn chặt về `127.0.0.1`, trong khi các cổng giao diện demo cục bộ (`3000`, `8000`, `8080`, `8085`, `9001`) mở để Ban Giám khảo tiện kiểm tra. Khi đưa ra môi trường Internet qua profile `caddy` (`80/443`) hoặc Cloudflare Tunnel, toàn bộ truy cập chỉ đi qua cổng giao diện `:3000`.
- **Nạp dữ liệu mẫu của Keycloak:** Dịch vụ `keycloak` chạy cờ `--import-realm` khi cơ sở dữ liệu khởi tạo lần đầu. Nếu chỉnh sửa tệp [`realm-export.json`](../config/keycloak/realm-export.json) về sau, cần cập nhật qua giao diện Keycloak Admin Console hoặc chạy `make clean && make build`.
- **Các tính năng thuộc hướng phát triển tiếp theo:** Kho dữ liệu báo cáo nhiều năm học (`Redpanda/Iceberg`), tra cứu văn bản quy chế bằng `Qdrant RAG` và bắt buộc xác thực hai lớp `MFA WebAuthn/TOTP` được nhóm đề xuất trong phần Hướng phát triển của [`README.md`](../README.md#6-hướng-phát-triển-tiếp-theo), chưa bật mặc định trong bản `v1.0.0` để hệ thống chạy nhẹ trên máy cấu hình từ `4 GB` RAM.
