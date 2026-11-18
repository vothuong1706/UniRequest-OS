# UniRequest-OS Frontend (`apps/demo-app`)

Giao diện Cổng Tiếp nhận & Xử lý Yêu cầu Đại học xây dựng bằng **React 19 + TypeScript strict + Vite 8 + Tailwind CSS v4 + Shadcn/UI (Radix UI)**.

## Kiến trúc thư mục

```text
src/
├── auth/                # Khởi tạo & gia hạn token Keycloak SSO (PKCE S256)
├── components/
│   ├── layout/          # Shadcn-Admin Sidebar Inset & Breadcrumb Shell
│   ├── theme/           # ThemeProvider (Sáng / Tối / Hệ thống)
│   └── ui/              # Shadcn/UI Radix primitives (New York style)
├── features/
│   ├── auth/            # Màn hình đăng nhập Keycloak SSO
│   ├── dashboard/       # Trang Tổng quan (4 KPI + Yêu cầu gần đây)
│   └── requests/        # Biểu mẫu tạo yêu cầu, danh sách, chi tiết & duyệt
├── lib/                 # Tiện ích định dạng & hàm gộp class cn()
└── services/            # fetchWithAuth & API Client kết nối Kong Gateway
```

## Lệnh phát triển & kiểm tra Clean Code

```bash
npm run dev           # Khởi chạy máy chủ phát triển Vite
npm run typecheck     # Kiểm tra kiểu TypeScript strict (tsc -b)
npm run lint          # Kiểm tra ESLint strict
npm run format:check  # Kiểm tra chuẩn định dạng Prettier
npm run build         # Kiểm tra kiểu và build production
```
