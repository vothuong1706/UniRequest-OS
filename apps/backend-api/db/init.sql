-- ==============================================================================
-- UniRequest-OS Database Schema (Full Reference)
-- File: apps/backend-api/db/init.sql
-- Quy chuẩn: snake_case cho bảng và cột, id là UUID gen_random_uuid()
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL DEFAULT 'OTHER',
    custom_category_label VARCHAR(120),
    priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    status VARCHAR(50) DEFAULT 'PENDING',             -- 'PENDING', 'APPROVED', 'REJECTED'
    created_by VARCHAR(100) NOT NULL,                 -- Username từ Keycloak
    attachment_url TEXT,
    reviewed_by VARCHAR(100),
    review_note TEXT,
    reviewed_at TIMESTAMP,
    workflow_execution_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_requests_created_by ON requests(created_by);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_category ON requests(category);
CREATE INDEX IF NOT EXISTS idx_requests_priority ON requests(priority);
CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(created_at DESC);

CREATE TABLE IF NOT EXISTS request_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    actor VARCHAR(100) NOT NULL,
    actor_roles TEXT[] NOT NULL DEFAULT '{}',
    action VARCHAR(50) NOT NULL,
    from_status VARCHAR(50),
    to_status VARCHAR(50),
    note TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON request_audit_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON request_audit_logs(created_at DESC);

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

CREATE TABLE IF NOT EXISTS request_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(60) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    department VARCHAR(150) NOT NULL,
    sla_hours INT NOT NULL DEFAULT 24,
    requires_evidence BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 100,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_request_categories_active ON request_categories(is_active, sort_order);

DROP TRIGGER IF EXISTS trg_request_categories_updated_at ON request_categories;
CREATE TRIGGER trg_request_categories_updated_at
    BEFORE UPDATE ON request_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

INSERT INTO request_categories (code, name, department, sla_hours, requires_evidence, is_active, sort_order)
VALUES
    ('ENROLLMENT_CERT',     'Giấy xác nhận sinh viên',       'Phòng Công tác Sinh viên',  24, FALSE, TRUE, 10),
    ('ACADEMIC_REG',        'Học vụ & Đăng ký tín chỉ',      'Phòng Đào tạo',             24, FALSE, TRUE, 20),
    ('GRADE_REVIEW',        'Phúc khảo & Bảng điểm',         'Phòng Khảo thí & ĐBCL',     48, FALSE, TRUE, 30),
    ('TUITION_SCHOLARSHIP', 'Học phí & Học bổng',            'Phòng Tài chính - Kế toán', 24, FALSE, TRUE, 40),
    ('FACILITY_REPAIR',     'Báo hỏng cơ sở vật chất',       'Phòng Quản trị Thiết bị',   12, TRUE,  TRUE, 50),
    ('ROOM_BOOKING',        'Mượn phòng học / Hội trường',   'Phòng Hành chính - Tổng hợp', 24, FALSE, TRUE, 60),
    ('DORM_SUPPORT',        'Ký túc xá & Nội trú',           'Ban Quản lý Ký túc xá',     24, FALSE, TRUE, 70),
    ('IT_ACCOUNT',          'Hỗ trợ CNTT & Tài khoản',       'Trung tâm Công nghệ TT',    12, FALSE, TRUE, 80),
    ('OTHER',               'Yêu cầu khác',                  'Văn phòng Trường',          24, FALSE, TRUE, 999)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_username VARCHAR(100),
    recipient_role VARCHAR(30),
    request_id UUID REFERENCES requests(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'INFO',
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    actor VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notification_reads (
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    username VARCHAR(100) NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT TRUE,
    is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (notification_id, username)
);

CREATE TABLE IF NOT EXISTS request_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    author_username VARCHAR(100) NOT NULL,
    author_role VARCHAR(30) NOT NULL DEFAULT 'sinhvien',
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) NOT NULL,
    roles TEXT[] NOT NULL DEFAULT '{}',
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
