-- ============================================================================
-- Migration 12: Chỉ mục Vector ngữ nghĩa (request_embeddings) trên PostgreSQL 16
-- Phục vụ Trợ lý AI [I] tra cứu & rà soát hồ sơ theo mô hình Hybrid SQL + Vector
-- (Không cần container Vector DB riêng, tự động đồng bộ cùng make backup/restore)
-- ============================================================================

CREATE TABLE IF NOT EXISTS request_embeddings (
    request_id UUID PRIMARY KEY REFERENCES requests(id) ON DELETE CASCADE,
    content_hash VARCHAR(64) NOT NULL,
    source_text TEXT NOT NULL,
    provider VARCHAR(40) NOT NULL DEFAULT 'local-ngram-v1',
    dimensions INTEGER NOT NULL DEFAULT 256,
    embedding REAL[] NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_request_embeddings_updated_at
    ON request_embeddings(updated_at DESC);

DROP TRIGGER IF EXISTS trg_request_embeddings_updated_at ON request_embeddings;
CREATE TRIGGER trg_request_embeddings_updated_at
    BEFORE UPDATE ON request_embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
