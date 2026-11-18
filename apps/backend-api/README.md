# UniRequest-OS Backend REST API

Mã nguồn Backend API cho hệ thống **UniRequest-OS (DX-OS Open-Core)**, xây dựng trên nền tảng **Node.js, Express, TypeScript và PostgreSQL**.

## 🛠 Công nghệ sử dụng
- **Runtime:** Node.js (TypeScript)
- **Web Framework:** Express.js
- **Database:** PostgreSQL qua driver `pg` (Connection Pool)
- **Object Storage:** MinIO S3 SDK (`minio`)
- **Authentication & Authorization:** Keycloak JWT Bearer Token verification qua RS256 Public Key (`jsonwebtoken`)
- **File Upload:** `multer` (Buffer in-memory streaming to MinIO)
- **Kiến trúc:** Layered Clean Architecture (Routes -> Controllers -> Services -> Config/Database)

## 📁 Cấu trúc thư mục
```text
apps/backend-api/
├── db/
│   └── init.sql                     # Script khởi tạo database schema (Phần 3)
├── src/
│   ├── config/
│   │   ├── environment.ts           # Cấu hình biến môi trường
│   │   ├── database.ts              # pg Pool & khởi tạo bảng requests
│   │   └── minio-client.ts          # MinIO Client & khởi tạo bucket unirequest-files
│   ├── controllers/
│   │   ├── request-controller.ts    # Controller xử lý nghiệp vụ yêu cầu
│   │   └── upload-controller.ts     # Controller xử lý upload tệp lên MinIO
│   ├── middlewares/
│   │   ├── auth-middleware.ts       # Middleware xác thực Keycloak JWT RS256
│   │   ├── role-middleware.ts       # Middleware phân quyền (sinhvien, canbo, giangvien)
│   │   ├── upload-middleware.ts     # Cấu hình Multer upload
│   │   └── error-middleware.ts      # Xử lý lỗi toàn cục và 404
│   ├── routes/
│   │   ├── index.ts                 # Master router (/api)
│   │   ├── request-routes.ts        # Định tuyến /api/requests
│   │   └── upload-routes.ts         # Định tuyến /api/upload
│   ├── services/
│   │   ├── request-service.ts       # Logic nghiệp vụ & truy vấn SQL requests
│   │   └── storage-service.ts       # Logic upload & sinh URL MinIO
│   ├── types/
│   │   ├── express.d.ts             # Mở rộng Request type của Express
│   │   └── request.ts               # Định nghĩa interface Request, DTO, User
│   ├── app.ts                       # Cấu hình ứng dụng Express
│   └── index.ts                     # Điểm khởi chạy server (port 4000)
├── Dockerfile                       # Multi-stage Docker build
├── package.json
└── tsconfig.json
```

## 🚀 Hướng dẫn cài đặt & Khởi chạy

### 1. Cài đặt thư viện
```bash
cd apps/backend-api
npm install
```

### 2. Cấu hình biến môi trường
Tạo file `.env` từ `.env.example`:
```bash
cp .env.example .env
```

### 3. Chạy môi trường phát triển (Development)
```bash
npm run dev
```

### 4. Build & Chạy môi trường Production
```bash
npm run build
npm start
```

## 📡 Danh sách API Endpoints

Tất cả các API nghiệp vụ đều có tiền tố `/api` và yêu cầu header `Authorization: Bearer <keycloak_token>`.

| Phương thức | Endpoint | Phân quyền | Mô tả |
|-------------|----------|------------|-------|
| `GET` | `/api/health` | Public | Kiểm tra trạng thái hoạt động của Backend, Database và MinIO |
| `POST` | `/api/requests` | Đã đăng nhập | Tạo yêu cầu mới (Tự động gán `created_by` từ Keycloak username, `status = PENDING`) |
| `GET` | `/api/requests` | `sinhvien` | Lấy danh sách yêu cầu do chính sinh viên tạo |
| `GET` | `/api/requests` | `canbo` / `giangvien` | Lấy toàn bộ danh sách yêu cầu hệ thống (sắp xếp mới nhất lên đầu) |
| `PUT` | `/api/requests/:id/status` | `canbo` / `giangvien` | Duyệt hoặc từ chối yêu cầu. Body: `{"status": "APPROVED"}` hoặc `{"status": "REJECTED"}` |
| `POST` | `/api/upload` | Đã đăng nhập | Upload file/ảnh vào bucket `unirequest-files` trên MinIO. Trả về public URL |
