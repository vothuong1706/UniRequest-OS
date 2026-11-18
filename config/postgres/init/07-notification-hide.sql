-- ==============================================================================
-- UniRequest-OS - Per-user Notification Read/Unread Toggle & Hide (Dismiss)
-- ==============================================================================

ALTER TABLE notification_reads
    ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE notification_reads
    ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_notification_reads_user_state
    ON notification_reads(username, is_read, is_hidden);
