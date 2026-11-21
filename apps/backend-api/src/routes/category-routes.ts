import { Router } from 'express';
import { categoryController } from '../controllers/category-controller.js';
import { authenticateToken } from '../middlewares/auth-middleware.js';
import { requireStaffOrLecturer } from '../middlewares/role-middleware.js';

export const categoryRouter = Router();

categoryRouter.use(authenticateToken);

categoryRouter.get('/', (req, res, next) =>
  categoryController.list(req, res, next)
);

categoryRouter.post('/', requireStaffOrLecturer, (req, res, next) =>
  categoryController.create(req, res, next)
);

categoryRouter.put('/:id', requireStaffOrLecturer, (req, res, next) =>
  categoryController.update(req, res, next)
);

categoryRouter.patch('/:id/toggle', requireStaffOrLecturer, (req, res, next) =>
  categoryController.toggle(req, res, next)
);

categoryRouter.delete('/', requireStaffOrLecturer, (req, res, next) =>
  categoryController.deleteMany(req, res, next)
);

categoryRouter.delete('/:id', requireStaffOrLecturer, (req, res, next) =>
  categoryController.deleteMany(req, res, next)
);
