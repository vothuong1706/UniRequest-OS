-- ==============================================================================
-- UniRequest-OS Database Schema (Phần 3)
-- File: 02-init.sql
-- Quy chuẩn: snake_case cho bảng và cột, id là UUID gen_random_uuid()
-- ==============================================================================

-- Kích hoạt extension pgcrypto để hỗ trợ gen_random_uuid() (nếu cần)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tạo bảng requests
CREATE TABLE IF NOT EXISTS requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
    created_by VARCHAR(100) NOT NULL,    -- Username từ Keycloak
    attachment_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chỉ mục hỗ trợ truy vấn theo người tạo (dành cho sinh viên)
CREATE INDEX IF NOT EXISTS idx_requests_created_by ON requests(created_by);

-- Chỉ mục hỗ trợ lọc theo trạng thái
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);

-- Chỉ mục hỗ trợ sắp xếp theo thời gian tạo mới nhất
CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(created_at DESC);

-- Tự động cập nhật cột updated_at khi có thao tác UPDATE
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS trg_requests_updated_at ON requests;
CREATE TRIGGER trg_requests_updated_at
    BEFORE UPDATE ON requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
