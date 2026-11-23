import { Router } from 'express';
import { uploadController } from '../controllers/upload-controller.js';
import { authenticateToken } from '../middlewares/auth-middleware.js';
import { uploadMiddleware } from '../middlewares/upload-middleware.js';

export const uploadRouter = Router();

// GET /api/upload/files/:objectName - Proxy phục vụ tệp đính kèm từ MinIO qua Same-Origin HTTPS
uploadRouter.get('/files/:objectName', (req, res, next) =>
  uploadController.streamFile(req, res, next)
);

// POST /api/upload - Upload file lên MinIO
uploadRouter.post(
  '/',
  authenticateToken,
  uploadMiddleware.single('file'),
  (req, res, next) => uploadController.uploadFile(req, res, next)
);
