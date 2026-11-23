# Bước 3: Lập trình Từng Module, Quản lý Cấu hình & Thiết kế Giao diện

Tài liệu này trình bày bước thứ ba trong quy trình 7 bước phát triển dự án **UniRequest-OS: Nền tảng Quản lý Yêu cầu Đại học (Student Request Management)**: quy chuẩn lập trình từng module, quản lý biến môi trường không ghi cứng trong code, cơ chế dự phòng khi Kestra/Ollama chưa bật và thiết kế giao diện trực quan dễ dùng.

---

## 1. Quy chuẩn Lập trình & Quản lý Biến Môi trường

Khi lập trình `apps/backend-api` và `apps/demo-app`, nhóm tuân thủ các quy tắc:
1. **Tách rõ tầng điều khiển và tầng xử lý nghiệp vụ:** Các controller (`request-controller.ts`, `category-controller.ts`, `upload-controller.ts`, `comment-controller.ts`, `notification-controller.ts`) chỉ phụ trách đọc request, kiểm tra dữ liệu đầu vào và trả HTTP response; toàn bộ truy vấn SQL và logic phân quyền nằm trong `services/`.
2. **Không ghi cứng thông tin cấu hình hay mật khẩu trong code:** Toàn bộ mật khẩu cơ sở dữ liệu, tài khoản quản trị Keycloak, khóa MinIO, khóa webhook Kestra, khóa VAPID và cấu hình AI (`AI_ENABLED`, `OLLAMA_URL`, `OLLAMA_MODEL`, `AI_TIMEOUT_MS`) đều được khai báo mẫu trong [`.env.example`](../../.env.example), truyền qua [`docker-compose.yml`](../../docker-compose.yml) và đọc tập trung tại [`apps/backend-api/src/config/environment.ts`](../../apps/backend-api/src/config/environment.ts).
3. **Đồng bộ múi giờ Việt Nam (`+07:00`):** Toàn bộ container Docker, kết nối PostgreSQL, quy trình Kestra và hàm định dạng thời gian trên giao diện ([`apps/demo-app/src/lib/format.ts`](../../apps/demo-app/src/lib/format.ts)) đều thống nhất dùng múi giờ `Asia/Ho_Chi_Minh (+07:00)`.

---

## 2. Cơ chế Dự phòng An toàn khi Dịch vụ Phụ chưa Bật

Nhóm thiết kế các module kết nối bên ngoài theo hướng không làm gián đoạn thao tác gửi đơn của sinh viên:
- **Dự phòng khi Kestra đang khởi động hoặc mất kết nối (`workflow-service.ts`):** Khi sinh viên tạo yêu cầu mới, dữ liệu đơn và bản ghi lịch sử `SHA-256` được lưu vào PostgreSQL trước. Nếu lệnh gọi webhook sang Kestra gặp lỗi mạng hoặc quá thời gian chờ, hệ thống ghi nhận log cảnh báo và vẫn trả về `201 Created` để đơn nằm an toàn trong hàng đợi của phòng ban.
- **Dự phòng khi máy chủ không chạy Ollama (`ai-triage-service.ts`):** Khi người dùng bấm nút **Gợi ý phân tuyến AI `[I]`**, Backend gọi `OLLAMA_URL` với thời gian chờ tối đa `AI_TIMEOUT_MS` (`3500ms`). Nếu máy chấm thi chưa bật Ollama hoặc không có GPU, hệ thống tự động chuyển ngay sang bộ phân tích từ khóa tiếng Việt nội bộ (`analyzeRequestWithRuleEngine`) với độ trễ trung bình dưới `1ms`, hỗ trợ cả câu tiếng Việt có dấu và không dấu.

---

## 3. Thiết kế Giao diện Người dùng Trực quan & Dễ Thao tác (`apps/demo-app`)

Giao diện **UniRequest Portal** được nhóm xây dựng bằng `React 19 + Tailwind CSS + Shadcn/UI` với các cải tiến giúp sinh viên và cán bộ thao tác nhanh, ít nhầm lẫn:
1. **Định hướng rõ theo vai trò người dùng:** Màn hình đăng nhập gọn gàng, điều hướng một chạm sang Keycloak SSO; sau khi đăng nhập, thanh điều hướng tự động hiển thị đúng chức năng theo vai trò (*Cổng Sinh viên* hoặc *Cổng Điều hành Phòng ban*).
2. **Hỗ trợ điền nhanh bằng AI `[I]`:** Khi sinh viên nhập tiêu đề và mô tả yêu cầu, nút **"Gợi ý phân tuyến AI"** giúp tự động chọn *Phòng ban tiếp nhận, Danh mục thủ tục, Mức độ ưu tiên* kèm lời giải thích lý do phân loại rõ ràng.
3. **Lọc danh mục tự động theo phòng ban đang chọn:** Khi sinh viên đổi phòng ban tiếp nhận, danh sách loại yêu cầu tự động lọc theo đúng phòng ban đó để tránh chọn nhầm danh mục của ban khác.
4. **Cập nhật trực tiếp không cần tải lại trang:** Thông báo mới, trạng thái duyệt đơn và bình luận trao đổi 2 chiều đều cập nhật tức thì qua Socket.IO; chữ số thống kê dùng kiểu hiển thị `tabular-nums` rõ ràng và hỗ trợ đầy đủ hai chế độ giao diện Sáng / Tối.
5. **Giữ nguyên dữ liệu khi báo lỗi & Xóa đơn an toàn:** Khi thiếu thông tin bắt buộc, biểu mẫu hiển thị thông báo nhắc lỗi ngay bên dưới trường nhập mà không làm mất nội dung sinh viên đã gõ; thao tác xóa đơn áp dụng cơ chế ẩn độc lập 2 phía (`hidden_by_sender` / `hidden_by_receiver`) kèm hộp thoại xác nhận rõ ràng.
6. **Hiển thị trạng thái toàn vẹn lịch sử & In phiếu xác nhận:** Màn hình chi tiết yêu cầu hiển thị trạng thái kiểm tra chuỗi mã băm **`SHA-256 Verified`** (`audit_integrity.valid = true`) và hỗ trợ sinh viên in phiếu xác nhận yêu cầu.

> Bước tiếp theo: [Bước 4 - Kiểm thử đơn vị (Unit Test)](04-unit-test.md).
