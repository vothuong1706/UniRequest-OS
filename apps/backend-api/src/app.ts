// SPDX-License-Identifier: Apache-2.0
import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/environment.js';
import { apiRouter } from './routes/index.js';
import { notFoundHandler, errorHandler } from './middlewares/error-middleware.js';

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

const TRYCLOUDFLARE_ORIGIN_REGEX = /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i;

export function isAllowedCorsOrigin(origin?: string): boolean {
  if (!origin) return true;
  if (DEFAULT_ALLOWED_ORIGINS.includes(origin)) return true;
  if (TRYCLOUDFLARE_ORIGIN_REGEX.test(origin)) return true;
  if (config.security.corsAllowedOrigins.includes(origin)) return true;
  return false;
}

export const createApp = (): Express => {
  const app = express();

  app.disable('x-powered-by');
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // Bật CORS kiểm soát theo danh sách origin hợp lệ (local dev, same-origin & trycloudflare HTTPS)
  app.use(
    cors({
      origin: (origin, callback) => {
        if (isAllowedCorsOrigin(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
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
