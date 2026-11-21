-- ==============================================================================
-- UniRequest-OS - Department Routing Support (Định tuyến yêu cầu theo Phòng ban)
-- Idempotent migration safe for both fresh installs and existing PostgreSQL volumes
-- ==============================================================================

ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS target_department VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_requests_target_department
    ON requests(target_department);
