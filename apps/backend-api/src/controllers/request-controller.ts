import { Request, Response, NextFunction } from 'express';
import {
  emitRequestUpdated,
  emitToStaff,
  emitToUser,
} from '../realtime/socket-server.js';
import { aiTriageService } from '../services/ai-triage-service.js';
import { categoryService } from '../services/category-service.js';
import { keycloakGroupService } from '../services/keycloak-group-service.js';
import { notificationService } from '../services/notification-service.js';
import {
  canReviewRequest,
  canViewRequest,
  requestService,
} from '../services/request-service.js';
import {
  extractPriorityFromDescription,
  workflowService,
} from '../services/workflow-service.js';
import { verifyAuditChain } from '../utils/audit-hash-chain.js';
import {
  RequestDeleteMode,
  RequestPriority,
  RequestStatus,
} from '../types/request.js';

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
        target_department: rawTargetDepartment,
        priority: rawPriority,
        attachment_url,
      } = req.body as {
        title?: string;
        description?: string;
        category?: string;
        custom_category_label?: string;
        target_department?: string;
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

      const trimmedDepartment =
        typeof rawTargetDepartment === 'string'
          ? rawTargetDepartment.trim().replace(/^\/+/, '')
          : '';
      if (!trimmedDepartment || trimmedDepartment.length > 150) {
        res.status(400).json({
          success: false,
          code: 'INVALID_TARGET_DEPARTMENT',
          message: 'Vui lòng chọn phòng ban hoặc nhóm tiếp nhận hợp lệ.',
        });
        return;
      }

      const resolvedDepartment =
        await keycloakGroupService.resolveTargetDepartmentPath(trimmedDepartment);
      if (!resolvedDepartment.valid) {
        res.status(400).json({
          success: false,
          code: 'INVALID_TARGET_DEPARTMENT',
          message:
            'Phòng ban hoặc nhóm tiếp nhận không tồn tại trong hệ thống Keycloak.',
        });
        return;
      }

      const newRequest = await requestService.createRequest(
        {
          title: trimmedTitle,
          description: cleanDesc || undefined,
          category: categoryCode,
          custom_category_label: cleanCustomLabel,
          target_department: resolvedDepartment.canonicalPath,
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
        target_department: newRequest.target_department,
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

      // Gửi thông báo realtime & Web Push đúng tới ban tiếp nhận
      const deptLabel = newRequest.target_department
        ? newRequest.target_department.split('/').join(' / ')
        : 'Chung';
      emitRequestUpdated(
        newRequest.id,
        newRequest.created_by,
        'CREATED',
        newRequest.target_department
      );
      void notificationService
        .createAndDispatch({
          recipientRole: 'staff',
          recipientDepartment: newRequest.target_department,
          requestId: newRequest.id,
          type: 'REQUEST_CREATED',
          severity: newRequest.priority === 'URGENT' ? 'URGENT' : 'INFO',
          title:
            newRequest.priority === 'URGENT'
              ? `[${deptLabel}] Yêu cầu khẩn cấp: ${newRequest.title}`
              : `[${deptLabel}] Yêu cầu mới: ${newRequest.title}`,
          message: `${user.preferred_username} vừa gửi yêu cầu tới "${deptLabel}" (${cleanCustomLabel || matchedCategory?.name || newRequest.category}).`,
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

      const resolvedGroups = await keycloakGroupService.resolveUserGroupPaths(
        user.groups
      );
      const requests = await requestService.getRequests({
        ...user,
        groups: resolvedGroups,
      });

      res.status(200).json({
        success: true,
        count: requests.length,
        data: requests,
      });
    } catch (error) {
      next(error);
    }
  }

  async suggestTriage(
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

      const { title, description } = (req.body || {}) as {
        title?: unknown;
        description?: unknown;
      };
      const cleanTitle = typeof title === 'string' ? title.trim() : '';
      const cleanDesc = typeof description === 'string' ? description.trim() : '';

      if (`${cleanTitle} ${cleanDesc}`.trim().length < 3) {
        res.status(400).json({
          success: false,
          code: 'INPUT_TOO_SHORT',
          message: 'Vui lòng nhập tiêu đề hoặc mô tả tối thiểu 3 ký tự để AI phân tích.',
        });
        return;
      }

      const [departments, categories] = await Promise.all([
        keycloakGroupService.listGroups(),
        categoryService.list({ includeInactive: false }),
      ]);

      const suggestion = await aiTriageService.suggestTriage({
        title: cleanTitle || cleanDesc.slice(0, 100),
        description: cleanDesc,
        departments,
        categories,
      });

      res.status(200).json({
        success: true,
        data: suggestion,
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

      const resolvedGroups = await keycloakGroupService.resolveUserGroupPaths(
        user.groups
      );
      const analytics = await requestService.getAnalytics({
        ...user,
        groups: resolvedGroups,
      });

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

      const resolvedGroups = await keycloakGroupService.resolveUserGroupPaths(
        user.groups
      );
      if (!canViewRequest({ ...user, groups: resolvedGroups }, existing)) {
        res.status(403).json({
          success: false,
          message: 'Bạn không có quyền xem yêu cầu của phòng ban khác.',
        });
        return;
      }

      const [auditLogs, departments, categories] = await Promise.all([
        requestService.getAuditLogsByRequestId(id),
        keycloakGroupService.listGroups(),
        categoryService.list({ includeInactive: true }),
      ]);

      const aiInsight = aiTriageService.buildFastInsight({
        title: existing.title,
        description: existing.description ?? undefined,
        departments,
        categories,
        currentCategoryCode: existing.category,
        currentDepartment: existing.target_department,
        currentPriority: existing.priority,
      });
      const auditIntegrity = verifyAuditChain(auditLogs);

      res.status(200).json({
        success: true,
        data: {
          ...existing,
          audit_logs: auditLogs,
          audit_integrity: auditIntegrity,
          ai_insight: aiInsight,
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

      const resolvedGroups = await keycloakGroupService.resolveUserGroupPaths(
        user.groups
      );
      if (!canReviewRequest({ ...user, groups: resolvedGroups }, existingRequest)) {
        res.status(403).json({
          success: false,
          message: 'Bạn không có quyền phê duyệt yêu cầu thuộc phòng ban khác.',
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
            target_department: updatedRequest.target_department,
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
          'STATUS_CHANGED',
          updatedRequest.target_department
        );

        if (status === 'APPROVED' || status === 'REJECTED') {
          const isApproved = status === 'APPROVED';
          const deptLabel = updatedRequest.target_department
            ? updatedRequest.target_department.split('/').join(' / ')
            : 'Chung';
          void notificationService
            .createAndDispatch({
              recipientUsername: updatedRequest.created_by,
              recipientDepartment: updatedRequest.target_department,
              requestId: updatedRequest.id,
              type: isApproved ? 'REQUEST_APPROVED' : 'REQUEST_REJECTED',
              severity: isApproved ? 'SUCCESS' : 'WARNING',
              title: isApproved
                ? `[${deptLabel}] Yêu cầu đã được phê duyệt`
                : `[${deptLabel}] Yêu cầu bị từ chối`,
              message: cleanReviewNote
                ? `"${updatedRequest.title}" - ${cleanReviewNote}`
                : `"${updatedRequest.title}" đã được ${user.preferred_username} (${deptLabel}) cập nhật.`,
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

  async deleteRequests(
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

      const rawIds = req.params.id
        ? [req.params.id]
        : (req.body as { ids?: unknown })?.ids;
      if (!Array.isArray(rawIds) || rawIds.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Vui lòng chọn ít nhất một yêu cầu để xóa.',
        });
        return;
      }

      const ids = Array.from(
        new Set(
          rawIds.filter(
            (item): item is string =>
              typeof item === 'string' && UUID_REGEX.test(item.trim())
          )
        )
      );
      if (ids.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Danh sách mã yêu cầu không hợp lệ.',
        });
        return;
      }

      const rawMode =
        (req.body as { mode?: unknown })?.mode ?? req.query.mode;
      const deleteMode: RequestDeleteMode | undefined =
        rawMode === 'history' || rawMode === 'manage' ? rawMode : undefined;

      const resolvedGroups = await keycloakGroupService.resolveUserGroupPaths(
        user.groups
      );
      const { deleted, side, forbidden } = await requestService.deleteRequests(
        ids,
        {
          ...user,
          groups: resolvedGroups,
        },
        deleteMode
      );

      if (forbidden) {
        res.status(403).json({
          success: false,
          message: 'Bạn không có quyền xóa một hoặc nhiều yêu cầu đã chọn.',
        });
        return;
      }

      const timestamp = new Date().toISOString();
      for (const item of deleted) {
        const payload = {
          requestId: item.id,
          action: 'DELETED',
          timestamp,
        };
        if (side === 'sender') {
          emitToUser(item.created_by, 'request:updated', payload);
        } else {
          emitToStaff('request:updated', payload, item.target_department);
        }
      }

      res.status(200).json({
        success: true,
        side,
        deleted_count: deleted.length,
        data: deleted.map((d) => d.id),
      });
    } catch (error) {
      next(error);
    }
  }
}

export const requestController = new RequestController();
