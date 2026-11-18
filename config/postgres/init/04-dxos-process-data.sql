-- ==============================================================================
-- UniRequest-OS - Phase C Migration: Process [P] & Data [D] (Poka-yoke + Audit Trail)
-- Idempotent migration safe for both fresh installs and existing PostgreSQL volumes
-- ==============================================================================

-- 1. Mở rộng bảng requests phục vụ phân loại, độ ưu tiên, lý do duyệt & đồng bộ Kestra
ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS category VARCHAR(50) NOT NULL DEFAULT 'ACADEMIC',
    ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(100),
    ADD COLUMN IF NOT EXISTS review_note TEXT,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS workflow_execution_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_requests_category ON requests(category);
CREATE INDEX IF NOT EXISTS idx_requests_priority ON requests(priority);

-- 2. Tạo bảng request_audit_logs (Nhật ký kiểm toán truy vết bất biến - Không gian [D])
CREATE TABLE IF NOT EXISTS request_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    actor VARCHAR(100) NOT NULL,
    actor_roles TEXT[] NOT NULL DEFAULT '{}',
    action VARCHAR(50) NOT NULL, -- 'CREATED', 'APPROVED', 'REJECTED', 'WORKFLOW_DISPATCHED'
    from_status VARCHAR(50),
    to_status VARCHAR(50),
    note TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON request_audit_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON request_audit_logs(created_at DESC);
