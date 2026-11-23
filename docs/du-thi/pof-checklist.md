# Bảng Tự Rà soát 6 Tiêu chí Phần mềm Nguồn mở (PoF Checklist) - UniRequest-OS

Tài liệu này ghi lại kết quả nhóm sinh viên tự kiểm tra kho mã nguồn **UniRequest-OS: Nền tảng Quản lý Yêu cầu Đại học (Student Request Management)** theo 6 tiêu chí của một dự án Phần mềm Nguồn mở chuẩn trước khi bàn giao dự thi OLP PMNM 2026.

---

## 1. Bảng Rà soát 6 Tiêu chí Phần mềm Nguồn mở

| # | Tiêu chí Phần mềm Nguồn mở | Cách nhóm thực hiện trong dự án UniRequest-OS | Tệp đối chiếu trong repo | Lệnh kiểm tra thực tế | Kết quả |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **1** | **Quản lý mã nguồn công khai trên Git** | Mã nguồn quản lý công khai trên Git nhánh `main`; 3 thành viên trong nhóm cùng phát triển trên máy trạm và tài khoản GitHub chung theo quy ước phân mảng rõ ràng (`CONTRIBUTING.md`) với lịch sử phát triển từ `v0.1.0` đến `v1.0.0`. | Kho Git [`UniRequest-OS`](../../README.md), [`CONTRIBUTING.md`](../../CONTRIBUTING.md) | `git status` và `git log --oneline -n 15` | **ĐẠT** |
| **2** | **Giấy phép nguồn mở chuẩn OSI (`Apache-2.0`)** | Toàn bộ mã nguồn do nhóm viết được phát hành theo giấy phép **Apache License 2.0**, có header `// SPDX-License-Identifier: Apache-2.0` trên toàn bộ 98 tệp `.ts/.tsx`; thông tin phần mềm nguồn mở bên thứ ba (gồm `pgsty/silo` `AGPL-3.0-or-later` tách container) và công cụ AI hỗ trợ được kê khai minh bạch trong `NOTICE`. | [`LICENSE`](../../LICENSE), [`NOTICE`](../../NOTICE), [`SECURITY.md`](../../SECURITY.md) | `head -n 5 LICENSE` và `cat NOTICE` | **ĐẠT** |
| **3** | **Phiên bản phát hành & Lịch sử thay đổi** | Đánh số phiên bản theo chuẩn SemVer (`v1.0.0`), đồng bộ giữa Frontend & Backend (`package.json`), ghi rõ lịch sử thay đổi theo chuẩn Keep a Changelog và có sẵn lệnh `make release` xuất gói định dạng mở `.tar.gz` kèm `.sha256`. | [`CHANGELOG.md`](../../CHANGELOG.md), [`scripts/release.sh`](../../scripts/release.sh), [`ke-hoach-phat-trien.md`](ke-hoach-phat-trien.md) | `make release` và kiểm tra `CHANGELOG.md` | **ĐẠT** |
| **4** | **Cài đặt và chạy từ mã nguồn qua `.env`** | Không ghi cứng mật khẩu, khóa bí mật hay dữ liệu mẫu trong code (`config/seed/demo-data.json` tách riêng); lệnh `make build` tự động tạo `.env` từ `.env.example`, đóng gói image từ `Dockerfile` và khởi chạy toàn bộ hệ thống. | [`.env.example`](../../.env.example), [`docker-compose.yml`](../../docker-compose.yml), [`Makefile`](../../Makefile) | `make build && make seed && make test` | **ĐẠT** |
| **5** | **Sử dụng thư viện & Docker image gốc, không đóng gói `node_modules/`** | Hạ tầng lõi dùng Docker image chính thức ghim phiên bản ổn định (`keycloak`, `kong:3.7.1`, `kestra:v2.0.11`, `postgres:16-alpine`, `pgsty/silo:RELEASE.2026-11-12T00-00-00Z`, `caddy:2-alpine`); thư viện npm cài qua `package.json`; `.gitignore` chặn hoàn toàn `node_modules/`, `dist/`, `.env`. | [`.gitignore`](../../.gitignore), [`apps/backend-api/package.json`](../../apps/backend-api/package.json), [`apps/demo-app/package.json`](../../apps/demo-app/package.json) | `git ls-files \| grep -E '(vendor\|node_modules\|third_party)/'` -> rỗng | **ĐẠT** |
| **6** | **Tài liệu hướng dẫn kiến trúc, cài đặt & kiểm thử** | Có đầy đủ tài liệu giới thiệu bài toán (**Ai dùng - Dùng cái gì - Dùng như thế nào**), thiết kế kiến trúc 3 tầng, sơ đồ UML, hướng dẫn vận hành, quy trình nghiên cứu 7 bước SDLC và 12 ảnh chụp giao diện thực tế. | [`docs/README.md`](../README.md), [`docs/architecture.md`](../architecture.md), [`docs/operations.md`](../operations.md), [`docs/research/README.md`](../research/README.md) | `make unit-test` (`74/74` PASS) & `make lint` | **ĐẠT** |

---

## 2. Kiểm tra Tự động bằng Bài Test trong Dự án

Nhóm đã viết bài kiểm thử tự động trong [`apps/backend-api/tests/sdlc-compliance-hygiene.test.ts`](../../apps/backend-api/tests/sdlc-compliance-hygiene.test.ts) để xác minh các tiêu chí trên mỗi khi chạy `make unit-test`:
1. Kiểm tra tệp [`LICENSE`](../../LICENSE) đúng chuẩn `Apache License, Version 2.0` và các tài liệu kỹ thuật tồn tại đầy đủ.
2. Kiểm tra tệp [`config/keycloak/realm-export.json`](../../config/keycloak/realm-export.json) bật chuẩn xác thực `PKCE S256` và khai báo đủ 4 tài khoản dùng thử (`sinhvien`, `sinhvien2`, `canbo`, `giangvien`).
3. Kiểm tra 3 quy trình YAML của Kestra dưới namespace `unirequest.dxos` (`unirequest-lifecycle.yml`, `unirequest-sla-watchdog.yml`, `unirequest-daily-report.yml`).
4. Kiểm tra tệp [`apps/backend-api/db/init.sql`](../../apps/backend-api/db/init.sql) định nghĩa đủ 7 bảng PostgreSQL kèm hai cờ ẩn đơn độc lập (`hidden_by_sender`, `hidden_by_receiver`) và hai cột mã băm lịch sử (`prev_hash`, `entry_hash`).
5. Kiểm tra sự đồng bộ biến môi trường giữa [`.env.example`](../../.env.example), [`docker-compose.yml`](../../docker-compose.yml) và [`apps/backend-api/src/config/environment.ts`](../../apps/backend-api/src/config/environment.ts).
6. Kiểm tra toàn bộ 12 ảnh chụp màn hình thực tế trong `docs/images/screenshots/` (bao gồm `TaoYeuCau.png`) đều có thật và được mô tả trong [`docs/images/README.md`](../images/README.md).
