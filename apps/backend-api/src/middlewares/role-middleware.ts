import { Request, Response, NextFunction } from 'express';

/**
 * Middleware kiểm tra quyền theo danh sách role được phép
 */
export const requireRoles = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Yêu cầu đăng nhập để truy cập tài nguyên này',
      });
      return;
    }

    const userRoles = req.user.roles || [];
    const hasPermission = allowedRoles.some((role) => userRoles.includes(role));

    if (!hasPermission) {
      res.status(403).json({
        success: false,
        message: `Truy cập bị từ chối: Chỉ các vai trò [${allowedRoles.join(', ')}] mới có quyền thực hiện thao tác này.`,
        currentRoles: userRoles,
      });
      return;
    }

    next();
  };
};

/**
 * Middleware tiện ích dành riêng cho cán bộ và giảng viên
 */
export const requireStaffOrLecturer = requireRoles(['canbo', 'giangvien', 'admin']);
