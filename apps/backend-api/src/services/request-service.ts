import { query } from '../config/database.js';
import {
  AuditAction,
  CreateRequestDto,
  RequestAnalyticsSummary,
  RequestAuditLogEntity,
  RequestEntity,
  RequestPriority,
  RequestStatus,
} from '../types/request.js';

const ELEVATED_ROLES = new Set(['canbo', 'giangvien', 'admin']);

export function hasElevatedRole(roles: string[]): boolean {
  return roles.some((role) => ELEVATED_ROLES.has(role.toLowerCase()));
}

export class RequestService {
  async recordAuditLog(params: {
    requestId: string;
    actor: string;
    actorRoles: string[];
    action: AuditAction;
    fromStatus?: RequestStatus | null;
    toStatus?: RequestStatus | null;
    note?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<RequestAuditLogEntity> {
    const sql = `
      INSERT INTO request_audit_logs
        (request_id, actor, actor_roles, action, from_status, to_status, note, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      RETURNING *;
    `;
    const values = [
      params.requestId,
      params.actor,
      params.actorRoles,
      params.action,
      params.fromStatus ?? null,
      params.toStatus ?? null,
      params.note ?? null,
      JSON.stringify(params.metadata ?? {}),
    ];
    const result = await query(sql, values);
    return result.rows[0] as RequestAuditLogEntity;
  }

  async createRequest(
    dto: CreateRequestDto,
    createdBy: string,
    actorRoles: string[],
    categoryDisplayName?: string
  ): Promise<RequestEntity> {
    const category = (dto.category || 'OTHER').trim().toUpperCase();
    const priority: RequestPriority = dto.priority ?? 'NORMAL';
    const customLabel = dto.custom_category_label?.trim() || null;

    const sql = `
      INSERT INTO requests
        (title, description, category, custom_category_label, priority, created_by, attachment_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const values = [
      dto.title.trim(),
      dto.description ? dto.description.trim() : null,
      category,
      customLabel,
      priority,
      createdBy,
      dto.attachment_url || null,
    ];

    const result = await query(sql, values);
    const created = result.rows[0] as RequestEntity;

    const labelForLog = customLabel || categoryDisplayName || category;
    await this.recordAuditLog({
      requestId: created.id,
      actor: createdBy,
      actorRoles,
      action: 'CREATED',
      fromStatus: null,
      toStatus: 'PENDING',
      note: `Tạo yêu cầu (${labelForLog})`,
      metadata: {
        category,
        custom_category_label: customLabel,
        priority,
        has_attachment: Boolean(created.attachment_url),
      },
    });

    return created;
  }

  async attachWorkflowExecution(
    requestId: string,
    executionId: string,
    event: string,
    actor: string,
    actorRoles: string[]
  ): Promise<void> {
    await query(
      `UPDATE requests SET workflow_execution_id = $1 WHERE id = $2;`,
      [executionId, requestId]
    );

    await this.recordAuditLog({
      requestId,
      actor,
      actorRoles,
      action: 'WORKFLOW_DISPATCHED',
      note: 'Đã chuyển tự động tới bộ phận tiếp nhận',
      metadata: {
        event,
        execution_id: executionId,
      },
    });
  }

  async getRequests(username: string, roles: string[]): Promise<RequestEntity[]> {
    if (hasElevatedRole(roles)) {
      const result = await query(`SELECT * FROM requests ORDER BY created_at DESC;`);
      return result.rows as RequestEntity[];
    }

    const result = await query(
      `SELECT * FROM requests WHERE created_by = $1 ORDER BY created_at DESC;`,
      [username]
    );
    return result.rows as RequestEntity[];
  }

  async getRequestById(id: string): Promise<RequestEntity | null> {
    const result = await query(`SELECT * FROM requests WHERE id = $1;`, [id]);
    return (result.rows[0] as RequestEntity) || null;
  }

  async getAuditLogsByRequestId(requestId: string): Promise<RequestAuditLogEntity[]> {
    const result = await query(
      `SELECT * FROM request_audit_logs WHERE request_id = $1 ORDER BY created_at ASC;`,
      [requestId]
    );
    return result.rows as RequestAuditLogEntity[];
  }

  async updateRequestStatus(params: {
    id: string;
    fromStatus: RequestStatus;
    toStatus: RequestStatus;
    reviewedBy: string;
    reviewerRoles: string[];
    reviewNote?: string;
  }): Promise<RequestEntity | null> {
    const cleanNote = params.reviewNote?.trim() || null;

    const sql = `
      UPDATE requests
      SET status = $1,
          reviewed_by = $2,
          review_note = $3,
          reviewed_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *;
    `;
    const result = await query(sql, [
      params.toStatus,
      params.reviewedBy,
      cleanNote,
      params.id,
    ]);
    const updated = (result.rows[0] as RequestEntity) || null;

    if (updated) {
      await this.recordAuditLog({
        requestId: updated.id,
        actor: params.reviewedBy,
        actorRoles: params.reviewerRoles,
        action: params.toStatus,
        fromStatus: params.fromStatus,
        toStatus: params.toStatus,
        note:
          cleanNote ||
          (params.toStatus === 'APPROVED'
            ? 'Đã phê duyệt yêu cầu'
            : 'Đã cập nhật trạng thái'),
      });
    }

    return updated;
  }

  async getAnalytics(
    username: string,
    roles: string[]
  ): Promise<RequestAnalyticsSummary> {
    const elevated = hasElevatedRole(roles);
    const whereClause = elevated ? '' : 'WHERE created_by = $1';
    const params = elevated ? [] : [username];

    const summaryResult = await query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS approved,
        COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS rejected,
        COUNT(*) FILTER (WHERE priority = 'NORMAL')::int AS pri_normal,
        COUNT(*) FILTER (WHERE priority = 'HIGH')::int AS pri_high,
        COUNT(*) FILTER (WHERE priority = 'URGENT')::int AS pri_urgent,
        ROUND(
          AVG(EXTRACT(EPOCH FROM (reviewed_at - created_at)) / 3600.0)
          FILTER (WHERE reviewed_at IS NOT NULL)::numeric,
          1
        ) AS avg_resolution_hours
      FROM requests
      ${whereClause};
      `,
      params
    );

    const row = summaryResult.rows[0] || {};
    const total = Number(row.total || 0);
    const approved = Number(row.approved || 0);
    const rejected = Number(row.rejected || 0);
    const pending = Number(row.pending || 0);
    const completionRate =
      total > 0 ? Math.round(((approved + rejected) / total) * 100) : 0;

    // Nhóm động theo toàn bộ danh mục trong bảng request_categories + dữ liệu thực tế
    const catJoinWhere = elevated ? '' : 'WHERE r.created_by = $1';
    const categoryResult = await query(
      `
      SELECT
        COALESCE(c.code, r.category) AS code,
        COALESCE(c.name, r.custom_category_label, r.category) AS name,
        COALESCE(c.department, 'Văn phòng Trường') AS department,
        COUNT(r.id)::int AS count
      FROM requests r
      LEFT JOIN request_categories c ON UPPER(c.code) = UPPER(r.category)
      ${catJoinWhere}
      GROUP BY COALESCE(c.code, r.category),
               COALESCE(c.name, r.custom_category_label, r.category),
               COALESCE(c.department, 'Văn phòng Trường')
      ORDER BY count DESC, name ASC;
      `,
      params
    );

    const trendWhere = elevated
      ? `WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'`
      : `WHERE created_by = $1 AND created_at >= CURRENT_DATE - INTERVAL '6 days'`;

    const trendResult = await query(
      `
      SELECT
        TO_CHAR(DATE(created_at), 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS approved,
        COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS rejected,
        COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending
      FROM requests
      ${trendWhere}
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) ASC;
      `,
      params
    );

    return {
      scope: elevated ? 'ALL' : 'PERSONAL',
      total,
      by_status: {
        PENDING: pending,
        APPROVED: approved,
        REJECTED: rejected,
      },
      categories: categoryResult.rows.map((r) => ({
        code: String(r.code),
        name: String(r.name),
        department: String(r.department),
        count: Number(r.count || 0),
      })),
      by_priority: {
        NORMAL: Number(row.pri_normal || 0),
        HIGH: Number(row.pri_high || 0),
        URGENT: Number(row.pri_urgent || 0),
      },
      completion_rate: completionRate,
      avg_resolution_hours:
        row.avg_resolution_hours !== null && row.avg_resolution_hours !== undefined
          ? Number(row.avg_resolution_hours)
          : null,
      daily_trend: trendResult.rows.map((r) => ({
        date: String(r.date),
        total: Number(r.total || 0),
        approved: Number(r.approved || 0),
        rejected: Number(r.rejected || 0),
        pending: Number(r.pending || 0),
      })),
    };
  }
}

export const requestService = new RequestService();
