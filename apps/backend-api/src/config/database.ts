// SPDX-License-Identifier: Apache-2.0
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { config } from './environment.js';

const { Pool } = pg;

const SAFE_TZ_REGEX = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/;
const sessionTimeZone = SAFE_TZ_REGEX.test(config.timezone)
  ? config.timezone
  : 'Asia/Ho_Chi_Minh';

export const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.name,
  options: `-c timezone=${sessionTimeZone}`,
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
  try {
    const schemaPath = path.resolve(__dirname, '../../db/init.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
    await query(schemaSql);
    console.log('[Database] Kiểm tra và đồng bộ toàn bộ schema CSDL (db/init.sql) hoàn tất.');
  } catch (error) {
    console.error('[Database] Lỗi khi đồng bộ schema CSDL:', error);
  }
};
