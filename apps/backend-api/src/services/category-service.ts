// SPDX-License-Identifier: Apache-2.0
import { query } from '../config/database.js';
import {
  CreateCategoryDto,
  KeycloakUser,
  RequestAccessScope,
  RequestCategoryEntity,
  UpdateCategoryDto,
} from '../types/request.js';
import {
  buildDepartmentMatchSql,
  canReviewRequest,
  resolveRequestAccessScope,
} from './request-service.js';

function slugifyPart(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildCategoryCode(department: string, name: string, explicitCode?: string): string {
  if (explicitCode?.trim()) {
    return slugifyPart(explicitCode).slice(0, 56) || `CAT_${Date.now().toString().slice(-6)}`;
  }
  const deptPart = slugifyPart(department).slice(0, 20);
  const namePart = slugifyPart(name).slice(0, 32);
  const combined = [deptPart, namePart].filter(Boolean).join('_').slice(0, 54);
  return combined || `CAT_${Date.now().toString().slice(-6)}`;
}

export class CategoryService {
  async list(options: {
    includeInactive?: boolean;
    scope?: RequestAccessScope;
    department?: string;
  } = {}): Promise<RequestCategoryEntity[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (!options.includeInactive) {
      conditions.push('is_active = TRUE');
    }

    if (options.department?.trim()) {
      const cleanDept = options.department.trim().replace(/^\/+/, '');
      const deptSql = buildDepartmentMatchSql([cleanDept], 'department', params.length + 1);
      conditions.push(deptSql.condition);
      params.push(...deptSql.params);
    } else if (options.scope?.type === 'DEPARTMENT') {
      const deptSql = buildDepartmentMatchSql(
        options.scope.departments,
        'department',
        params.length + 1
      );
      conditions.push(deptSql.condition);
      params.push(...deptSql.params);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM request_categories ${whereClause} ORDER BY sort_order ASC, name ASC;`;
    const result = await query(sql, params);
    return result.rows as RequestCategoryEntity[];
  }

  async getByCode(code: string): Promise<RequestCategoryEntity | null> {
    const result = await query(
      `SELECT * FROM request_categories WHERE UPPER(code) = UPPER($1) LIMIT 1;`,
      [code]
    );
    return (result.rows[0] as RequestCategoryEntity) || null;
  }

  async getById(id: string): Promise<RequestCategoryEntity | null> {
    const result = await query(
      `SELECT * FROM request_categories WHERE id = $1 LIMIT 1;`,
      [id]
    );
    return (result.rows[0] as RequestCategoryEntity) || null;
  }

  async create(dto: CreateCategoryDto): Promise<RequestCategoryEntity> {
    const cleanDept = dto.department.trim().replace(/^\/+/, '');
    let code = buildCategoryCode(cleanDept, dto.name, dto.code);

    const existingCode = await this.getByCode(code);
    if (existingCode) {
      code = `${code.slice(0, 48)}_${Date.now().toString(36).toUpperCase().slice(-5)}`;
    }

    const slaHours = Number.isFinite(dto.sla_hours)
      ? Math.max(1, Math.min(720, Number(dto.sla_hours)))
      : 24;
    const sortOrder = Number.isFinite(dto.sort_order)
      ? Number(dto.sort_order)
      : 100;

    const sql = `
      INSERT INTO request_categories
        (code, name, department, sla_hours, requires_evidence, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const result = await query(sql, [
      code,
      dto.name.trim(),
      cleanDept,
      slaHours,
      Boolean(dto.requires_evidence),
      sortOrder,
    ]);
    return result.rows[0] as RequestCategoryEntity;
  }

  async update(
    id: string,
    dto: UpdateCategoryDto
  ): Promise<RequestCategoryEntity | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const nextName = dto.name?.trim() || existing.name;
    const nextDept = dto.department?.trim()
      ? dto.department.trim().replace(/^\/+/, '')
      : existing.department;
    const nextSla = Number.isFinite(dto.sla_hours)
      ? Math.max(1, Math.min(720, Number(dto.sla_hours)))
      : existing.sla_hours;
    const nextEvidence =
      typeof dto.requires_evidence === 'boolean'
        ? dto.requires_evidence
        : existing.requires_evidence;
    const nextActive =
      typeof dto.is_active === 'boolean' ? dto.is_active : existing.is_active;
    const nextOrder = Number.isFinite(dto.sort_order)
      ? Number(dto.sort_order)
      : existing.sort_order;

    const sql = `
      UPDATE request_categories
      SET name = $1,
          department = $2,
          sla_hours = $3,
          requires_evidence = $4,
          is_active = $5,
          sort_order = $6
      WHERE id = $7
      RETURNING *;
    `;
    const result = await query(sql, [
      nextName,
      nextDept,
      nextSla,
      nextEvidence,
      nextActive,
      nextOrder,
      id,
    ]);
    return (result.rows[0] as RequestCategoryEntity) || null;
  }

  async toggleActive(id: string): Promise<RequestCategoryEntity | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const sql = `
      UPDATE request_categories
      SET is_active = NOT is_active
      WHERE id = $1
      RETURNING *;
    `;
    const result = await query(sql, [id]);
    return (result.rows[0] as RequestCategoryEntity) || null;
  }

  async deleteMany(
    ids: string[],
    user: Pick<KeycloakUser, 'preferred_username' | 'roles' | 'groups'>
  ): Promise<{ deletedIds: string[]; forbidden: boolean }> {
    if (ids.length === 0) {
      return { deletedIds: [], forbidden: false };
    }

    const existingRes = await query(
      `SELECT id, department FROM request_categories WHERE id = ANY($1::uuid[]);`,
      [ids]
    );
    const rows = existingRes.rows as Array<{ id: string; department: string }>;
    if (rows.length === 0) {
      return { deletedIds: [], forbidden: false };
    }

    const scope = resolveRequestAccessScope(user);
    if (scope.type === 'PERSONAL') {
      return { deletedIds: [], forbidden: true };
    }

    for (const row of rows) {
      if (!canReviewRequest(user, { target_department: row.department })) {
        return { deletedIds: [], forbidden: true };
      }
    }

    const authorizedIds = rows.map((r) => r.id);
    const deleteRes = await query(
      `DELETE FROM request_categories WHERE id = ANY($1::uuid[]) RETURNING id;`,
      [authorizedIds]
    );
    return {
      deletedIds: (deleteRes.rows as Array<{ id: string }>).map((r) => r.id),
      forbidden: false,
    };
  }
}

export const categoryService = new CategoryService();
