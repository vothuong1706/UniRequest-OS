// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import { query as defaultQuery } from '../config/database.js';
import { config } from '../config/environment.js';
import {
  AuditAction,
  RequestPriority,
  RequestStatus,
} from '../types/request.js';
import {
  AUDIT_GENESIS_HASH,
  computeAuditEntryHash,
  VerifiableAuditEntry,
} from './audit-hash-chain.js';

export type DbQueryFn = (
  text: string,
  params?: unknown[]
) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;

export interface SeedCategorySpec {
  code: string;
  name: string;
  department: string;
  sla_hours: number;
  requires_evidence: boolean;
  sort_order: number;
}

export interface SeedRequestSpec {
  id: string;
  title: string;
  description: string;
  category: string;
  target_department: string;
  priority: RequestPriority;
  status: RequestStatus;
  created_by: string;
  hoursAgo: number;
  reviewed_by?: string;
  reviewer_roles?: string[];
  review_note?: string;
  reviewDelayHours?: number;
  workflow_execution_id: string;
}

export interface SeedCommentSpec {
  id: string;
  request_id: string;
  author_username: string;
  author_role: string;
  content: string;
  offsetMinutesAfterCreate: number;
}

export interface SeedNotificationSpec {
  id: string;
  recipient_username: string | null;
  recipient_role: string | null;
  recipient_department: string | null;
  request_id: string;
  type: string;
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'URGENT';
  title: string;
  message: string;
  actor: string;
  offsetMinutesAfterCreate: number;
}

export interface SeedDataset {
  schema_version?: string;
  departments: string[];
  categories: SeedCategorySpec[];
  requests: SeedRequestSpec[];
  comments: SeedCommentSpec[];
  notifications: SeedNotificationSpec[];
}

export interface SeedAuditRow extends VerifiableAuditEntry {
  id: string;
  actor_roles: string[];
  from_status: RequestStatus | null;
  metadata: Record<string, unknown>;
  prev_hash: string;
  entry_hash: string;
  created_at: Date;
}

export interface SeedExecutionSummary {
  skipped: boolean;
  dataFile: string | null;
  categoriesInserted: number;
  requestsInserted: number;
  auditLogsInserted: number;
  commentsInserted: number;
  notificationsInserted: number;
}

/**
 * Tìm tệp dữ liệu seed bên ngoài (ưu tiên SEED_DATA_FILE, sau đó vị trí chuẩn trong Docker / repo).
 * Không nhúng dữ liệu mẫu cố định vào mã nguồn TypeScript.
 */
export function resolveSeedDataFilePath(explicitPath?: string): string {
  const configuredPath = explicitPath?.trim() || config.seed.dataFile.trim();
  if (configuredPath) {
    const resolved = path.resolve(configuredPath);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return resolved;
    }
    throw new Error(
      `Không tìm thấy tệp dữ liệu mẫu theo đường dẫn chỉ định: ${resolved}`
    );
  }

  const candidates = [
    path.resolve(process.cwd(), 'seed/demo-data.json'),
    path.resolve(process.cwd(), 'config/seed/demo-data.json'),
    path.resolve(process.cwd(), '../../config/seed/demo-data.json'),
  ];

  for (const resolved of candidates) {
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return resolved;
    }
  }

  throw new Error(
    `Không tìm thấy tệp dữ liệu mẫu bên ngoài (đã kiểm tra: ${candidates.join(', ')}). Hãy cấu hình SEED_DATA_FILE.`
  );
}

/**
 * Đọc và xác thực cấu trúc tệp dữ liệu seed JSON bên ngoài.
 */
export function loadSeedDataset(explicitPath?: string): {
  filePath: string;
  dataset: SeedDataset;
} {
  const filePath = resolveSeedDataFilePath(explicitPath);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<SeedDataset>;

  if (
    !Array.isArray(parsed.categories) ||
    !Array.isArray(parsed.requests) ||
    !Array.isArray(parsed.comments) ||
    !Array.isArray(parsed.notifications)
  ) {
    throw new Error(
      `Tệp dữ liệu mẫu không đúng cấu trúc (cần đủ categories, requests, comments, notifications): ${filePath}`
    );
  }

  return {
    filePath,
    dataset: {
      schema_version: parsed.schema_version,
      departments: Array.isArray(parsed.departments) ? parsed.departments : [],
      categories: parsed.categories,
      requests: parsed.requests,
      comments: parsed.comments,
      notifications: parsed.notifications,
    },
  };
}

function floorToSecond(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}

function makeDeterministicAuditId(requestIndex: number, stepIndex: number): string {
  const reqHex = String(requestIndex + 1).padStart(4, '0');
  const stepHex = String(stepIndex + 1).padStart(8, '0');
  return `40000000-0000-4000-${reqHex}-0000${stepHex}`;
}

/**
 * Tính động chuỗi nhật ký kiểm toán SHA-256 hợp lệ 100% cho 1 yêu cầu mẫu bằng computeAuditEntryHash().
 */
export function buildSeedAuditChainForRequest(
  spec: SeedRequestSpec,
  requestIndex: number,
  categoryName: string,
  baseNow: Date
): { createdAt: Date; reviewedAt: Date | null; auditRows: SeedAuditRow[] } {
  const createdAt = floorToSecond(
    new Date(baseNow.getTime() - spec.hoursAgo * 3600 * 1000)
  );
  const dispatchAt = floorToSecond(new Date(createdAt.getTime() + 15 * 1000));
  const reviewedAt =
    spec.status !== 'PENDING' && spec.reviewDelayHours !== undefined
      ? floorToSecond(
          new Date(createdAt.getTime() + spec.reviewDelayHours * 3600 * 1000)
        )
      : null;

  const auditRows: SeedAuditRow[] = [];
  let prevHash = AUDIT_GENESIS_HASH;

  const pushEntry = (params: {
    stepIndex: number;
    actor: string;
    actorRoles: string[];
    action: AuditAction;
    fromStatus: RequestStatus | null;
    toStatus: RequestStatus | null;
    note: string | null;
    metadata: Record<string, unknown>;
    at: Date;
  }) => {
    const entryHash = computeAuditEntryHash({
      prevHash,
      requestId: spec.id,
      actor: params.actor,
      action: params.action,
      toStatus: params.toStatus,
      note: params.note,
      createdAt: params.at,
    });

    auditRows.push({
      id: makeDeterministicAuditId(requestIndex, params.stepIndex),
      request_id: spec.id,
      actor: params.actor,
      actor_roles: params.actorRoles,
      action: params.action,
      from_status: params.fromStatus,
      to_status: params.toStatus,
      note: params.note,
      metadata: params.metadata,
      prev_hash: prevHash,
      entry_hash: entryHash,
      created_at: params.at,
    });

    prevHash = entryHash;
  };

  pushEntry({
    stepIndex: 0,
    actor: spec.created_by,
    actorRoles: ['sinhvien'],
    action: 'CREATED',
    fromStatus: null,
    toStatus: 'PENDING',
    note: `Tạo yêu cầu (${categoryName})`,
    metadata: {
      category: spec.category,
      target_department: spec.target_department,
      priority: spec.priority,
      seeded: true,
    },
    at: createdAt,
  });

  pushEntry({
    stepIndex: 1,
    actor: spec.created_by,
    actorRoles: ['sinhvien'],
    action: 'WORKFLOW_DISPATCHED',
    fromStatus: null,
    toStatus: null,
    note: 'Đã chuyển tự động tới bộ phận tiếp nhận',
    metadata: {
      event: 'request.created',
      execution_id: spec.workflow_execution_id,
      seeded: true,
    },
    at: dispatchAt,
  });

  if (spec.status !== 'PENDING' && spec.reviewed_by && reviewedAt) {
    pushEntry({
      stepIndex: 2,
      actor: spec.reviewed_by,
      actorRoles: spec.reviewer_roles || ['canbo'],
      action: spec.status,
      fromStatus: 'PENDING',
      toStatus: spec.status,
      note: spec.review_note || 'Đã cập nhật trạng thái',
      metadata: {
        seeded: true,
      },
      at: reviewedAt,
    });
  }

  return { createdAt, reviewedAt, auditRows };
}

/**
 * Nạp dữ liệu mẫu từ tệp JSON bên ngoài theo kiểu idempotent (ON CONFLICT DO NOTHING).
 */
export async function seedDemoData(
  dbQuery: DbQueryFn = defaultQuery,
  options?: { baseNow?: Date; dataFile?: string }
): Promise<SeedExecutionSummary> {
  const baseNow = options?.baseNow ?? new Date();
  const { filePath, dataset } = loadSeedDataset(options?.dataFile);

  const categoryNameByCode = new Map<string, string>();
  let categoriesInserted = 0;

  for (const cat of dataset.categories) {
    categoryNameByCode.set(cat.code, cat.name);
    const res = await dbQuery(
      `INSERT INTO request_categories
         (code, name, department, sla_hours, requires_evidence, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6)
       ON CONFLICT (code) DO NOTHING
       RETURNING code;`,
      [
        cat.code,
        cat.name,
        cat.department,
        cat.sla_hours,
        cat.requires_evidence,
        cat.sort_order,
      ]
    );
    if (res.rows.length > 0) {
      categoriesInserted += 1;
    }
  }

  let requestsInserted = 0;
  let auditLogsInserted = 0;
  const createdAtByRequestId = new Map<string, Date>();

  for (let i = 0; i < dataset.requests.length; i++) {
    const spec = dataset.requests[i];
    const categoryName = categoryNameByCode.get(spec.category) || spec.category;
    const { createdAt, reviewedAt, auditRows } = buildSeedAuditChainForRequest(
      spec,
      i,
      categoryName,
      baseNow
    );
    createdAtByRequestId.set(spec.id, createdAt);

    const reqRes = await dbQuery(
      `INSERT INTO requests
         (id, title, description, category, target_department, priority, status,
          created_by, reviewed_by, review_note, reviewed_at, workflow_execution_id,
          created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO NOTHING
       RETURNING id;`,
      [
        spec.id,
        spec.title,
        spec.description,
        spec.category,
        spec.target_department,
        spec.priority,
        spec.status,
        spec.created_by,
        spec.reviewed_by ?? null,
        spec.review_note ?? null,
        reviewedAt,
        spec.workflow_execution_id,
        createdAt,
        reviewedAt ?? createdAt,
      ]
    );

    if (reqRes.rows.length > 0) {
      requestsInserted += 1;
      for (const audit of auditRows) {
        const auditRes = await dbQuery(
          `INSERT INTO request_audit_logs
             (id, request_id, actor, actor_roles, action, from_status, to_status,
              note, metadata, prev_hash, entry_hash, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12)
           ON CONFLICT (id) DO NOTHING
           RETURNING id;`,
          [
            audit.id,
            audit.request_id,
            audit.actor,
            audit.actor_roles,
            audit.action,
            audit.from_status,
            audit.to_status,
            audit.note,
            JSON.stringify(audit.metadata),
            audit.prev_hash,
            audit.entry_hash,
            audit.created_at,
          ]
        );
        if (auditRes.rows.length > 0) {
          auditLogsInserted += 1;
        }
      }
    }
  }

  let commentsInserted = 0;
  for (const comment of dataset.comments) {
    const reqCreatedAt = createdAtByRequestId.get(comment.request_id) ?? baseNow;
    const commentAt = floorToSecond(
      new Date(reqCreatedAt.getTime() + comment.offsetMinutesAfterCreate * 60 * 1000)
    );
    const res = await dbQuery(
      `INSERT INTO request_comments
         (id, request_id, author_username, author_role, content, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING
       RETURNING id;`,
      [
        comment.id,
        comment.request_id,
        comment.author_username,
        comment.author_role,
        comment.content,
        commentAt,
      ]
    );
    if (res.rows.length > 0) {
      commentsInserted += 1;
    }
  }

  let notificationsInserted = 0;
  for (const noti of dataset.notifications) {
    const reqCreatedAt = createdAtByRequestId.get(noti.request_id) ?? baseNow;
    const notiAt = floorToSecond(
      new Date(reqCreatedAt.getTime() + noti.offsetMinutesAfterCreate * 60 * 1000)
    );
    const res = await dbQuery(
      `INSERT INTO notifications
         (id, recipient_username, recipient_role, recipient_department, request_id,
          type, severity, title, message, actor, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO NOTHING
       RETURNING id;`,
      [
        noti.id,
        noti.recipient_username,
        noti.recipient_role,
        noti.recipient_department,
        noti.request_id,
        noti.type,
        noti.severity,
        noti.title,
        noti.message,
        noti.actor,
        notiAt,
      ]
    );
    if (res.rows.length > 0) {
      notificationsInserted += 1;
    }
  }

  return {
    skipped: false,
    dataFile: filePath,
    categoriesInserted,
    requestsInserted,
    auditLogsInserted,
    commentsInserted,
    notificationsInserted,
  };
}

/**
 * Tự động chạy seed khi khởi động Backend trên máy sạch (chỉ khi cả 2 bảng
 * request_categories và requests đều trống và SEED_DEMO_DATA !== 'false').
 */
export async function seedDemoDataIfEmpty(
  dbQuery: DbQueryFn = defaultQuery,
  options?: { enabled?: boolean; baseNow?: Date; dataFile?: string }
): Promise<SeedExecutionSummary> {
  const enabled = options?.enabled ?? config.seed.enabled;
  if (!enabled) {
    return {
      skipped: true,
      dataFile: null,
      categoriesInserted: 0,
      requestsInserted: 0,
      auditLogsInserted: 0,
      commentsInserted: 0,
      notificationsInserted: 0,
    };
  }

  const countRes = await dbQuery(
    `SELECT
       (SELECT COUNT(*)::int FROM request_categories) AS category_count,
       (SELECT COUNT(*)::int FROM requests) AS request_count;`
  );
  const row = countRes.rows[0] || {};
  const categoryCount = Number(row.category_count || 0);
  const requestCount = Number(row.request_count || 0);

  if (categoryCount > 0 || requestCount > 0) {
    return {
      skipped: true,
      dataFile: null,
      categoriesInserted: 0,
      requestsInserted: 0,
      auditLogsInserted: 0,
      commentsInserted: 0,
      notificationsInserted: 0,
    };
  }

  const summary = await seedDemoData(dbQuery, {
    baseNow: options?.baseNow,
    dataFile: options?.dataFile,
  });
  console.log(
    `[Seed] Khởi tạo dữ liệu mẫu máy sạch từ ${summary.dataFile}: ${summary.categoriesInserted} danh mục, ${summary.requestsInserted} yêu cầu, ${summary.auditLogsInserted} audit SHA-256, ${summary.commentsInserted} bình luận, ${summary.notificationsInserted} thông báo.`
  );
  return summary;
}
