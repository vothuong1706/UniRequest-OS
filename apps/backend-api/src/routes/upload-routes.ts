import { Router } from 'express';
import { uploadController } from '../controllers/upload-controller.js';
import { authenticateToken } from '../middlewares/auth-middleware.js';
import { uploadMiddleware } from '../middlewares/upload-middleware.js';

export const uploadRouter = Router();

// POST /api/upload - Upload file lên MinIO
uploadRouter.post(
  '/',
  authenticateToken,
  uploadMiddleware.single('file'),
  (req, res, next) => uploadController.uploadFile(req, res, next)
);
