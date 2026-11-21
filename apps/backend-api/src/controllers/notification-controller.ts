import { Request, Response, NextFunction } from 'express';
import { keycloakGroupService } from '../services/keycloak-group-service.js';
import { notificationService } from '../services/notification-service.js';
import { resolveRequestAccessScope } from '../services/request-service.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class NotificationController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, message: 'Vui lòng đăng nhập.' });
        return;
      }

      const limit = Number(req.query.limit) || 40;
      const unreadOnly = req.query.unread === 'true';
      const resolvedGroups = await keycloakGroupService.resolveUserGroupPaths(
        user.groups
      );
      const scope = resolveRequestAccessScope({ ...user, groups: resolvedGroups });

      const data = await notificationService.listForUser(
        user.preferred_username,
        scope,
        { limit, unreadOnly }
      );

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, message: 'Vui lòng đăng nhập.' });
        return;
      }

      const { id } = req.params;
      if (!UUID_REGEX.test(id)) {
        res.status(400).json({ success: false, message: 'Mã thông báo không hợp lệ.' });
        return;
      }

      await notificationService.setReadState(id, user.preferred_username, true);
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  async markUnread(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, message: 'Vui lòng đăng nhập.' });
        return;
      }

      const { id } = req.params;
      if (!UUID_REGEX.test(id)) {
        res.status(400).json({ success: false, message: 'Mã thông báo không hợp lệ.' });
        return;
      }

      await notificationService.setReadState(id, user.preferred_username, false);
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  async hide(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, message: 'Vui lòng đăng nhập.' });
        return;
      }

      const { id } = req.params;
      if (!UUID_REGEX.test(id)) {
        res.status(400).json({ success: false, message: 'Mã thông báo không hợp lệ.' });
        return;
      }

      await notificationService.hideNotification(id, user.preferred_username);
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  async markReadByRequest(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, message: 'Vui lòng đăng nhập.' });
        return;
      }

      const { requestId } = req.params;
      if (!UUID_REGEX.test(requestId)) {
        res.status(400).json({ success: false, message: 'Mã yêu cầu không hợp lệ.' });
        return;
      }

      const resolvedGroups = await keycloakGroupService.resolveUserGroupPaths(
        user.groups
      );
      const scope = resolveRequestAccessScope({ ...user, groups: resolvedGroups });
      await notificationService.markReadByRequest(
        requestId,
        user.preferred_username,
        scope
      );
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  async markAllRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, message: 'Vui lòng đăng nhập.' });
        return;
      }

      const resolvedGroups = await keycloakGroupService.resolveUserGroupPaths(
        user.groups
      );
      const scope = resolveRequestAccessScope({ ...user, groups: resolvedGroups });
      await notificationService.markAllRead(user.preferred_username, scope);
      res.status(200).json({ success: true });
    } catch (error) {
      next(error);
    }
  }
}

export const notificationController = new NotificationController();
