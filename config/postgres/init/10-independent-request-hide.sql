-- ==============================================================================
-- UniRequest-OS - Two-Sided Independent Request Soft-Delete
-- Idempotent migration safe for both fresh installs and existing PostgreSQL volumes
-- ==============================================================================

ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS hidden_by_sender BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS hidden_by_receiver BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_requests_hidden_flags
    ON requests(hidden_by_sender, hidden_by_receiver);
