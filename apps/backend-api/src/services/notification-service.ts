import { query } from '../config/database.js';
import { emitToStaff, emitToUser } from '../realtime/socket-server.js';
import { RequestAccessScope } from '../types/request.js';
import { pushService } from './push-service.js';
import { buildDepartmentMatchSql } from './request-service.js';

export type NotificationType =
  | 'REQUEST_CREATED'
  | 'REQUEST_APPROVED'
  | 'REQUEST_REJECTED'
  | 'COMMENT_ADDED'
  | 'SLA_WARNING';

export type NotificationSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'URGENT';

export interface NotificationRecord {
  id: string;
  recipient_username: string | null;
  recipient_role: string | null;
  recipient_department: string | null;
  request_id: string | null;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  actor: string;
  is_read: boolean;
  created_at: Date;
}

export interface CreateNotificationInput {
  recipientUsername?: string | null;
  recipientRole?: 'staff' | null;
  recipientDepartment?: string | null;
  requestId?: string | null;
  type: NotificationType;
  severity?: NotificationSeverity;
  title: string;
  message: string;
  actor: string;
}

function buildNotificationScopeSql(
  scope: RequestAccessScope,
  usernameParamIdx: number,
  startParamIdx: number
): { clause: string; params: unknown[] } {
  const senderActive = `(r.id IS NULL OR r.hidden_by_sender = FALSE)`;
  const receiverActive = `(r.id IS NULL OR r.hidden_by_receiver = FALSE)`;

  if (scope.type === 'ALL') {
    return {
      clause: `((n.recipient_username = $${usernameParamIdx} AND ${senderActive}) OR (n.recipient_role = 'staff' AND n.actor <> $${usernameParamIdx} AND ${receiverActive}))`,
      params: [],
    };
  }

  if (scope.type === 'DEPARTMENT') {
    const deptMatch = buildDepartmentMatchSql(
      scope.departments,
      'n.recipient_department',
      startParamIdx
    );
    return {
      clause: `((n.recipient_username = $${usernameParamIdx} AND ${senderActive}) OR (n.recipient_role = 'staff' AND n.actor <> $${usernameParamIdx} AND ${receiverActive} AND n.recipient_department IS NOT NULL AND ${deptMatch.condition}))`,
      params: deptMatch.params,
    };
  }

  return {
    clause: `(n.recipient_username = $${usernameParamIdx} AND ${senderActive})`,
    params: [],
  };
}

export class NotificationService {
  async createAndDispatch(input: CreateNotificationInput): Promise<NotificationRecord> {
    const cleanDepartment = input.recipientDepartment?.trim().replace(/^\/+/, '') || null;

    const sql = `
      INSERT INTO notifications (
        recipient_username,
        recipient_role,
        recipient_department,
        request_id,
        type,
        severity,
        title,
        message,
        actor
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;

    const result = await query(sql, [
      input.recipientUsername ?? null,
      input.recipientRole ?? null,
      cleanDepartment,
      input.requestId ?? null,
      input.type,
      input.severity ?? 'INFO',
      input.title,
      input.message,
      input.actor,
    ]);

    const record: NotificationRecord = {
      ...(result.rows[0] as Omit<NotificationRecord, 'is_read'>),
      is_read: false,
    };

    const pushPayload = {
      title: record.title,
      body: record.message,
      requestId: record.request_id ?? undefined,
      url: record.request_id ? `/?requestId=${record.request_id}` : '/',
      tag: record.request_id ? `req-${record.request_id}` : record.id,
    };

    if (record.recipient_username) {
      emitToUser(record.recipient_username, 'notification:new', record);
      void pushService.sendToUser(record.recipient_username, pushPayload);
    }

    if (record.recipient_role === 'staff') {
      emitToStaff('notification:new', record, record.recipient_department);
      void pushService.sendToStaff(
        pushPayload,
        record.recipient_department,
        record.actor
      );
    }

    return record;
  }

  async listForUser(
    username: string,
    scope: RequestAccessScope,
    options: { limit?: number; unreadOnly?: boolean } = {}
  ): Promise<{ items: NotificationRecord[]; unread_count: number }> {
    const limit = Math.min(Math.max(options.limit ?? 40, 1), 100);

    const listScope = buildNotificationScopeSql(scope, 1, 3);
    const countScope = buildNotificationScopeSql(scope, 1, 2);

    const notHiddenClause = `COALESCE(nr.is_hidden, FALSE) = FALSE`;
    const isUnreadClause = `COALESCE(nr.is_read, FALSE) = FALSE`;
    const unreadFilter = options.unreadOnly ? `AND ${isUnreadClause}` : '';

    const listSql = `
      SELECT
        n.*,
        COALESCE(nr.is_read, FALSE) AS is_read
      FROM notifications n
      LEFT JOIN requests r ON r.id = n.request_id
      LEFT JOIN notification_reads nr
        ON nr.notification_id = n.id AND nr.username = $1
      WHERE ${listScope.clause}
        AND ${notHiddenClause}
        ${unreadFilter}
      ORDER BY n.created_at DESC
      LIMIT $2;
    `;

    const countSql = `
      SELECT COUNT(*)::int AS unread_count
      FROM notifications n
      LEFT JOIN requests r ON r.id = n.request_id
      LEFT JOIN notification_reads nr
        ON nr.notification_id = n.id AND nr.username = $1
      WHERE ${countScope.clause}
        AND ${notHiddenClause}
        AND ${isUnreadClause};
    `;

    const [listRes, countRes] = await Promise.all([
      query(listSql, [username, limit, ...listScope.params]),
      query(countSql, [username, ...countScope.params]),
    ]);

    return {
      items: listRes.rows as NotificationRecord[],
      unread_count: Number(countRes.rows[0]?.unread_count ?? 0),
    };
  }

  async setReadState(
    notificationId: string,
    username: string,
    isRead: boolean
  ): Promise<void> {
    await query(
      `INSERT INTO notification_reads (notification_id, username, is_read, is_hidden, read_at)
       VALUES ($1, $2, $3, FALSE, CURRENT_TIMESTAMP)
       ON CONFLICT (notification_id, username) DO UPDATE
       SET is_read = EXCLUDED.is_read,
           read_at = CURRENT_TIMESTAMP;`,
      [notificationId, username, isRead]
    );
    emitToUser(username, 'notification:sync', {
      action: isRead ? 'READ' : 'UNREAD',
      notificationId,
    });
  }

  async hideNotification(notificationId: string, username: string): Promise<void> {
    await query(
      `INSERT INTO notification_reads (notification_id, username, is_read, is_hidden, read_at)
       VALUES ($1, $2, TRUE, TRUE, CURRENT_TIMESTAMP)
       ON CONFLICT (notification_id, username) DO UPDATE
       SET is_read = TRUE,
           is_hidden = TRUE,
           read_at = CURRENT_TIMESTAMP;`,
      [notificationId, username]
    );
    emitToUser(username, 'notification:sync', {
      action: 'HIDE',
      notificationId,
    });
  }

  async markReadByRequest(
    requestId: string,
    username: string,
    scope: RequestAccessScope
  ): Promise<void> {
    const scopeSql = buildNotificationScopeSql(scope, 2, 3);

    await query(
      `INSERT INTO notification_reads (notification_id, username, is_read, is_hidden, read_at)
       SELECT n.id, $2, TRUE, COALESCE(nr.is_hidden, FALSE), CURRENT_TIMESTAMP
       FROM notifications n
       LEFT JOIN requests r ON r.id = n.request_id
       LEFT JOIN notification_reads nr
         ON nr.notification_id = n.id AND nr.username = $2
       WHERE n.request_id = $1
         AND ${scopeSql.clause}
         AND COALESCE(nr.is_read, FALSE) = FALSE
       ON CONFLICT (notification_id, username) DO UPDATE
       SET is_read = TRUE,
           read_at = CURRENT_TIMESTAMP;`,
      [requestId, username, ...scopeSql.params]
    );
    emitToUser(username, 'notification:sync', {
      action: 'READ_BY_REQUEST',
      requestId,
    });
  }

  async markAllRead(username: string, scope: RequestAccessScope): Promise<void> {
    const scopeSql = buildNotificationScopeSql(scope, 1, 2);

    await query(
      `INSERT INTO notification_reads (notification_id, username, is_read, is_hidden, read_at)
       SELECT n.id, $1, TRUE, COALESCE(nr.is_hidden, FALSE), CURRENT_TIMESTAMP
       FROM notifications n
       LEFT JOIN requests r ON r.id = n.request_id
       LEFT JOIN notification_reads nr
         ON nr.notification_id = n.id AND nr.username = $1
       WHERE ${scopeSql.clause}
         AND COALESCE(nr.is_read, FALSE) = FALSE
       ON CONFLICT (notification_id, username) DO UPDATE
       SET is_read = TRUE,
           read_at = CURRENT_TIMESTAMP;`,
      [username, ...scopeSql.params]
    );
    emitToUser(username, 'notification:sync', { action: 'READ_ALL' });
  }
}

export const notificationService = new NotificationService();
