# Bước 1: Phân tích Yêu cầu Bài toán Quản lý Yêu cầu tại Trường Đại học

Tài liệu này trình bày bước đầu tiên trong quy trình 7 bước phát triển dự án **UniRequest-OS: Nền tảng Quản lý Yêu cầu Đại học (Student Request Management)**: khảo sát thực tế tại trường đại học, xác định rõ **Ai dùng - Dùng cái gì - Dùng như thế nào**, phân nhóm yêu cầu chức năng (FR), phi chức năng (NFR) và các kịch bản nghiệm thu (`Given / When / Then`).

---

## 1. Hiện trạng Bài toán & Mục tiêu của Nhóm

Tại trường đại học, sinh viên và giảng viên thường xuyên cần gửi các yêu cầu hành chính và học vụ tới nhiều đơn vị khác nhau như Phòng Công tác Sinh viên (`CTSV`), Phòng Tài chính - Kế toán (`KETOAN`), Phòng Đào tạo (`DAOTAO`), Phòng Cơ sở Vật chất (`CSVC`) hay Trung tâm CNTT (`CNTT`). Khi tiếp nhận qua đơn giấy, email riêng lẻ hoặc nhóm chat:
- Sinh viên dễ gửi nhầm phòng ban, thiếu giấy tờ minh chứng và không theo dõi được tiến độ xử lý đơn.
- Cán bộ các phòng ban mất nhiều thời gian phân loại thủ công, dễ bỏ sót đơn sắp quá hạn xử lý và khó thống kê số liệu cuối ngày.
- Nhà trường thiếu một hạ tầng đăng nhập một lần (SSO) và điều phối quy trình nguồn mở có thể tái sử dụng cho nhiều phần mềm khác nhau.

---

## 2. Bảng Định vị Người dùng: Ai dùng - Dùng cái gì - Dùng như thế nào

| Ai dùng? (Nhóm người dùng) | Dùng cái gì? (Phân hệ sử dụng) | Dùng như thế nào? (Thao tác thực tế trên hệ thống) |
| :--- | :--- | :--- |
| **Sinh viên** (`sinhvien`, `sinhvien2`) | **Cổng Sinh viên** (`React 19 PWA` trên máy tính và điện thoại) | 1. Đăng nhập một lần qua Keycloak SSO (`PKCE S256`).<br>2. Nhập tiêu đề, mô tả yêu cầu và bấm **Gợi ý phân tuyến AI `[I]`** để hệ thống tự động điền gợi ý Phòng ban, Danh mục thủ tục và Độ ưu tiên.<br>3. Đính kèm file minh chứng (hệ thống kiểm tra chữ ký file thật `Magic Bytes` trong bộ nhớ trước khi lưu lên MinIO).<br>4. Theo dõi trạng thái xử lý trực tiếp, trao đổi bình luận 2 chiều với cán bộ, in phiếu xác nhận hoặc xóa đơn khỏi danh sách lịch sử cá nhân. |
| **Cán bộ / Giảng viên** (`canbo`, `giangvien`) | **Cổng Điều hành Phòng ban** (`CTSV`, `KETOAN`, `DAOTAO`...) | 1. Nhận thông báo trực tiếp qua Socket.IO và Web Push VAPID khi có đơn mới gửi về đúng phòng ban mình phụ trách.<br>2. Xem thẻ tóm tắt nội dung từ AI (`ai_insight`), kiểm tra file minh chứng và trạng thái toàn vẹn của chuỗi mã băm lịch sử `SHA-256` (`audit_integrity`).<br>3. Phê duyệt (`APPROVED`) hoặc Từ chối (`REJECTED` kèm lý do phản hồi) và tự thêm/sửa danh mục thủ tục riêng của phòng ban. |
| **Quản trị viên & Nhà trường** (`admin`) | **Keycloak Console, Kestra UI & Bảng thống kê `[D]`** | 1. Thêm hoặc điều chỉnh cây nhóm phòng ban trên Keycloak Console (giao diện cổng tự động đồng bộ qua `GET /api/departments`).<br>2. Giám sát 3 quy trình tự động trên Kestra (`unirequest.dxos`): tiếp nhận đơn mới, quét cảnh báo đơn quá hạn SLA và xuất báo cáo CSV cuối mỗi ngày lên MinIO.<br>3. Xem biểu đồ thống kê 7 ngày (`+07:00`) và chạy lệnh sao lưu / phục hồi dữ liệu kèm `SHA256SUMS`. |

---

## 3. Phân nhóm Yêu cầu Chức năng (FR) & Ưu tiên Thực hiện

| Mã YC | Tên yêu cầu chức năng | Mô tả chi tiết | Mức ưu tiên | Trạng thái |
| :---: | :--- | :--- | :---: | :---: |
| **FR-01** | Đăng nhập SSO & Phân nhóm Keycloak `[H]` | Xác thực OIDC `PKCE S256`, cấp JWT `RS256` chứa `roles` và `groups` (`full.path: true`). | Bắt buộc | Hoàn thành |
| **FR-02** | Đồng bộ cây phòng ban động `[P]` | API `GET /api/departments` đọc trực tiếp cây Group từ Keycloak Admin API để hiển thị trên biểu mẫu gửi đơn. | Bắt buộc | Hoàn thành |
| **FR-03** | Phân quyền dữ liệu 3 phạm vi `[H/P]` | Tách biệt dữ liệu theo 3 phạm vi `ALL`, `DEPARTMENT` (đệ quy nhóm con) và `PERSONAL` (cá nhân sinh viên). | Bắt buộc | Hoàn thành |
| **FR-04** | Quản lý danh mục riêng theo phòng ban `[P]` | Mỗi phòng ban tự tạo, sửa, bật/tắt danh mục thủ tục và cấu hình cờ bắt buộc đính kèm minh chứng (`requires_evidence`). | Bắt buộc | Hoàn thành |
| **FR-05** | Kiểm tra dữ liệu đầu vào ở cả giao diện và API `[P]` | Kiểm tra độ dài tiêu đề, mức độ ưu tiên, lý do khẩn cấp, file minh chứng và lý do từ chối đơn trước khi lưu CSDL. | Bắt buộc | Hoàn thành |
| **FR-06** | Xóa đơn độc lập ở 2 phía `[P/D]` | Hỗ trợ ẩn đơn riêng biệt cho người gửi (`hidden_by_sender`) và phòng ban nhận (`hidden_by_receiver`), tự dọn CSDL khi cả 2 phía cùng xóa. | Bắt buộc | Hoàn thành |
| **FR-07** | Điều phối 3 quy trình tự động Kestra `[P]` | Tự động ghi nhận vòng đời đơn (`unirequest-lifecycle`), quét nhắc việc đơn quá hạn SLA (`unirequest-sla-watchdog`) và xuất báo cáo CSV cuối mỗi ngày (`unirequest-daily-report`). | Bắt buộc | Hoàn thành |
| **FR-08** | Kiểm tra file `Magic Bytes` & Lịch sử `SHA-256` `[D]` | Kiểm tra chữ ký file thật trong bộ nhớ trước khi lưu lên MinIO; lưu lịch sử xử lý kèm mã băm `SHA-256` nối tiếp (`prev_hash -> entry_hash`). | Bắt buộc | Hoàn thành |
| **FR-09** | Gợi ý phân loại yêu cầu bằng AI `[I]` | API `POST /api/requests/ai-suggest` kết hợp Ollama nội bộ và bộ phân tích từ khóa tiếng Việt (`< 5ms`) để gợi ý Phòng ban, Danh mục và Độ ưu tiên. | Nên có | Hoàn thành |
| **FR-10** | Thông báo trực tiếp & Bình luận 2 chiều `[H]` | Cập nhật trạng thái đơn và bình luận trực tiếp qua Socket.IO kết hợp gửi thông báo đẩy Web Push VAPID theo đúng phòng ban. | Bắt buộc | Hoàn thành |

---

## 4. Yêu cầu Phi chức năng (NFR)

- **NFR-01 (Tuân thủ giấy phép nguồn mở OSI):** Toàn bộ mã nguồn phát hành theo giấy phép `Apache-2.0`; chỉ sử dụng các thành phần hạ tầng có giấy phép chuẩn OSI (`Keycloak`, `Kong OSS`, `Kestra OSS`, `PostgreSQL`, `Caddy`) và cô lập `MinIO` qua giao thức S3 HTTP.
- **NFR-02 (Hiệu năng & Tài nguyên):** Toàn bộ 8 container dịch vụ khởi chạy ổn định trên máy tính có từ `4 GB` RAM; bộ gợi ý phân loại tiếng Việt nội bộ phản hồi dưới `5ms`.
- **NFR-03 (Độ ổn định khi dịch vụ phụ chưa bật):** Khi Kestra hoặc Ollama tạm thời chưa sẵn sàng, hệ thống vẫn cho phép sinh viên tạo yêu cầu và lưu trữ an toàn vào PostgreSQL.
- **NFR-04 (Hỗ trợ truy cập qua Internet HTTPS):** Giao diện và API hoạt động đồng nhất qua một cổng giao diện duy nhất (`Same-Origin Proxy`), dùng thử được trên điện thoại di động qua kết nối HTTPS.

---

## 5. Kịch bản Sử dụng & Tiêu chí Nghiệm thu (`Given / When / Then`)

| # | Kịch bản (`User Story`) | Điều kiện ban đầu (`Given`) | Hành động (`When`) | Kết quả mong đợi (`Then`) |
| :---: | :--- | :--- | :--- | :--- |
| **1** | Sinh viên gửi yêu cầu hợp lệ | Sinh viên đã đăng nhập SSO và chọn phòng ban `CTSV` có thật trên Keycloak | Gửi `POST /api/requests` với tiêu đề >= 5 ký tự và đầy đủ thông tin | Trả về HTTP `201 Created`, lưu đơn `PENDING`, nối mã băm `SHA-256` từ `GENESIS`, kích hoạt Kestra và phát sự kiện Socket.IO cho `CTSV` |
| **2** | Chặn tiêu đề quá ngắn | Sinh viên đang ở biểu mẫu tạo yêu cầu | Gửi `POST /api/requests` với tiêu đề dưới 5 ký tự sau khi cắt khoảng trắng | Trả về HTTP `400 Bad Request` kèm mã lỗi `TITLE_TOO_SHORT` |
| **3** | Bắt buộc đính kèm minh chứng | Sinh viên chọn danh mục có bật `requires_evidence = true` (như miễn giảm học phí) | Gửi đơn không có `attachment_url` và mô tả ngắn dưới 15 ký tự | Trả về HTTP `400 Bad Request` kèm mã lỗi `EVIDENCE_REQUIRED` |
| **4** | Bắt buộc giải trình lý do khẩn cấp | Sinh viên chọn mức độ ưu tiên `URGENT` | Gửi đơn với phần mô tả lý do ngắn dưới 10 ký tự | Trả về HTTP `400 Bad Request` kèm mã lỗi `URGENT_REASON_REQUIRED` |
| **5** | Cán bộ từ chối đơn phải ghi rõ lý do | Cán bộ thuộc phòng ban phụ trách mở đơn đang ở trạng thái `PENDING` | Gửi `PUT /api/requests/:id/status` sang `REJECTED` nhưng `review_note` dưới 5 ký tự | Trả về HTTP `400 Bad Request` kèm mã lỗi `REJECT_REASON_REQUIRED` |
| **6** | Chặn truy cập chéo phòng ban | Cán bộ thuộc nhóm `/CTSV` đã đăng nhập | Gọi API xem, duyệt hoặc xóa một yêu cầu được gửi cho phòng `/KETOAN` | Trả về HTTP `403 Forbidden`, không cho phép đọc hoặc thay đổi dữ liệu của phòng ban khác |

> Bước tiếp theo: [Bước 2 - Thiết kế kiến trúc 3 tầng & CSDL 7 bảng](02-thiet-ke-kien-truc.md).
