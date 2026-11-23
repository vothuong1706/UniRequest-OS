-- ==============================================================================
-- UniRequest-OS Migration 11: SHA-256 Immutable Audit Hash Chain (Tầng 1 Ledger)
-- Bổ sung prev_hash & entry_hash để phát hiện chỉnh sửa dữ liệu lịch sử trái phép.
-- ==============================================================================

ALTER TABLE request_audit_logs
    ADD COLUMN IF NOT EXISTS prev_hash VARCHAR(64),
    ADD COLUMN IF NOT EXISTS entry_hash VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_audit_logs_request_chain
    ON request_audit_logs(request_id, created_at ASC, id ASC);
