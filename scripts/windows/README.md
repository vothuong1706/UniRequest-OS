# Windows / WSL2 Quick Launcher (`scripts/windows/`)

Thư mục này cung cấp 2 tệp Batch hỗ trợ khởi chạy và tắt nhanh toàn bộ hệ sinh thái **UniRequest-OS** từ màn hình Windows Desktop khi phát triển/trình diễn trên **WSL 2 (`Ubuntu-24.04`)**.

## Cách sử dụng
1. Copy 2 tệp sau ra màn hình Desktop Windows (hoặc tạo Shortcut):
   - `Start_UniRequest.bat`: Đánh thức WSL2 → kiểm tra Docker daemon → chạy `make up` → **chờ thông minh** đến khi Frontend (`:3000/health`), Kong/Backend (`:8000/api/health`) và Kestra (`:8085/ping`) cùng sẵn sàng → tự động mở 3 tab trình duyệt (`:3000`, `:8085`, `:8080`).
   - `Stop_UniRequest.bat`: Chạy `make down` dừng toàn bộ container an toàn (giữ nguyên dữ liệu PostgreSQL, MinIO và Kestra).
2. Nếu tên bản phân phối WSL trên máy khác `Ubuntu-24.04`, mở tệp `.bat` bằng Notepad và chỉnh lại dòng `set "WSL_DISTRO=..."`.
