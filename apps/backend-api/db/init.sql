-- ==============================================================================
-- UniRequest-OS Database Schema (Unified Idempotent Reference v0.7.0)
-- File: apps/backend-api/db/init.sql
-- Đồng bộ hoàn toàn với config/postgres/init/02-init.sql -> 10-independent-request-hide.sql
-- Quy chuẩn: snake_case cho bảng và cột, id là UUID gen_random_uuid()
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Trigger helper cập nhật updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- 1. Bảng requests (kèm định tuyến target_department & xóa độc lập 2 phía)
CREATE TABLE IF NOT EXISTS requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL DEFAULT 'OTHER',
    custom_category_label VARCHAR(120),
    target_department VARCHAR(100),
    priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    status VARCHAR(50) DEFAULT 'PENDING',             -- 'PENDING', 'APPROVED', 'REJECTED'
    created_by VARCHAR(100) NOT NULL,                 -- Username từ Keycloak
    attachment_url TEXT,
    reviewed_by VARCHAR(100),
    review_note TEXT,
    reviewed_at TIMESTAMP,
    workflow_execution_id VARCHAR(100),
    hidden_by_sender BOOLEAN NOT NULL DEFAULT FALSE,
    hidden_by_receiver BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS category VARCHAR(50) NOT NULL DEFAULT 'OTHER',
    ADD COLUMN IF NOT EXISTS custom_category_label VARCHAR(120),
    ADD COLUMN IF NOT EXISTS target_department VARCHAR(100),
    ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(100),
    ADD COLUMN IF NOT EXISTS review_note TEXT,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS workflow_execution_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS hidden_by_sender BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS hidden_by_receiver BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_requests_created_by ON requests(created_by);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_category ON requests(category);
CREATE INDEX IF NOT EXISTS idx_requests_priority ON requests(priority);
CREATE INDEX IF NOT EXISTS idx_requests_target_department ON requests(target_department);
CREATE INDEX IF NOT EXISTS idx_requests_hidden_flags ON requests(hidden_by_sender, hidden_by_receiver);
CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(created_at DESC);

DROP TRIGGER IF EXISTS trg_requests_updated_at ON requests;
CREATE TRIGGER trg_requests_updated_at
    BEFORE UPDATE ON requests
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 2. Bảng request_audit_logs (Nhật ký kiểm toán bất biến - gồm CREATED, APPROVED, REJECTED, SLA_WARNING...)
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

-- 3. Bảng request_categories (Danh mục động tách riêng theo từng Phòng ban)
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

-- 4. Bảng notifications (Hỗ trợ thông báo cá nhân, theo vai trò & tách theo phòng ban)
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_username VARCHAR(100),
    recipient_role VARCHAR(30),
    recipient_department VARCHAR(150),
    request_id UUID REFERENCES requests(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'INFO',
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    actor VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS recipient_department VARCHAR(150);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_user
    ON notifications(recipient_username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_role
    ON notifications(recipient_role, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_department
    ON notifications(recipient_department, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_request_id
    ON notifications(request_id);

-- 5. Bảng notification_reads (Trạng thái đọc/chưa đọc/ẩn độc lập từng tài khoản)
CREATE TABLE IF NOT EXISTS notification_reads (
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    username VARCHAR(100) NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT TRUE,
    is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (notification_id, username)
);

ALTER TABLE notification_reads
    ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_notification_reads_username
    ON notification_reads(username);
CREATE INDEX IF NOT EXISTS idx_notification_reads_user_state
    ON notification_reads(username, is_read, is_hidden);

-- 6. Bảng request_comments (Bình luận trực tiếp trong chi tiết yêu cầu)
CREATE TABLE IF NOT EXISTS request_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    author_username VARCHAR(100) NOT NULL,
    author_role VARCHAR(30) NOT NULL DEFAULT 'sinhvien',
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_request_comments_request_id
    ON request_comments(request_id, created_at ASC);

-- 7. Bảng push_subscriptions (Web Push VAPID gắn nhóm phòng ban)
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) NOT NULL,
    roles TEXT[] NOT NULL DEFAULT '{}',
    groups TEXT[] NOT NULL DEFAULT '{}',
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE push_subscriptions
    ADD COLUMN IF NOT EXISTS groups TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_username
    ON push_subscriptions(username);

DROP TRIGGER IF EXISTS trg_push_subscriptions_updated_at ON push_subscriptions;
CREATE TRIGGER trg_push_subscriptions_updated_at
    BEFORE UPDATE ON push_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
