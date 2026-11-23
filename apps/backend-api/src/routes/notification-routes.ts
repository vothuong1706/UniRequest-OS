// SPDX-License-Identifier: Apache-2.0
import { Router } from 'express';
import { notificationController } from '../controllers/notification-controller.js';
import { authenticateToken } from '../middlewares/auth-middleware.js';

export const notificationRouter = Router();

notificationRouter.use(authenticateToken);

notificationRouter.get('/', (req, res, next) =>
  notificationController.list(req, res, next)
);
notificationRouter.patch('/read-all', (req, res, next) =>
  notificationController.markAllRead(req, res, next)
);
notificationRouter.patch('/by-request/:requestId/read', (req, res, next) =>
  notificationController.markReadByRequest(req, res, next)
);
notificationRouter.patch('/:id/read', (req, res, next) =>
  notificationController.markRead(req, res, next)
);
notificationRouter.patch('/:id/unread', (req, res, next) =>
  notificationController.markUnread(req, res, next)
);
notificationRouter.patch('/:id/hide', (req, res, next) =>
  notificationController.hide(req, res, next)
);
