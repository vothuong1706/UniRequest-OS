import express, { Express } from 'express';
import cors from 'cors';
import { config } from './config/environment.js';
import { apiRouter } from './routes/index.js';
import { notFoundHandler, errorHandler } from './middlewares/error-middleware.js';

export const createApp = (): Express => {
  const app = express();

  // Bật CORS cho phép frontend kết nối (bao gồm PATCH cho toggle/read/hide)
  app.use(
    cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
    })
  );

  // Phân tích dữ liệu JSON và form-urlencoded trong request body
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Middleware ghi nhận request theo múi giờ +7 kèm X-Correlation-ID từ Kong
  app.use((req, _res, next) => {
    const localTime = new Date().toLocaleString('sv-SE', {
      timeZone: config.timezone,
    });
    const correlationId = req.headers['x-correlation-id'];
    const corrTag =
      typeof correlationId === 'string' && correlationId.trim()
        ? ` [corr=${correlationId.trim()}]`
        : '';
    console.log(`[${localTime} +07:00]${corrTag} ${req.method} ${req.originalUrl}`);
    next();
  });

  // Gắn router chính với tiền tố /api
  app.use('/api', apiRouter);

  // Xử lý 404 khi không tìm thấy route
  app.use(notFoundHandler);

  // Xử lý lỗi toàn cục
  app.use(errorHandler);

  return app;
};
