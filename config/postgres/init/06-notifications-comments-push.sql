-- ==============================================================================
-- UniRequest-OS - Notifications, Request Comments & Web Push Subscriptions
-- Idempotent migration safe for both fresh installs and existing PostgreSQL volumes
-- ==============================================================================

-- 1. Bảng thông báo hệ thống (hỗ trợ cả thông báo cá nhân & thông báo nhóm theo vai trò)
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

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_user
    ON notifications(recipient_username, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_role
    ON notifications(recipient_role, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_request_id
    ON notifications(request_id);

-- 2. Bảng ghi nhận trạng thái đã đọc theo từng tài khoản (Cán bộ A đọc không mất trạng thái của Cán bộ B)
CREATE TABLE IF NOT EXISTS notification_reads (
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    username VARCHAR(100) NOT NULL,
    read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (notification_id, username)
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_username
    ON notification_reads(username);

-- 3. Bảng bình luận / trao đổi trực tiếp trong từng yêu cầu
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

-- 4. Bảng lưu đăng ký Web Push Notification (VAPID) cho từng thiết bị người dùng
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

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_username
    ON push_subscriptions(username);

DROP TRIGGER IF EXISTS trg_push_subscriptions_updated_at ON push_subscriptions;
CREATE TRIGGER trg_push_subscriptions_updated_at
    BEFORE UPDATE ON push_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
