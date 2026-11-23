# Danh mục Hình ảnh, Sơ đồ & Ảnh chụp Thực tế (`docs/images/`)

Toàn bộ tài nguyên hình ảnh, sơ đồ kiến trúc và 12 ảnh chụp màn hình trong thư mục này phục vụ minh họa cho dự án **UniRequest-OS: Nền tảng Quản lý Yêu cầu Đại học (Student Request Management)** và được phát hành kèm theo giấy phép **Apache License 2.0** cùng tệp [`NOTICE`](../../NOTICE) của kho mã nguồn.

## 1. Hình ảnh minh họa & Sơ đồ kiến trúc (có sử dụng công cụ AI hỗ trợ)

| Tệp | Loại | Nguồn gốc & Cách tạo |
| :--- | :---: | :--- |
| `logo-3d.png` | PNG trong suốt | Biểu tượng kính 3D chính thức của UniRequest-OS, tạo bằng công cụ AI tạo ảnh theo mô tả của nhóm (dùng cho Portal, Favicon và README) |
| `banner.jpg` | JPG (16:9) | Ảnh bìa minh họa cổng dịch vụ đại học kết nối lõi nguồn mở, tạo bằng công cụ AI tạo ảnh |
| `hpdi-overview.jpg` | JPG (16:9) | Infographic 4 không gian H -> P -> D -> I, tạo bằng công cụ AI tạo ảnh |
| `architecture-animated.svg` | Animated SVG | Sơ đồ kiến trúc 3 tầng DX-OS có chấm chuyển động theo 4 không gian `H-P-D-I`, vẽ bằng mã SVG với sự hỗ trợ của AI và phản ánh đúng 100% thành phần thật của UniRequest-OS |
| `architecture.png` | PNG | Ảnh tĩnh xuất từ `architecture-animated.svg` dùng cho tài liệu ngoại tuyến và báo cáo |
| `workflow-animated.svg` | Animated SVG | Sơ đồ động 5 bước quy trình xử lý yêu cầu, vẽ bằng mã SVG với sự hỗ trợ của AI |
| `uml-*.svg` | SVG | 6 sơ đồ UML 2.x BCE (Use Case, Sequence Lifecycle, Sequence SLA, State Machine, Class, Deployment) sinh từ mã Mermaid/SVG với sự hỗ trợ của AI |

> *Ghi chú:* Các biểu tượng nhỏ trong sơ đồ kiến trúc chỉ mang tính minh họa kỹ thuật, không phải nhãn hiệu thương mại chính thức của bên thứ ba.

## 2. Ảnh chụp màn hình vận hành thực tế (`docs/images/screenshots/`)

Toàn bộ ảnh trong `docs/images/screenshots/` (đồng bộ từ thư mục lưu trữ nội bộ `BAOCAO/images/`) là **ảnh chụp trực tiếp màn hình vận hành thật** của UniRequest-OS trên Docker/WSL2 và điện thoại di động qua Internet HTTPS:

| Tệp | Nội dung chụp thực tế |
| :--- | :--- |
| `GiaoDienLogin.png` | Giao diện đăng nhập tối giản với Logo 3D của UniRequest Portal |
| `LoginKeyCloak.png` | Màn hình xác thực tập trung Keycloak 26.0 OIDC PKCE `S256` |
| `Accouts.png` | Quản trị vai trò Realm Roles (`sinhvien`, `canbo`, `giangvien`) trên Keycloak |
| `TaoYeuCau.png` | Biểu mẫu Tạo yêu cầu mới tích hợp Trợ lý phân tuyến AI `[I]` và đồng bộ Phòng ban từ Keycloak |
| `SinhVien_K11A1.png` | Cổng Sinh viên thuộc `/Lớp/K11A1` chỉ xem đơn cá nhân |
| `SinhVien_K11A2.png` | Cổng Sinh viên thuộc `/Lớp/k11A2` cách ly hoàn toàn dữ liệu |
| `CTSV_Group.png` | Cổng Cán bộ thuộc Group `CTSV` độc lập phạm vi dữ liệu |
| `CongGiangVien_KETOAN.png` | Cổng Giảng viên/Cán bộ thuộc Group `KETOAN` tiếp nhận đúng đơn của Ban mình |
| `DemoQuaNginx.png` | Màn hình chạy thực tế trên điện thoại di động qua Internet HTTPS (`trycloudflare.com` -> Nginx Same-Origin Proxy) |
| `KestraFlow.png` | Bảng điều khiển Kestra OSS (`unirequest.dxos`) hiển thị 3 workflows trạng thái `Success` |
| `Docker_WSL_Remote.png` | Terminal WSL2 hiển thị 8 container đang chạy ổn định qua `make ps` |
| `Makefile.png` | Tập lệnh tự động hóa DevOps trong `Makefile` |
