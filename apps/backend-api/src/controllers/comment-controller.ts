import { Request, Response, NextFunction } from 'express';
import { emitRequestUpdated, emitToStaff, emitToUser } from '../realtime/socket-server.js';
import { commentService } from '../services/comment-service.js';
import { notificationService } from '../services/notification-service.js';
import { hasElevatedRole, requestService } from '../services/request-service.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CommentController {
  async listComments(
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

      const { id } = req.params;
      if (!UUID_REGEX.test(id)) {
        res.status(400).json({ success: false, message: 'Mã yêu cầu không hợp lệ.' });
        return;
      }

      const existing = await requestService.getRequestById(id);
      if (!existing) {
        res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu.' });
        return;
      }

      const isStaff = hasElevatedRole(user.roles);
      if (!isStaff && existing.created_by !== user.preferred_username) {
        res.status(403).json({
          success: false,
          message: 'Bạn không có quyền xem trao đổi của yêu cầu này.',
        });
        return;
      }

      const comments = await commentService.listByRequestId(id);
      res.status(200).json({
        success: true,
        count: comments.length,
        data: comments,
      });
    } catch (error) {
      next(error);
    }
  }

  async addComment(
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

      const { id } = req.params;
      if (!UUID_REGEX.test(id)) {
        res.status(400).json({ success: false, message: 'Mã yêu cầu không hợp lệ.' });
        return;
      }

      const rawContent = (req.body as { content?: string })?.content;
      const content = typeof rawContent === 'string' ? rawContent.trim() : '';
      if (!content || content.length > 1000) {
        res.status(400).json({
          success: false,
          message: 'Nội dung trao đổi cần từ 1 đến 1000 ký tự.',
        });
        return;
      }

      const existing = await requestService.getRequestById(id);
      if (!existing) {
        res.status(404).json({ success: false, message: 'Không tìm thấy yêu cầu.' });
        return;
      }

      const isStaff = hasElevatedRole(user.roles);
      if (!isStaff && existing.created_by !== user.preferred_username) {
        res.status(403).json({
          success: false,
          message: 'Bạn không có quyền trao đổi trong yêu cầu này.',
        });
        return;
      }

      const comment = await commentService.createComment({
        requestId: id,
        authorUsername: user.preferred_username,
        authorRoles: user.roles,
        content,
      });

      // Emit realtime comment to owner & staff rooms
      emitToUser(existing.created_by, 'comment:new', comment);
      emitToStaff('comment:new', comment);
      emitRequestUpdated(existing.id, existing.created_by, 'COMMENT_ADDED');

      // Dispatch notification to the opposite party
      const snippet = content.length > 90 ? `${content.slice(0, 90)}…` : content;
      const isAuthorOwner = existing.created_by === user.preferred_username;

      if (isAuthorOwner) {
        void notificationService
          .createAndDispatch({
            recipientRole: 'staff',
            requestId: existing.id,
            type: 'COMMENT_ADDED',
            severity: 'INFO',
            title: `Trao đổi mới: ${existing.title}`,
            message: `${user.preferred_username}: "${snippet}"`,
            actor: user.preferred_username,
          })
          .catch(() => {});
      } else {
        void notificationService
          .createAndDispatch({
            recipientUsername: existing.created_by,
            requestId: existing.id,
            type: 'COMMENT_ADDED',
            severity: 'INFO',
            title: `Phản hồi mới cho yêu cầu của bạn`,
            message: `${user.preferred_username}: "${snippet}"`,
            actor: user.preferred_username,
          })
          .catch(() => {});
      }

      res.status(201).json({
        success: true,
        message: 'Đã gửi phản hồi.',
        data: comment,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const commentController = new CommentController();
