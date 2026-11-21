-- ==============================================================================
-- UniRequest-OS - Department-Scoped Notifications & Push Subscriptions
-- Idempotent migration safe for both fresh installs and existing PostgreSQL volumes
-- ==============================================================================

ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS recipient_department VARCHAR(150);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_department
    ON notifications(recipient_department, created_at DESC);

ALTER TABLE push_subscriptions
    ADD COLUMN IF NOT EXISTS groups TEXT[] NOT NULL DEFAULT '{}';
