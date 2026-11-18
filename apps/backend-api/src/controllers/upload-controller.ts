import { Request, Response, NextFunction } from 'express';
import { storageService } from '../services/storage-service.js';

export class UploadController {
  /**
   * POST /api/upload
   * Tải tệp tin lên MinIO và trả về URL công khai
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
}

export const uploadController = new UploadController();
