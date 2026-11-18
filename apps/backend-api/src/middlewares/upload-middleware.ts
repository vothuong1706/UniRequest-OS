import multer from 'multer';

// Sử dụng memoryStorage để đệm file trong RAM trước khi đẩy lên MinIO
const storage = multer.memoryStorage();

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024, // Giới hạn kích thước file 20MB
  },
  fileFilter: (_req, file, cb) => {
    // Chấp nhận các định dạng tài liệu, hình ảnh thông dụng
    cb(null, true);
  },
});
