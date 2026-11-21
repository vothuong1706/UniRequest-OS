import { Router } from 'express';
import { query } from '../config/database.js';
import { config } from '../config/environment.js';
import { emitRequestUpdated } from '../realtime/socket-server.js';
import { notificationService } from '../services/notification-service.js';
import { requestService } from '../services/request-service.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const internalKestraRouter = Router();

/**
 * Callback nội bộ được gọi từ Kestra SLA Watchdog Flow.
 * Xác thực bằng header x-kestra-key khớp KESTRA_WEBHOOK_KEY.
 */
internalKestraRouter.post('/sla-alert', async (req, res, next) => {
  try {
    const providedKey = req.headers['x-kestra-key'];
    if (
      typeof providedKey !== 'string' ||
      providedKey !== config.kestra.webhookKey
    ) {
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

    res.status(200).json({
      success: true,
      dispatched: true,
      request_id: existing.id,
      department: existing.target_department,
    });
  } catch (error) {
    next(error);
  }
});
