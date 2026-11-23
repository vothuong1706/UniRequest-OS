# Bước 5: Rà soát Chất lượng Mã nguồn, Kiểm thử Tích hợp & Đánh giá AI

Tài liệu này trình bày bước thứ năm trong quy trình 7 bước phát triển dự án **UniRequest-OS: Nền tảng Quản lý Yêu cầu Đại học (Student Request Management)**: rà soát chất lượng mã nguồn (`make lint`), kiểm thử tích hợp API (`RequestController`, `Kestra Callback`) và đánh giá độ chính xác của module gợi ý phân tuyến AI tiếng Việt.

---

## 1. Danh mục Rà soát Chất lượng Mã nguồn (`make lint`)

Nhóm thiết lập lệnh `make lint` trong [`Makefile`](../../Makefile) để tự động kiểm tra toàn bộ kho mã nguồn trước khi đóng gói:
- [x] **Kiểm tra kiểu dữ liệu TypeScript (`tsc -b` & `tsc --noEmit`):** Đảm bảo không có lỗi kiểu dữ liệu ở cả Frontend (`apps/demo-app`) và Backend (`apps/backend-api`).
- [x] **Kiểm tra quy tắc ESLint & React Hooks:** Không để biến thừa, import thừa hoặc lỗi phụ thuộc trong React Hooks.
- [x] **Kiểm tra định dạng Prettier (`prettier --check`):** Thống nhất định dạng mã nguồn toàn dự án.
- [x] **Kiểm tra đóng gói giao diện PWA (`vite build`):** Xác nhận đóng gói thành công bundle React 19 và sinh Service Worker (`sw.js`, `manifest.webmanifest`).
- [x] **Kiểm tra cấu hình hạ tầng:** Xác nhận cú pháp `docker-compose.yml` và cấu trúc JSON của `config/keycloak/realm-export.json` hợp lệ 100%.

---

## 2. Kiểm thử Tích hợp API & Nghiệm thu Kịch bản (`Given / When / Then`)

Nhóm sử dụng `Supertest` kết hợp `Vitest` để kiểm thử trực tiếp các tuyến HTTP REST API của Backend:

1. **Kiểm thử nghiệm thu `RequestController` ([`request-controller-acceptance.test.ts`](../../apps/backend-api/tests/request-controller-acceptance.test.ts) - `8/8` bài test PASS):**
   - Kiểm tra đầy đủ các trường hợp từ chối dữ liệu đầu vào không hợp lệ: `TITLE_TOO_SHORT`, `INVALID_PRIORITY`, `EVIDENCE_REQUIRED`, `URGENT_REASON_REQUIRED`, `INVALID_TARGET_DEPARTMENT`, `REJECT_REASON_REQUIRED` (`400 Bad Request`) và `ALREADY_PROCESSED` (`409 Conflict`).
   - Kiểm tra luồng tạo yêu cầu hợp lệ (`201 Created`): lưu yêu cầu vào CSDL, gắn mã thực thi `workflow_execution_id` trả về từ Kestra và phát sự kiện Socket.IO tới phòng ban tiếp nhận.
2. **Kiểm thử tích hợp Callback Kestra cảnh báo SLA ([`internal-kestra-routes.test.ts`](../../apps/backend-api/tests/internal-kestra-routes.test.ts) - `5/5` bài test PASS):**
   - Kiểm tra endpoint `POST /api/internal/kestra/sla-alert`: từ chối với HTTP `401` khi thiếu hoặc sai khóa nội bộ `x-kestra-key`.
   - Kiểm tra cơ chế tránh gửi cảnh báo lặp lại: nếu đơn quá hạn đã được ghi nhận `SLA_WARNING` gần đây trong `request_audit_logs`, API trả về `skipped: true` để không làm phiền cán bộ bằng nhiều thông báo trùng nhau.

---

## 3. Đánh giá Module Gợi ý Phân tuyến AI `[I]` trên Bộ Câu Mẫu Tiếng Việt

Module `AiTriageService` ([`ai-triage-service.ts`](../../apps/backend-api/src/services/ai-triage-service.ts)) được kiểm thử qua hai tệp [`ai-triage.test.ts`](../../apps/backend-api/tests/ai-triage.test.ts) (`6/6` PASS) và [`request-controller-acceptance.test.ts`](../../apps/backend-api/tests/request-controller-acceptance.test.ts) trên **bộ câu mẫu tiếng Việt để kiểm thử gợi ý của AI** gồm 5 nhóm phòng ban đại học (cả câu tiếng Việt có dấu và câu gõ không dấu):

| Nhóm phòng ban | Câu mẫu tiếng Việt đưa vào kiểm thử | Phòng ban & Danh mục AI gợi ý | Mức ưu tiên gợi ý | Kết quả |
| :--- | :--- | :--- | :---: | :---: |
| **Tài chính - Kế toán (`KETOAN`)** | *"Xin xuất lại biên lai thanh toán học phí học kỳ 2"* | `KETOAN` / `KETOAN_HOC_PHI` | `NORMAL` | **Chính xác** |
| **Công tác Sinh viên (`CTSV`)** | *"Xin cap giay xac nhan sinh vien va the BHYT (khong dau) - Can gap trong tuan nay de nop ho so vay von"* | `CTSV` / `CTSV_XAC_NHAN` | `HIGH` | **Chính xác** |
| **Đào tạo & Khảo thí (`DAOTAO`)** | *"Đơn xin phúc khảo điểm thi học phần Cấu trúc dữ liệu"* | `DAOTAO` / `DAOTAO_HOC_VU` | `HIGH` | **Chính xác** |
| **Cơ sở Vật chất (`CSVC`)** | *"Khẩn cấp: Chập điện và hỏng máy chiếu tại giảng đường B302"* | `CSVC` / `CSVC_SUA_CHUA` | `URGENT` | **Chính xác** |
| **Hỗ trợ CNTT (`CNTT`)** | *"Lỗi không đăng nhập được tài khoản SSO Keycloak và mất kết nối Wifi"* | `CNTT` / `CNTT_TAI_KHOAN` | `HIGH` | **Chính xác** |

- **Thời gian phản hồi thực tế:** Trung bình **`< 1 ms` / yêu cầu** (nhanh hơn nhiều so với ngưỡng mục tiêu `< 5 ms`), đảm bảo tính năng gợi ý AI hoạt động mượt mà ngay cả trên máy tính không có GPU.

> Bước tiếp theo: [Bước 6 - Kiểm tra an toàn thông tin](06-kiem-tra-bao-mat.md).
