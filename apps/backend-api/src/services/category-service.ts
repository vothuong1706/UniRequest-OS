import { query } from '../config/database.js';
import {
  CreateCategoryDto,
  RequestCategoryEntity,
  UpdateCategoryDto,
} from '../types/request.js';

function slugifyCode(input: string): string {
  const ascii = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return ascii || `CAT_${Date.now().toString().slice(-6)}`;
}

export class CategoryService {
  async list(includeInactive = false): Promise<RequestCategoryEntity[]> {
    const sql = includeInactive
      ? `SELECT * FROM request_categories ORDER BY sort_order ASC, name ASC;`
      : `SELECT * FROM request_categories WHERE is_active = TRUE ORDER BY sort_order ASC, name ASC;`;
    const result = await query(sql);
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
    const code = dto.code?.trim()
      ? slugifyCode(dto.code)
      : slugifyCode(dto.name);
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
      dto.department.trim(),
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
    const nextDept = dto.department?.trim() || existing.department;
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
    if (existing.code.toUpperCase() === 'OTHER' && existing.is_active) {
      throw new Error('Không thể ẩn danh mục mặc định "Yêu cầu khác".');
    }
    const sql = `
      UPDATE request_categories
      SET is_active = NOT is_active
      WHERE id = $1
      RETURNING *;
    `;
    const result = await query(sql, [id]);
    return (result.rows[0] as RequestCategoryEntity) || null;
  }
}

export const categoryService = new CategoryService();
