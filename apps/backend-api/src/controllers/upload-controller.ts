import { Request, Response, NextFunction } from 'express';
import { storageService } from '../services/storage-service.js';
import { validateUploadedFileBuffer } from '../utils/file-security.js';

export class UploadController {
  /**
   * POST /api/upload
   * Kiểm dịch Magic Bytes trong RAM và tải tệp tin lên MinIO
   */
  async uploadFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          message: 'Không tìm thấy file tải lên trong request (tên trường quy định: "file")',
        });
        return;
      }

      const validation = validateUploadedFileBuffer({
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        buffer: req.file.buffer,
      });
      if (!validation.ok) {
        res.status(400).json({
          success: false,
          code: validation.code,
          message: validation.message,
        });
        return;
      }

      const uploadResult = await storageService.uploadFile(req.file);

      res.status(201).json({
        success: true,
        message: 'Tải tệp đính kèm thành công.',
        data: {
          url: uploadResult.url,
          filename: uploadResult.objectName,
          original_name: uploadResult.originalName,
          size: uploadResult.size,
          mimetype: uploadResult.mimeType,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/upload/files/:objectName
   * Phục vụ tệp đính kèm từ MinIO qua Same-Origin Proxy
   */
  async streamFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { objectName } = req.params;
      const { stream, contentType, size } = await storageService.getObjectStream(objectName);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', String(size));
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      stream.on('error', (streamError) => {
        if (!res.headersSent) {
          next(streamError);
        }
      });
      stream.pipe(res);
    } catch (error) {
      const errWithCode = error as Error & { code?: string; statusCode?: number };
      if (errWithCode?.code === 'NoSuchKey' || errWithCode?.code === 'NotFound') {
        res.status(404).json({
          success: false,
          message: 'Không tìm thấy tệp đính kèm.',
        });
        return;
      }
      if (errWithCode?.statusCode === 400) {
        res.status(400).json({
          success: false,
          message: errWithCode.message,
        });
        return;
      }
      next(error);
    }
  }
}

export const uploadController = new UploadController();
