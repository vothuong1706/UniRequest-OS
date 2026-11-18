import { Router } from 'express';
import { commentController } from '../controllers/comment-controller.js';
import { requestController } from '../controllers/request-controller.js';
import { authenticateToken } from '../middlewares/auth-middleware.js';
import { requireStaffOrLecturer } from '../middlewares/role-middleware.js';

export const requestRouter = Router();

// Toàn bộ API requests đều yêu cầu xác thực JWT từ Keycloak
requestRouter.use(authenticateToken);

// GET /api/requests/analytics - Thống kê dữ liệu thực chứng [D] (khai báo trước /:id)
requestRouter.get('/analytics', (req, res, next) =>
  requestController.getAnalytics(req, res, next)
);

// POST /api/requests - Tạo yêu cầu mới (kèm kiểm tra Poka-yoke + Audit Log + Kestra)
requestRouter.post('/', (req, res, next) =>
  requestController.createRequest(req, res, next)
);

// GET /api/requests - Lấy danh sách yêu cầu (phân quyền sinh viên vs cán bộ/giảng viên)
requestRouter.get('/', (req, res, next) =>
  requestController.getRequests(req, res, next)
);

// GET /api/requests/:id - Xem chi tiết yêu cầu kèm nhật ký kiểm toán bất biến (audit_logs)
requestRouter.get('/:id', (req, res, next) =>
  requestController.getRequestDetail(req, res, next)
);

// GET /api/requests/:id/comments & POST /api/requests/:id/comments - Trao đổi trực tiếp
requestRouter.get('/:id/comments', (req, res, next) =>
  commentController.listComments(req, res, next)
);
requestRouter.post('/:id/comments', (req, res, next) =>
  commentController.addComment(req, res, next)
);

// PUT /api/requests/:id/status - Phê duyệt / Từ chối (chỉ canbo / giangvien / admin)
requestRouter.put('/:id/status', requireStaffOrLecturer, (req, res, next) =>
  requestController.updateStatus(req, res, next)
);
