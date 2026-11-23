// SPDX-License-Identifier: Apache-2.0
import { Request, Response, NextFunction } from 'express';
import { verifyKeycloakJwt } from '../middlewares/auth-middleware.js';
import { storageService } from '../services/storage-service.js';
import {
  signAttachmentUrl,
  verifyAttachmentSignature,
} from '../utils/attachment-signing.js';
import { validateUploadedFileBuffer } from '../utils/file-security.js';

export class UploadController {
  /**
   * POST /api/upload
   * Kiểm dịch Magic Bytes trong RAM và tải tệp tin lên MinIO (Private bucket)
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
      const signedUrl = signAttachmentUrl(uploadResult.url) || uploadResult.url;

      res.status(201).json({
        success: true,
        message: 'Tải tệp đính kèm thành công.',
        data: {
          url: signedUrl,
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
   * Phục vụ tệp đính kèm từ MinIO Private Bucket qua Same-Origin Proxy.
   * Yêu cầu chữ ký HMAC ngắn hạn (?exp=...&sig=...) HOẶC Bearer JWT hợp lệ.
   */
  async streamFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { objectName } = req.params;
      const hasValidSignature = verifyAttachmentSignature(
        objectName,
        req.query.exp,
        req.query.sig
      );

      if (!hasValidSignature) {
        const authHeader = req.headers.authorization;
        let hasValidJwt = false;
        if (authHeader && authHeader.startsWith('Bearer ')) {
          try {
            await verifyKeycloakJwt(authHeader.substring(7).trim());
            hasValidJwt = true;
          } catch {
            hasValidJwt = false;
          }
        }

        if (!hasValidJwt) {
          res.status(401).json({
            success: false,
            code: 'ATTACHMENT_AUTH_REQUIRED',
            message:
              'Liên kết tệp đính kèm thiếu chữ ký xác thực, không hợp lệ hoặc đã hết hạn.',
          });
          return;
        }
      }

      const { stream, contentType, size } = await storageService.getObjectStream(objectName);

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', String(size));
      res.setHeader('Cache-Control', 'private, max-age=300');
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
