import { Request, Response, NextFunction } from 'express';
import { emitRequestUpdated } from '../realtime/socket-server.js';
import { categoryService } from '../services/category-service.js';
import { notificationService } from '../services/notification-service.js';
import { hasElevatedRole, requestService } from '../services/request-service.js';
import {
  extractPriorityFromDescription,
  workflowService,
} from '../services/workflow-service.js';
import { RequestPriority, RequestStatus } from '../types/request.js';

const VALID_PRIORITIES: readonly RequestPriority[] = [
  'NORMAL',
  'HIGH',
  'URGENT',
];
const VALID_STATUSES: readonly RequestStatus[] = [
  'PENDING',
  'APPROVED',
  'REJECTED',
];
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIORITY_PREFIX_REGEX = /^\[Ưu tiên:\s*[^\]]+\]\s*/i;

function stripPriorityPrefix(description?: string | null): string {
  if (!description) return '';
  return description.replace(PRIORITY_PREFIX_REGEX, '').trim();
}

export class RequestController {
  async createRequest(
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

      const {
        title,
        description,
        category: rawCategory,
        custom_category_label,
        priority: rawPriority,
        attachment_url,
      } = req.body as {
        title?: string;
        description?: string;
        category?: string;
        custom_category_label?: string;
        priority?: string;
        attachment_url?: string;
      };

      const trimmedTitle = typeof title === 'string' ? title.trim() : '';
      if (!trimmedTitle || trimmedTitle.length < 5) {
        res.status(400).json({
          success: false,
          code: 'TITLE_TOO_SHORT',
          message: 'Tiêu đề yêu cầu cần tối thiểu 5 ký tự.',
        });
        return;
      }

      const categoryCode = (rawCategory || 'OTHER').trim().toUpperCase();
      const matchedCategory = await categoryService.getByCode(categoryCode);

      const priority = (
        rawPriority
          ? rawPriority.toUpperCase()
          : extractPriorityFromDescription(description)
      ) as RequestPriority;
      if (!VALID_PRIORITIES.includes(priority)) {
        res.status(400).json({
          success: false,
          code: 'INVALID_PRIORITY',
          message: 'Mức độ ưu tiên không hợp lệ.',
        });
        return;
      }

      const cleanDesc = stripPriorityPrefix(description);

      // Kiểm tra quy tắc đính kèm động dựa trên cấu hình danh mục trong DB
      const requiresEvidence =
        matchedCategory?.requires_evidence || categoryCode === 'FACILITY';
      if (requiresEvidence && !attachment_url && cleanDesc.length < 15) {
        res.status(400).json({
          success: false,
          code: 'EVIDENCE_REQUIRED',
          message:
            'Loại yêu cầu này cần tệp minh chứng hoặc mô tả chi tiết tối thiểu 15 ký tự.',
        });
        return;
      }

      if (priority === 'URGENT' && cleanDesc.length < 10) {
        res.status(400).json({
          success: false,
          code: 'URGENT_REASON_REQUIRED',
          message: 'Yêu cầu khẩn cấp cần nêu rõ lý do tối thiểu 10 ký tự.',
        });
        return;
      }

      const cleanCustomLabel =
        typeof custom_category_label === 'string'
          ? custom_category_label.trim().slice(0, 120)
          : undefined;

      const newRequest = await requestService.createRequest(
        {
          title: trimmedTitle,
          description: cleanDesc || undefined,
          category: categoryCode,
          custom_category_label: cleanCustomLabel,
          priority,
          attachment_url,
        },
        user.preferred_username,
        user.roles,
        matchedCategory?.name
      );

      const workflow = await workflowService.emitLifecycleEvent({
        event: 'request.created',
        request_id: newRequest.id,
        title: newRequest.title,
        category: newRequest.category,
        priority: newRequest.priority,
        status: newRequest.status,
        created_by: newRequest.created_by,
        actor: user.preferred_username,
        attachment_url: newRequest.attachment_url,
      });

      if (workflow.dispatched && workflow.executionId) {
        await requestService.attachWorkflowExecution(
          newRequest.id,
          workflow.executionId,
          'request.created',
          user.preferred_username,
          user.roles
        );
        newRequest.workflow_execution_id = workflow.executionId;
      }

      // Gửi thông báo realtime & Web Push tới đội ngũ xử lý (Cán bộ / Giảng viên / Admin)
      emitRequestUpdated(newRequest.id, newRequest.created_by, 'CREATED');
      void notificationService
        .createAndDispatch({
          recipientRole: 'staff',
          requestId: newRequest.id,
          type: 'REQUEST_CREATED',
          severity: newRequest.priority === 'URGENT' ? 'URGENT' : 'INFO',
          title:
            newRequest.priority === 'URGENT'
              ? `Yêu cầu khẩn cấp: ${newRequest.title}`
              : `Yêu cầu mới: ${newRequest.title}`,
          message: `${user.preferred_username} vừa gửi yêu cầu thuộc nhóm "${cleanCustomLabel || matchedCategory?.name || newRequest.category}".`,
          actor: user.preferred_username,
        })
        .catch(() => {});

      res.status(201).json({
        success: true,
        message: 'Đã gửi yêu cầu thành công.',
        data: newRequest,
        workflow,
      });
    } catch (error) {
      next(error);
    }
  }

  async getRequests(
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

      const requests = await requestService.getRequests(
        user.preferred_username,
        user.roles
      );

      res.status(200).json({
        success: true,
        count: requests.length,
        data: requests,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAnalytics(
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

      const analytics = await requestService.getAnalytics(
        user.preferred_username,
        user.roles
      );

      res.status(200).json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      next(error);
    }
  }

  async getRequestDetail(
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
        res.status(400).json({
          success: false,
          message: 'Mã yêu cầu không hợp lệ.',
        });
        return;
      }

      const existing = await requestService.getRequestById(id);
      if (!existing) {
        res.status(404).json({
          success: false,
          message: 'Không tìm thấy yêu cầu.',
        });
        return;
      }

      const elevated = hasElevatedRole(user.roles);
      if (!elevated && existing.created_by !== user.preferred_username) {
        res.status(403).json({
          success: false,
          message: 'Bạn không có quyền xem yêu cầu này.',
        });
        return;
      }

      const auditLogs = await requestService.getAuditLogsByRequestId(id);

      res.status(200).json({
        success: true,
        data: {
          ...existing,
          audit_logs: auditLogs,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async updateStatus(
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
        res.status(400).json({
          success: false,
          message: 'Mã yêu cầu không hợp lệ.',
        });
        return;
      }

      const { status, review_note } = req.body as {
        status?: RequestStatus;
        review_note?: string;
      };

      if (!status || !VALID_STATUSES.includes(status)) {
        res.status(400).json({
          success: false,
          message: 'Trạng thái cập nhật không hợp lệ.',
        });
        return;
      }

      const existingRequest = await requestService.getRequestById(id);
      if (!existingRequest) {
        res.status(404).json({
          success: false,
          message: 'Không tìm thấy yêu cầu.',
        });
        return;
      }

      const isAdmin = user.roles.includes('admin');
      if (existingRequest.status !== 'PENDING' && !isAdmin) {
        res.status(409).json({
          success: false,
          code: 'ALREADY_PROCESSED',
          message: 'Yêu cầu này đã được xử lý trước đó.',
        });
        return;
      }

      const cleanReviewNote =
        typeof review_note === 'string' ? review_note.trim() : '';
      if (status === 'REJECTED' && cleanReviewNote.length < 5) {
        res.status(400).json({
          success: false,
          code: 'REJECT_REASON_REQUIRED',
          message: 'Vui lòng nhập lý do từ chối tối thiểu 5 ký tự.',
        });
        return;
      }

      const updatedRequest = await requestService.updateRequestStatus({
        id,
        fromStatus: existingRequest.status,
        toStatus: status,
        reviewedBy: user.preferred_username,
        reviewerRoles: user.roles,
        reviewNote: cleanReviewNote || undefined,
      });

      const workflow = updatedRequest
        ? await workflowService.emitLifecycleEvent({
            event: 'request.status_changed',
            request_id: updatedRequest.id,
            title: updatedRequest.title,
            category: updatedRequest.category,
            priority: updatedRequest.priority,
            status: updatedRequest.status,
            created_by: updatedRequest.created_by,
            actor: user.preferred_username,
            review_note: cleanReviewNote || undefined,
            attachment_url: updatedRequest.attachment_url,
          })
        : { dispatched: false, reason: 'NOT_UPDATED' };

      if (updatedRequest && workflow.dispatched && workflow.executionId) {
        await requestService.attachWorkflowExecution(
          updatedRequest.id,
          workflow.executionId,
          'request.status_changed',
          user.preferred_username,
          user.roles
        );
        updatedRequest.workflow_execution_id = workflow.executionId;
      }

      if (updatedRequest) {
        emitRequestUpdated(
          updatedRequest.id,
          updatedRequest.created_by,
          'STATUS_CHANGED'
        );

        if (status === 'APPROVED' || status === 'REJECTED') {
          const isApproved = status === 'APPROVED';
          void notificationService
            .createAndDispatch({
              recipientUsername: updatedRequest.created_by,
              requestId: updatedRequest.id,
              type: isApproved ? 'REQUEST_APPROVED' : 'REQUEST_REJECTED',
              severity: isApproved ? 'SUCCESS' : 'WARNING',
              title: isApproved
                ? `Yêu cầu đã được phê duyệt`
                : `Yêu cầu bị từ chối`,
              message: cleanReviewNote
                ? `"${updatedRequest.title}" - ${cleanReviewNote}`
                : `"${updatedRequest.title}" đã được ${user.preferred_username} cập nhật.`,
              actor: user.preferred_username,
            })
            .catch(() => {});
        }
      }

      res.status(200).json({
        success: true,
        message:
          status === 'APPROVED'
            ? 'Đã phê duyệt yêu cầu.'
            : 'Đã cập nhật trạng thái yêu cầu.',
        data: updatedRequest,
        workflow,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const requestController = new RequestController();
