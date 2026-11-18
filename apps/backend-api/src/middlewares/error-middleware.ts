import { Request, Response, NextFunction } from 'express';

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    message: `Không tìm thấy tài nguyên: ${req.method} ${req.originalUrl}`,
  });
};

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error('[Unhandled Error]', err);
  res.status(500).json({
    success: false,
    message: 'Đã xảy ra lỗi hệ thống nội bộ',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
};
