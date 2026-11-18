import { Request, Response, NextFunction } from 'express';
import { pushService, type PushSubscriptionInput } from '../services/push-service.js';

export class PushController {
  getVapidPublicKey(_req: Request, res: Response): void {
    res.status(200).json({
      success: true,
      data: {
        publicKey: pushService.getPublicKey(),
      },
    });
  }

  async subscribe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, message: 'Vui lòng đăng nhập.' });
        return;
      }

      const body = req.body as Partial<PushSubscriptionInput>;
      if (
        !body.endpoint ||
        !body.keys?.p256dh ||
        !body.keys?.auth
      ) {
        res.status(400).json({
          success: false,
          message: 'Thông tin đăng ký thông báo đẩy không hợp lệ.',
        });
        return;
      }

      await pushService.saveSubscription(
        user.preferred_username,
        user.roles,
        {
          endpoint: body.endpoint,
          keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
        },
        req.headers['user-agent']
      );

      res.status(201).json({
        success: true,
        message: 'Đã bật thông báo đẩy trên thiết bị này.',
      });
    } catch (error) {
      next(error);
    }
  }

  async unsubscribe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, message: 'Vui lòng đăng nhập.' });
        return;
      }

      const { endpoint } = req.body as { endpoint?: string };
      if (!endpoint) {
        res.status(400).json({
          success: false,
          message: 'Thiếu địa chỉ endpoint để hủy đăng ký.',
        });
        return;
      }

      await pushService.removeSubscription(user.preferred_username, endpoint);
      res.status(200).json({
        success: true,
        message: 'Đã tắt thông báo đẩy trên thiết bị này.',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const pushController = new PushController();
