// SPDX-License-Identifier: Apache-2.0
import crypto from 'crypto';
import { Router } from 'express';
import { query } from '../config/database.js';
import { config } from '../config/environment.js';
import { emitRequestUpdated } from '../realtime/socket-server.js';
import { keycloakGroupService } from '../services/keycloak-group-service.js';
import {
  DailyReportDepartmentRow,
  DepartmentPendingItem,
  MailDispatchResult,
  mailService,
} from '../services/mail-service.js';
import { notificationService } from '../services/notification-service.js';
import { requestService } from '../services/request-service.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidKestraKey(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string' || !provided || !expected) {
    return false;
  }
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export const internalKestraRouter = Router();

/**
 * Callback nội bộ được gọi từ Kestra SLA Watchdog Flow.
 * Xác thực bằng header x-kestra-key khớp KESTRA_WEBHOOK_KEY.
 */
internalKestraRouter.post('/sla-alert', async (req, res, next) => {
  try {
    const providedKey = req.headers['x-kestra-key'];
    if (!isValidKestraKey(providedKey, config.kestra.webhookKey)) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized Kestra callback key.',
      });
      return;
    }

    const { request_id, hours_pending, threshold_hours, execution_id } = req.body as {
      request_id?: string;
      hours_pending?: number | string;
      threshold_hours?: number | string;
      execution_id?: string;
    };

    if (!request_id || !UUID_REGEX.test(request_id)) {
      res.status(400).json({
        success: false,
        message: 'Mã request_id không hợp lệ.',
      });
      return;
    }

    const existing = await requestService.getRequestById(request_id);
    if (
      !existing ||
      existing.status !== 'PENDING' ||
      existing.hidden_by_receiver
    ) {
      res.status(200).json({
        success: true,
        skipped: true,
        reason: 'NOT_ACTIVE_PENDING',
      });
      return;
    }

    // Chống spam: bỏ qua nếu đã gửi SLA_WARNING cho yêu cầu này trong 6 giờ gần nhất
    const recentAlertRes = await query(
      `SELECT 1 FROM request_audit_logs
       WHERE request_id = $1
         AND action = 'SLA_WARNING'
         AND created_at >= NOW() - INTERVAL '6 hours'
       LIMIT 1;`,
      [request_id]
    );
    if (recentAlertRes.rows.length > 0) {
      res.status(200).json({
        success: true,
        skipped: true,
        reason: 'RECENTLY_ALERTED',
      });
      return;
    }

    const hoursText =
      hours_pending !== undefined ? `${Number(hours_pending).toFixed(1)}h` : 'quá hạn';
    const deptLabel = existing.target_department
      ? existing.target_department.split('/').join(' / ')
      : 'Chung';

    await requestService.recordAuditLog({
      requestId: existing.id,
      actor: 'kestra-sla-watchdog',
      actorRoles: ['system'],
      action: 'SLA_WARNING',
      fromStatus: existing.status,
      toStatus: existing.status,
      note: `Quá hạn SLA (${hoursText}) - Cần xử lý gấp`,
      metadata: {
        execution_id: execution_id ?? null,
        hours_pending: hours_pending ?? null,
        threshold_hours: threshold_hours ?? null,
        target_department: existing.target_department,
      },
    });

    await notificationService.createAndDispatch({
      recipientRole: 'staff',
      recipientDepartment: existing.target_department,
      requestId: existing.id,
      type: 'SLA_WARNING',
      severity: 'URGENT',
      title: `[SLA Quá hạn - ${deptLabel}] ${existing.title}`,
      message: `Yêu cầu từ ${existing.created_by} đã chờ ${hoursText}. Vui lòng kiểm tra và xử lý.`,
      actor: 'kestra-sla-watchdog',
    });

    emitRequestUpdated(
      existing.id,
      existing.created_by,
      'STATUS_CHANGED',
      existing.target_department
    );

    let emailResult: MailDispatchResult = {
      sent: false,
      skipped: true,
      recipients: [],
      reason: 'SMTP_NOT_CONFIGURED',
    };
    try {
      const deptEmails = await keycloakGroupService.getDepartmentMemberEmails(
        existing.target_department
      );
      emailResult = await mailService.sendSlaAlertEmail({
        requestId: existing.id,
        title: existing.title,
        createdBy: existing.created_by,
        senderGroup: existing.sender_group ?? null,
        targetDepartment: existing.target_department,
        priority: existing.priority,
        hoursPendingText: hoursText,
        thresholdHours: threshold_hours ?? null,
        executionId: execution_id ?? null,
        keycloakEmails: deptEmails,
      });
    } catch (mailErr) {
      emailResult = {
        sent: false,
        skipped: false,
        recipients: [],
        reason: mailErr instanceof Error ? mailErr.message : String(mailErr),
      };
    }

    res.status(200).json({
      success: true,
      dispatched: true,
      request_id: existing.id,
      department: existing.target_department,
      email: {
        sent: emailResult.sent,
        skipped: emailResult.skipped,
        recipients_count: emailResult.recipients.length,
        reason: emailResult.reason,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Callback nội bộ được gọi từ Kestra Daily Report Flow (17:30 hằng ngày hoặc chạy tay).
 * Gửi email tổng hợp cuối ngày kèm bảng phân bổ phòng ban thật từ PostgreSQL.
 */
internalKestraRouter.post('/daily-report-notify', async (req, res, next) => {
  try {
    const providedKey = req.headers['x-kestra-key'];
    if (!isValidKestraKey(providedKey, config.kestra.webhookKey)) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized Kestra callback key.',
      });
      return;
    }

    const body = (req.body || {}) as {
      total_active?: number | string;
      total_pending?: number | string;
      total_approved?: number | string;
      total_rejected?: number | string;
      minio_key?: string;
      execution_id?: string;
    };

    const breakdownRes = await query(
      `SELECT
         COALESCE(target_department, 'Chưa phân tuyến') AS target_department,
         COUNT(*)::int AS total_requests,
         COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending_count,
         COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS approved_count,
         COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS rejected_count,
         COUNT(*) FILTER (WHERE priority = 'URGENT')::int AS urgent_count,
         COALESCE(
           ROUND(
             AVG(EXTRACT(EPOCH FROM (reviewed_at - created_at)) / 3600.0)
             FILTER (WHERE reviewed_at IS NOT NULL)::numeric,
             1
           ),
           0
         )::float AS avg_resolution_hours
       FROM requests
       WHERE hidden_by_receiver = FALSE
       GROUP BY COALESCE(target_department, 'Chưa phân tuyến')
       ORDER BY total_requests DESC, target_department ASC;`
    );
    const departmentBreakdown = (breakdownRes.rows || []) as DailyReportDepartmentRow[];

    // Truy vấn danh sách đơn đang PENDING để đính kèm trong báo cáo riêng từng Ban
    const pendingRes = await query(
      `SELECT
         id,
         title,
         created_by,
         sender_group,
         target_department,
         COALESCE(priority, 'NORMAL') AS priority,
         ROUND(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600.0, 1)::float AS hours_pending
       FROM requests
       WHERE hidden_by_receiver = FALSE
         AND status = 'PENDING'
         AND target_department IS NOT NULL
       ORDER BY
         CASE priority WHEN 'URGENT' THEN 3 WHEN 'HIGH' THEN 2 ELSE 1 END DESC,
         created_at ASC;`
    );
    const pendingByDepartment = new Map<string, DepartmentPendingItem[]>();
    for (const row of pendingRes.rows || []) {
      const dept = String(row.target_department || '').trim();
      if (!dept) continue;
      const list = pendingByDepartment.get(dept) || [];
      if (list.length < 5) {
        list.push({
          id: String(row.id),
          title: String(row.title || ''),
          created_by: String(row.created_by || ''),
          sender_group: row.sender_group ? String(row.sender_group) : null,
          priority: String(row.priority || 'NORMAL'),
          hours_pending: Number(row.hours_pending || 0),
        });
        pendingByDepartment.set(dept, list);
      }
    }

    // Tầng 1 (DEPARTMENT scope): gửi báo cáo riêng cho từng Ban tới đúng email thật của cán bộ Ban trên Keycloak
    const departmentReports: Array<{
      department: string;
      sent: boolean;
      skipped: boolean;
      recipients_count: number;
      reason?: string;
    }> = [];

    for (const deptRow of departmentBreakdown) {
      const deptName = deptRow.target_department;
      if (!deptName || deptName === 'Chưa phân tuyến') continue;

      let keycloakEmails: string[] = [];
      try {
        keycloakEmails =
          await keycloakGroupService.getDepartmentMemberEmails(deptName);
      } catch (err) {
        console.warn(
          `[Kestra DailyReport] Không lấy được email Keycloak cho Ban ${deptName}:`,
          err instanceof Error ? err.message : err
        );
      }

      const deptResult = await mailService.sendDepartmentDailyReportEmail({
        department: deptName,
        stats: deptRow,
        pendingItems: pendingByDepartment.get(deptName) || [],
        keycloakEmails,
        executionId: typeof body.execution_id === 'string' ? body.execution_id : null,
      });

      departmentReports.push({
        department: deptName,
        sent: deptResult.sent,
        skipped: deptResult.skipped,
        recipients_count: deptResult.recipients.length,
        reason: deptResult.reason,
      });
    }

    const totalActive = Number(body.total_active ?? 0);
    const totalPending = Number(body.total_pending ?? 0);
    const totalApproved = Number(body.total_approved ?? 0);
    const totalRejected = Number(body.total_rejected ?? 0);

    // Tầng 2 (ALL scope - Ban Giám hiệu / Quản trị): gửi bản tổng hợp toàn trường về SMTP_ALERT_TO
    const emailResult = await mailService.sendDailyReportEmail({
      totalActive: Number.isFinite(totalActive) ? totalActive : 0,
      totalPending: Number.isFinite(totalPending) ? totalPending : 0,
      totalApproved: Number.isFinite(totalApproved) ? totalApproved : 0,
      totalRejected: Number.isFinite(totalRejected) ? totalRejected : 0,
      minioKey: typeof body.minio_key === 'string' ? body.minio_key : null,
      executionId: typeof body.execution_id === 'string' ? body.execution_id : null,
      departmentBreakdown,
    });

    res.status(200).json({
      success: true,
      department_reports: departmentReports,
      department_sent_count: departmentReports.filter((r) => r.sent).length,
      email: {
        sent: emailResult.sent,
        skipped: emailResult.skipped,
        recipients_count: emailResult.recipients.length,
        reason: emailResult.reason,
      },
    });
  } catch (error) {
    next(error);
  }
});
