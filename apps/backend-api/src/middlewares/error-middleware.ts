import { Request, Response, NextFunction } from 'express';

interface AppHttpError extends Error {
  statusCode?: number;
  code?: string;
}

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    message: `Không tìm thấy tài nguyên: ${req.method} ${req.originalUrl}`,
  });
};

export const errorHandler = (
  err: AppHttpError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({
      success: false,
      code: 'FILE_TOO_LARGE',
      message: 'Kích thước tệp vượt quá giới hạn cho phép (20MB).',
    });
    return;
  }

  if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
    res.status(err.statusCode).json({
      success: false,
      code: err.code || 'BAD_REQUEST',
      message: err.message,
    });
    return;
  }

  console.error('[Unhandled Error]', err);
  res.status(500).json({
    success: false,
    message: 'Đã xảy ra lỗi hệ thống nội bộ',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
};
