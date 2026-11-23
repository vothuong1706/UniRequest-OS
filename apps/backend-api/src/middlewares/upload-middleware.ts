// SPDX-License-Identifier: Apache-2.0
import multer from 'multer';
import { isAllowedExtension } from '../utils/file-security.js';

// Sử dụng memoryStorage để kiểm dịch Magic Bytes trong RAM trước khi đẩy lên MinIO
const storage = multer.memoryStorage();

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024, // Giới hạn kích thước file 20MB
  },
  fileFilter: (_req, file, cb) => {
    const { allowed, ext } = isAllowedExtension(file.originalname);
    if (!allowed) {
      const error = new Error(
        `Định dạng tệp "${ext || '(không rõ)'}" bị chặn hoặc không nằm trong danh sách an toàn.`
      ) as Error & { code?: string; statusCode?: number };
      error.code = 'UNSUPPORTED_OR_SPOOFED_FILE';
      error.statusCode = 400;
      cb(error);
      return;
    }
    cb(null, true);
  },
});
