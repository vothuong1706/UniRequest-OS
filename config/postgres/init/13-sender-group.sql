-- ============================================================================
-- Migration 13: Lưu nhãn Lớp / Nhóm của người gửi (sender_group) từ Keycloak
-- Ví dụ: sinh viên thuộc /Lớp/K11A1 -> sender_group = 'K11A1'
-- Giúp Cán bộ / Giảng viên & Trợ lý AI gom nhóm chính xác theo Lớp/Đơn vị gửi
-- ============================================================================

ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS sender_group VARCHAR(150);

CREATE INDEX IF NOT EXISTS idx_requests_sender_group
    ON requests(sender_group);
