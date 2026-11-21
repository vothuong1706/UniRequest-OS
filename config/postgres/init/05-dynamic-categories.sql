-- ==============================================================================
-- UniRequest-OS - Dynamic Request Categories & Custom Type Support
-- Idempotent migration safe for both fresh installs and existing PostgreSQL volumes
-- ==============================================================================

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

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS trg_request_categories_updated_at ON request_categories;
CREATE TRIGGER trg_request_categories_updated_at
    BEFORE UPDATE ON request_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Thêm cột lưu tên loại yêu cầu tự nhập khi người dùng chọn "Yêu cầu khác"
ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS custom_category_label VARCHAR(120);
