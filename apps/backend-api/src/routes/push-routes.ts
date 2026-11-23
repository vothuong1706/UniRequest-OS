// SPDX-License-Identifier: Apache-2.0
import { Router } from 'express';
import { pushController } from '../controllers/push-controller.js';
import { authenticateToken } from '../middlewares/auth-middleware.js';

export const pushRouter = Router();

pushRouter.use(authenticateToken);

pushRouter.get('/vapid-public-key', (req, res) =>
  pushController.getVapidPublicKey(req, res)
);
pushRouter.post('/subscribe', (req, res, next) =>
  pushController.subscribe(req, res, next)
);
pushRouter.delete('/unsubscribe', (req, res, next) =>
  pushController.unsubscribe(req, res, next)
);
