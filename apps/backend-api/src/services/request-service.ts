// SPDX-License-Identifier: Apache-2.0
import { query } from '../config/database.js';
import {
  AuditAction,
  CreateRequestDto,
  KeycloakUser,
  RequestAccessScope,
  RequestAnalyticsSummary,
  RequestAuditLogEntity,
  RequestDeleteMode,
  RequestEntity,
  RequestPriority,
  RequestStatus,
} from '../types/request.js';
import {
  AUDIT_GENESIS_HASH,
  computeAuditEntryHash,
} from '../utils/audit-hash-chain.js';

const ELEVATED_ROLES = new Set(['canbo', 'giangvien', 'admin']);

export function hasElevatedRole(roles: string[]): boolean {
  return roles.some((role) => ELEVATED_ROLES.has(role.toLowerCase()));
}

/**
 * Chuẩn hóa danh sách Group từ JWT Token (hỗ trợ mọi tên group và path lồng nhau, vd: "CTSV", "KETOAN", "Lớp/K11A1").
 */
export function extractDepartmentGroups(groups: string[] = []): string[] {
  return Array.from(
    new Set(
      groups
        .map((group) => group.trim().replace(/^\/+/, ''))
        .filter((group) => group.length > 0)
    )
  );
}

/**
 * Xác định phạm vi dữ liệu theo thứ tự ưu tiên:
 * 1. Role admin -> toàn trường (ALL)
 * 2. Thuộc bất kỳ Group Keycloak nào (trừ trường hợp chỉ là sinhvien) -> lọc theo group đó và các group con bên trong (DEPARTMENT)
 * 3. Cán bộ / giảng viên không gắn Group -> toàn trường (ALL)
 * 4. Sinh viên -> chỉ yêu cầu do chính mình tạo (PERSONAL)
 */
export function resolveRequestAccessScope(
  user: Pick<KeycloakUser, 'preferred_username' | 'roles' | 'groups'>
): RequestAccessScope {
  const roles = user.roles || [];
  const lowerRoles = roles.map((r) => r.toLowerCase());

  if (lowerRoles.includes('admin')) {
    return { type: 'ALL' };
  }

  const departmentGroups = extractDepartmentGroups(user.groups);
  const elevated = hasElevatedRole(roles);
  const isStudentOnly = lowerRoles.includes('sinhvien') && !elevated;

  if (departmentGroups.length > 0 && !isStudentOnly) {
    return { type: 'DEPARTMENT', departments: departmentGroups };
  }

  if (elevated) {
    return { type: 'ALL' };
  }

  return { type: 'PERSONAL', username: user.preferred_username };
}

export function hasStaffOrDepartmentAccess(
  user: Pick<KeycloakUser, 'roles' | 'groups'>
): boolean {
  const roles = user.roles || [];
  if (hasElevatedRole(roles)) return true;
  const isStudent = roles.some((r) => r.toLowerCase() === 'sinhvien');
  return !isStudent && extractDepartmentGroups(user.groups).length > 0;
}

export function matchesDepartmentAccess(
  userDepartments: string[],
  targetDepartment?: string | null
): boolean {
  const normalizedTarget = targetDepartment?.trim().replace(/^\/+/, '');
  if (!normalizedTarget) return false;

  return userDepartments.some(
    (dept) =>
      normalizedTarget === dept ||
      normalizedTarget.startsWith(`${dept}/`) ||
      (!dept.includes('/') && normalizedTarget.endsWith(`/${dept}`))
  );
}

export function canViewRequest(
  user: Pick<KeycloakUser, 'preferred_username' | 'roles' | 'groups'>,
  request: Pick<
    RequestEntity,
    'created_by' | 'target_department' | 'hidden_by_sender' | 'hidden_by_receiver'
  >
): boolean {
  if (request.created_by === user.preferred_username && !request.hidden_by_sender) {
    return true;
  }
  const scope = resolveRequestAccessScope(user);
  if (scope.type === 'ALL') {
    return !request.hidden_by_receiver;
  }
  if (scope.type === 'DEPARTMENT') {
    return (
      !request.hidden_by_receiver &&
      matchesDepartmentAccess(scope.departments, request.target_department)
    );
  }
  return false;
}

export function canReviewRequest(
  user: Pick<KeycloakUser, 'preferred_username' | 'roles' | 'groups'>,
  request: Pick<RequestEntity, 'target_department'>
): boolean {
  const scope = resolveRequestAccessScope(user);
  if (scope.type === 'ALL') return true;
  if (scope.type === 'DEPARTMENT') {
    return matchesDepartmentAccess(scope.departments, request.target_department);
  }
  return false;
}

function escapeSqlLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export function buildDepartmentMatchSql(
  departments: string[],
  columnExpr: string,
  startIndex = 1
): { condition: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  for (const dept of departments) {
    const exactIdx = startIndex + params.length;
    params.push(dept);
    const childIdx = startIndex + params.length;
    params.push(`${escapeSqlLike(dept)}/%`);

    if (!dept.includes('/')) {
      const leafIdx = startIndex + params.length;
      params.push(`%/${escapeSqlLike(dept)}`);
      clauses.push(
        `(${columnExpr} = $${exactIdx} OR ${columnExpr} LIKE $${childIdx} ESCAPE '\\' OR ${columnExpr} LIKE $${leafIdx} ESCAPE '\\')`
      );
    } else {
      clauses.push(
        `(${columnExpr} = $${exactIdx} OR ${columnExpr} LIKE $${childIdx} ESCAPE '\\')`
      );
    }
  }

  return {
    condition: `(${clauses.join(' OR ')})`,
    params,
  };
}

function buildScopeCondition(
  scope: RequestAccessScope,
  username: string,
  options: { alias?: string; includePersonalForStaff?: boolean } = {}
): { condition: string; params: unknown[] } {
  const prefix = options.alias ? `${options.alias}.` : '';
  const includePersonal = options.includePersonalForStaff ?? false;

  if (scope.type === 'ALL') {
    if (includePersonal) {
      return {
        condition: `(${prefix}hidden_by_receiver = FALSE OR (${prefix}created_by = $1 AND ${prefix}hidden_by_sender = FALSE))`,
        params: [username],
      };
    }
    return {
      condition: `${prefix}hidden_by_receiver = FALSE`,
      params: [],
    };
  }

  if (scope.type === 'DEPARTMENT') {
    const deptMatch = buildDepartmentMatchSql(
      scope.departments,
      `${prefix}target_department`,
      1
    );
    if (includePersonal) {
      const userIdx = deptMatch.params.length + 1;
      return {
        condition: `((${deptMatch.condition} AND ${prefix}hidden_by_receiver = FALSE) OR (${prefix}created_by = $${userIdx} AND ${prefix}hidden_by_sender = FALSE))`,
        params: [...deptMatch.params, username],
      };
    }
    return {
      condition: `(${deptMatch.condition} AND ${prefix}hidden_by_receiver = FALSE)`,
      params: deptMatch.params,
    };
  }

  return {
    condition: `${prefix}created_by = $1 AND ${prefix}hidden_by_sender = FALSE`,
    params: [scope.username],
  };
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
    const latestRes = await query(
      `SELECT entry_hash, created_at
       FROM request_audit_logs
       WHERE request_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 1;`,
      [params.requestId]
    );
    const latestRow = latestRes.rows[0] as
      | { entry_hash?: string | null; created_at?: Date | string }
      | undefined;

    const prevHash = latestRow?.entry_hash || AUDIT_GENESIS_HASH;
    const now = new Date();
    const lastTs = latestRow?.created_at ? new Date(latestRow.created_at).getTime() : 0;
    const createdAt = lastTs >= now.getTime() ? new Date(lastTs + 5) : now;

    const entryHash = computeAuditEntryHash({
      prevHash,
      requestId: params.requestId,
      actor: params.actor,
      action: params.action,
      toStatus: params.toStatus ?? null,
      note: params.note ?? null,
      createdAt,
    });

    const sql = `
      INSERT INTO request_audit_logs
        (request_id, actor, actor_roles, action, from_status, to_status, note, metadata, prev_hash, entry_hash, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)
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
      prevHash,
      entryHash,
      createdAt,
    ];
    const result = await query(sql, values);
    return result.rows[0] as RequestAuditLogEntity;
  }

  /**
   * Niêm phong SHA-256 cho các bản ghi kiểm toán cũ chưa có prev_hash/entry_hash (chạy idempotent khi khởi động).
   */
  async backfillAuditHashChain(): Promise<void> {
    const pendingReqs = await query(
      `SELECT DISTINCT request_id FROM request_audit_logs WHERE entry_hash IS NULL;`
    );
    for (const reqRow of pendingReqs.rows as Array<{ request_id: string }>) {
      const logsRes = await query(
        `SELECT * FROM request_audit_logs WHERE request_id = $1 ORDER BY created_at ASC, id ASC;`,
        [reqRow.request_id]
      );
      const logs = logsRes.rows as RequestAuditLogEntity[];
      let prevHash = AUDIT_GENESIS_HASH;

      for (const entry of logs) {
        if (entry.entry_hash && entry.prev_hash) {
          prevHash = entry.entry_hash;
          continue;
        }
        const computed = computeAuditEntryHash({
          prevHash,
          requestId: entry.request_id,
          actor: entry.actor,
          action: entry.action,
          toStatus: entry.to_status,
          note: entry.note,
          createdAt: entry.created_at,
        });
        await query(
          `UPDATE request_audit_logs
           SET prev_hash = $1, entry_hash = $2
           WHERE id = $3 AND entry_hash IS NULL;`,
          [prevHash, computed, entry.id]
        );
        prevHash = computed;
      }
    }
  }

  async backfillSenderGroups(
    resolver: (username: string) => Promise<string | null>
  ): Promise<{ total: number; updated: number }> {
    const missingRes = await query(
      `SELECT DISTINCT created_by FROM requests WHERE sender_group IS NULL;`
    );
    const usernames = (missingRes.rows as Array<{ created_by: string }>)
      .map((r) => r.created_by)
      .filter(Boolean);

    let updated = 0;
    for (const username of usernames) {
      const label = await resolver(username);
      if (!label) continue;
      const res = await query(
        `UPDATE requests
         SET sender_group = $1
         WHERE created_by = $2 AND sender_group IS NULL;`,
        [label, username]
      );
      updated += Number(res.rowCount || 0);
    }
    return { total: usernames.length, updated };
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
    const targetDepartment = dto.target_department?.trim() || null;
    const senderGroup = dto.sender_group?.trim() || null;

    const sql = `
      INSERT INTO requests
        (title, description, category, custom_category_label, target_department, sender_group, priority, created_by, attachment_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;
    const values = [
      dto.title.trim(),
      dto.description ? dto.description.trim() : null,
      category,
      customLabel,
      targetDepartment,
      senderGroup,
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
        target_department: targetDepartment,
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

  async getRequests(
    user: Pick<KeycloakUser, 'preferred_username' | 'roles' | 'groups'>
  ): Promise<RequestEntity[]> {
    const scope = resolveRequestAccessScope(user);
    const { condition, params } = buildScopeCondition(
      scope,
      user.preferred_username,
      { includePersonalForStaff: true }
    );
    const whereClause = condition ? `WHERE ${condition}` : '';

    const result = await query(
      `SELECT * FROM requests ${whereClause} ORDER BY created_at DESC;`,
      params
    );
    return result.rows as RequestEntity[];
  }

  async getRequestById(id: string): Promise<RequestEntity | null> {
    const result = await query(`SELECT * FROM requests WHERE id = $1;`, [id]);
    return (result.rows[0] as RequestEntity) || null;
  }

  async getAuditLogsByRequestId(requestId: string): Promise<RequestAuditLogEntity[]> {
    const result = await query(
      `SELECT * FROM request_audit_logs WHERE request_id = $1 ORDER BY created_at ASC, id ASC;`,
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

  async deleteRequests(
    ids: string[],
    user: Pick<KeycloakUser, 'preferred_username' | 'roles' | 'groups'>,
    mode?: RequestDeleteMode
  ): Promise<{
    deleted: Array<Pick<RequestEntity, 'id' | 'created_by' | 'target_department'>>;
    side: 'sender' | 'receiver';
    forbidden: boolean;
  }> {
    const scope = resolveRequestAccessScope(user);
    const side: 'sender' | 'receiver' =
      scope.type === 'PERSONAL' || mode === 'history' ? 'sender' : 'receiver';

    if (ids.length === 0) {
      return { deleted: [], side, forbidden: false };
    }

    const existingRes = await query(
      `SELECT id, created_by, target_department, hidden_by_sender, hidden_by_receiver
       FROM requests
       WHERE id = ANY($1::uuid[]);`,
      [ids]
    );

    const existingRows = existingRes.rows as Array<
      Pick<
        RequestEntity,
        | 'id'
        | 'created_by'
        | 'target_department'
        | 'hidden_by_sender'
        | 'hidden_by_receiver'
      >
    >;
    if (existingRows.length === 0) {
      return { deleted: [], side, forbidden: false };
    }

    for (const row of existingRows) {
      if (side === 'sender') {
        if (row.created_by !== user.preferred_username) {
          return { deleted: [], side, forbidden: true };
        }
      } else if (!canReviewRequest(user, row)) {
        return { deleted: [], side, forbidden: true };
      }
    }

    const authorizedIds = existingRows.map((row) => row.id);
    const updateSql =
      side === 'sender'
        ? `UPDATE requests
           SET hidden_by_sender = TRUE
           WHERE id = ANY($1::uuid[])
           RETURNING id, created_by, target_department;`
        : `UPDATE requests
           SET hidden_by_receiver = TRUE
           WHERE id = ANY($1::uuid[])
           RETURNING id, created_by, target_department;`;

    const updatedRes = await query(updateSql, [authorizedIds]);

    // Tự động xóa vĩnh viễn khỏi PostgreSQL khi cả Người gửi lẫn Người nhận đều đã xóa
    await query(
      `DELETE FROM requests
       WHERE id = ANY($1::uuid[])
         AND hidden_by_sender = TRUE
         AND hidden_by_receiver = TRUE;`,
      [authorizedIds]
    );

    return {
      deleted: updatedRes.rows as Array<
        Pick<RequestEntity, 'id' | 'created_by' | 'target_department'>
      >,
      side,
      forbidden: false,
    };
  }

  async getAnalytics(
    user: Pick<KeycloakUser, 'preferred_username' | 'roles' | 'groups'>
  ): Promise<RequestAnalyticsSummary> {
    const scope = resolveRequestAccessScope(user);
    const { condition, params } = buildScopeCondition(
      scope,
      user.preferred_username,
      { includePersonalForStaff: false }
    );
    const whereClause = condition ? `WHERE ${condition}` : '';

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
    const { condition: catCondition } = buildScopeCondition(
      scope,
      user.preferred_username,
      { alias: 'r', includePersonalForStaff: false }
    );
    const catJoinWhere = catCondition ? `WHERE ${catCondition}` : '';
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

    const trendWhere = condition
      ? `WHERE ${condition} AND created_at >= CURRENT_DATE - INTERVAL '6 days'`
      : `WHERE created_at >= CURRENT_DATE - INTERVAL '6 days'`;

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
      scope: scope.type,
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
