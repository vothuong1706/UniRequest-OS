import pg from 'pg';
import { config } from './environment.js';

const { Pool } = pg;

export const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.name,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[Database] Lỗi kết nối PostgreSQL đột ngột:', err.message);
});

export const query = async (text: string, params?: unknown[]) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (config.nodeEnv === 'development') {
    console.log('[Database Query]', { text, duration: `${duration}ms`, rows: res.rowCount });
  }
  return res;
};

export const checkDatabaseConnection = async (): Promise<boolean> => {
  try {
    const client = await pool.connect();
    console.log('[Database] Kết nối PostgreSQL thành công!');
    client.release();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Database] Không thể kết nối PostgreSQL:', message);
    return false;
  }
};

export const ensureTablesExist = async (): Promise<void> => {
  const createTableSql = `
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    CREATE TABLE IF NOT EXISTS requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(50) DEFAULT 'PENDING',
        created_by VARCHAR(100) NOT NULL,
        attachment_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_requests_created_by ON requests(created_by);
    CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
    CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(created_at DESC);
  `;
  try {
    await query(createTableSql);
    console.log('[Database] Kiểm tra và khởi tạo bảng requests hoàn tất.');
  } catch (error) {
    console.error('[Database] Lỗi khi tạo bảng requests:', error);
  }
};
