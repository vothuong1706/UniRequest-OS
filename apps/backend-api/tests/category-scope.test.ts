// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../src/config/database.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  pool: { connect: vi.fn(), end: vi.fn() },
  checkDatabaseConnection: vi.fn(),
  ensureTablesExist: vi.fn(),
}));

import { categoryService } from '../src/services/category-service.js';

describe('Department-Scoped Category Service', () => {
  const catId = '33333333-3333-4333-8333-333333333333';

  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('lọc danh mục theo phạm vi phòng ban của cán bộ', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await categoryService.list({
      includeInactive: true,
      scope: { type: 'DEPARTMENT', departments: ['KETOAN'] },
    });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('target_department'.replace('target_', ''));
    expect(params).toContain('KETOAN');
  });

  it('chặn xóa hàng loạt danh mục nếu sinh viên hoặc cán bộ ban khác thao tác', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: catId, department: 'CTSV' }],
    });

    const studentRes = await categoryService.deleteMany([catId], {
      preferred_username: 'sv01',
      roles: ['sinhvien'],
      groups: [],
    });
    expect(studentRes).toEqual({ deletedIds: [], forbidden: true });

    mockQuery.mockResolvedValueOnce({
      rows: [{ id: catId, department: 'CTSV' }],
    });

    const otherDeptRes = await categoryService.deleteMany([catId], {
      preferred_username: 'cb_ketoan',
      roles: ['canbo'],
      groups: ['KETOAN'],
    });
    expect(otherDeptRes).toEqual({ deletedIds: [], forbidden: true });
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it('cho phép cán bộ xóa nhiều danh mục thuộc đúng phòng ban mình', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: catId, department: 'KETOAN' }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: catId }],
      });

    const res = await categoryService.deleteMany([catId], {
      preferred_username: 'cb_ketoan',
      roles: ['canbo'],
      groups: ['KETOAN'],
    });

    expect(res).toEqual({ deletedIds: [catId], forbidden: false });
    expect(String(mockQuery.mock.calls[1][0])).toContain('DELETE FROM request_categories');
  });
});
