import http from 'http';
import { createApp } from './app.js';
import { config } from './config/environment.js';
import { checkDatabaseConnection, ensureTablesExist, pool } from './config/database.js';
import { initMinioBucket } from './config/minio-client.js';
import { getKeycloakPublicKey } from './middlewares/auth-middleware.js';
import { initSocketServer } from './realtime/socket-server.js';
import { requestService } from './services/request-service.js';

const startServer = async () => {
  console.log('='.repeat(60));
  console.log(`🚀 Khởi động UniRequest-OS Backend API [Port: ${config.port}]`);
  console.log(`🌍 Môi trường: ${config.nodeEnv}`);
  console.log('='.repeat(60));

  // 1. Kiểm tra kết nối PostgreSQL và khởi tạo bảng nếu cần
  const isDbConnected = await checkDatabaseConnection();
  if (isDbConnected) {
    await ensureTablesExist();
    await requestService.backfillAuditHashChain();
  } else {
    console.warn('⚠️  Cảnh báo: Chưa thể kết nối PostgreSQL. Backend sẽ tiếp tục chạy và thử lại khi có request.');
  }

  // 2. Kiểm tra và khởi tạo bucket trên MinIO
  await initMinioBucket();

  // 3. Tải trước Public Key của Keycloak (nếu Keycloak đã sẵn sàng)
  try {
    await getKeycloakPublicKey();
    console.log('[Keycloak] Đã nạp thành công Public Key cho Realm unirequest.');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[Keycloak] Chưa thể lấy Public Key ngay lúc này (${msg}). Sẽ tự động lấy khi nhận request đầu tiên.`);
  }

  // 4. Khởi chạy HTTP Server + Socket.IO Realtime (/api/socket.io)
  const app = createApp();
  const server = http.createServer(app);
  initSocketServer(server);

  server.listen(config.port, () => {
    console.log(`✅ Backend API đang lắng nghe tại: http://0.0.0.0:${config.port}`);
    console.log(`📡 Endpoints sẵn sàng:`);
    console.log(`   - GET  /api/health`);
    console.log(`   - POST /api/requests`);
    console.log(`   - GET  /api/requests`);
    console.log(`   - PUT  /api/requests/:id/status`);
    console.log(`   - POST /api/upload`);
    console.log('='.repeat(60));
  });

  // Xử lý dừng máy chủ an toàn (Graceful Shutdown)
  const shutdown = async (signal: string) => {
    console.log(`\n[Shutdown] Nhận tín hiệu ${signal}. Đang đóng các kết nối...`);
    server.close(async () => {
      console.log('[Shutdown] HTTP server đã đóng.');
      await pool.end();
      console.log('[Shutdown] Database connection pool đã đóng.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

startServer().catch((err) => {
  console.error('❌ Lỗi nghiêm trọng khi khởi động backend:', err);
  process.exit(1);
});
