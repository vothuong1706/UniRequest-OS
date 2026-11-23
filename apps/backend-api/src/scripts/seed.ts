// SPDX-License-Identifier: Apache-2.0
import { checkDatabaseConnection, ensureTablesExist, pool } from '../config/database.js';
import { seedDemoData } from '../utils/seed-demo-data.js';

const runSeedCli = async () => {
  console.log('🌱 Đang nạp dữ liệu mẫu idempotent cho UniRequest-OS...');
  const connected = await checkDatabaseConnection();
  if (!connected) {
    console.error('❌ Không thể kết nối PostgreSQL để nạp dữ liệu mẫu.');
    process.exit(1);
  }

  await ensureTablesExist();
  const summary = await seedDemoData();

  console.log(
    `✅ Hoàn tất nạp dữ liệu mẫu (idempotent): +${summary.categoriesInserted} danh mục, +${summary.requestsInserted} yêu cầu, +${summary.auditLogsInserted} bản ghi audit SHA-256, +${summary.commentsInserted} bình luận, +${summary.notificationsInserted} thông báo.`
  );

  await pool.end();
};

runSeedCli().catch(async (error) => {
  console.error('❌ Lỗi khi chạy script seed dữ liệu mẫu:', error);
  await pool.end().catch(() => {});
  process.exit(1);
});
