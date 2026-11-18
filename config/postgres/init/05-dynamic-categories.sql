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

-- Nạp sẵn 9 danh mục đại học thực tế (idempotent theo code)
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
