# Bước 4: Thiết kế & Kết quả Kiểm thử Đơn vị (Unit Test)

Tài liệu này trình bày bước thứ tư trong quy trình 7 bước phát triển dự án **UniRequest-OS: Nền tảng Quản lý Yêu cầu Đại học (Student Request Management)**: thiết kế và thực thi bộ kiểm thử đơn vị (Unit Test) bằng `Vitest` theo cấu trúc *Arrange - Act - Assert* cho cả 3 nhóm kịch bản: luồng hợp lệ (*Happy Path*), trường hợp biên (*Edge Case*) và trường hợp lỗi (*Error Case*).

---

## 1. Phương pháp Kiểm thử Đơn vị của Nhóm

- **Công cụ sử dụng:** `Vitest` cho cả Backend (`apps/backend-api/tests/`) và Frontend (`apps/demo-app/src/**/__tests__/`).
- **Chạy độc lập không cần bật Docker:** Các phụ thuộc bên ngoài như kết nối PostgreSQL, Keycloak Admin API hay dịch vụ Ollama được mô phỏng (*mock/stub*) hoặc kiểm thử trực tiếp trên các hàm xử lý thuần túy để lệnh `make unit-test` chạy xong trong chưa đầy 2 giây trên mọi máy tính.
- **Phân loại đủ 3 nhóm kịch bản:**
  1. **Luồng hợp lệ (*Happy Path*):** Dữ liệu đầu vào đúng định dạng, người dùng có quyền hợp lệ.
  2. **Trường hợp biên (*Edge Case*):** Chuỗi có khoảng trắng đầu/cuối, nhóm phòng ban nhiều cấp cha-con (`/Phòng Đào tạo/Tổ Học vụ`), tiếng Việt không dấu, xóa đơn khi chỉ một phía bấm xóa.
  3. **Trường hợp lỗi (*Error Case*):** Không đủ quyền truy cập, phòng ban không tồn tại, file thực thi `.exe` đổi đuôi `.png`, chuỗi mã băm lịch sử `SHA-256` bị sửa đổi trái phép.

---

## 2. Bảng Chi tiết Các Bài Kiểm thử Đơn vị Cốt lõi

| Tệp kiểm thử | Module được kiểm tra | Kịch bản Happy Path / Edge Case / Error Case | Số bài test | Kết quả |
| :--- | :--- | :--- | :---: | :---: |
| [`request-scope.test.ts`](../../apps/backend-api/tests/request-scope.test.ts) | `resolveRequestAccessScope` & `canAccessDepartmentRequest` | - *Happy Path:* `admin` nhận phạm vi `ALL`; `canbo` thuộc `/CTSV` nhận `DEPARTMENT`; `sinhvien` nhận `PERSONAL`.<br>- *Edge Case:* Cán bộ thuộc nhóm cha `/CTSV` xem được đơn của nhóm con `/CTSV/Tổ Học bổng` (khớp đệ quy).<br>- *Error Case:* Sinh viên thuộc `/Lớp/K11A1` bị chặn xem đơn của `/Lớp/k11A2`; cán bộ `CTSV` bị chặn xem đơn `KETOAN`. | **8** | **8/8 PASS** |
| [`category-scope.test.ts`](../../apps/backend-api/tests/category-scope.test.ts) | `category-controller.ts` & `category-service.ts` | - *Happy Path:* Cán bộ `CTSV` tạo/sửa danh mục thuộc phòng ban `CTSV`.<br>- *Edge Case:* Admin tạo được danh mục cho bất kỳ phòng ban nào.<br>- *Error Case:* Cán bộ `CTSV` bị chặn (`403 Forbidden`) khi cố sửa hoặc xóa danh mục của phòng `KETOAN`. | **3** | **3/3 PASS** |
| [`independent-delete.test.ts`](../../apps/backend-api/tests/independent-delete.test.ts) | `deleteRequests` trong `request-service.ts` | - *Happy Path:* Sinh viên xóa đơn chỉ bật `hidden_by_sender = TRUE` (cán bộ vẫn thấy đơn).<br>- *Edge Case:* Khi cả sinh viên và cán bộ đều bấm xóa (`hidden_by_sender` và `hidden_by_receiver` cùng `TRUE`), hệ thống tự xóa bản ghi khỏi PostgreSQL.<br>- *Error Case:* Cán bộ phòng ban khác cố xóa đơn bị từ chối (`forbidden: true`). | **4** | **4/4 PASS** |
| [`file-security.test.ts`](../../apps/backend-api/tests/file-security.test.ts) | `inspectUploadedFile` trong `file-security.ts` | - *Happy Path:* Chấp nhận file PDF, PNG, JPEG, DOCX có chữ ký `Magic Bytes` khớp định dạng thật.<br>- *Error Case:* Chặn file thực thi `.exe` (chữ ký `MZ`) đổi tên thành `minh-chung.png`; chặn file `.svg` và `.html` chứa mã kịch bản XSS. | **4** | **4/4 PASS** |
| [`audit-hash-chain.test.ts`](../../apps/backend-api/tests/audit-hash-chain.test.ts) | `computeAuditEntryHash` & `verifyAuditChain` | - *Happy Path:* Xác minh chuỗi mã băm `SHA-256` nối tiếp từ `GENESIS -> CREATED -> APPROVED` trả về `valid: true`.<br>- *Error Case:* Khi một bản ghi bị sửa trường `to_status` hoặc `note` trực tiếp trong CSDL, `verifyAuditChain()` phát hiện ngay vị trí đứt chuỗi (`valid: false`, `broken_at_index`). | **3** | **3/3 PASS** |
| [`priority.test.ts`](../../apps/demo-app/src/features/requests/utils/__tests__/priority.test.ts) | `priority.ts` (Giao diện React) | Chuẩn hóa nhãn và màu sắc mức độ ưu tiên (`NORMAL`, `HIGH`, `URGENT`), xử lý an toàn khi giá trị đầu vào không xác định. | **4** | **4/4 PASS** |
| [`format.test.ts`](../../apps/demo-app/src/lib/__tests__/format.test.ts) | `format.ts` (Giao diện React) | Định dạng ngày giờ theo chuẩn múi giờ `Asia/Ho_Chi_Minh (+07:00)` và tự động chuyển đổi địa chỉ dịch vụ `resolveServiceUrl()` khi chạy qua HTTPS Same-Origin. | **5** | **5/5 PASS** |

> Bước tiếp theo: [Bước 5 - Rà soát chất lượng mã nguồn & Kiểm thử tích hợp](05-review-kiem-thu.md).
