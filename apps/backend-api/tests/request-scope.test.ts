// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  buildDepartmentMatchSql,
  canReviewRequest,
  canViewRequest,
  extractDepartmentGroups,
  hasStaffOrDepartmentAccess,
  matchesDepartmentAccess,
  resolveRequestAccessScope,
} from '../src/services/request-service.js';

describe('Department Routing & RBAC Scope', () => {
  it('chuẩn hóa danh sách group từ Keycloak và loại bỏ trùng lặp', () => {
    expect(
      extractDepartmentGroups(['/KETOAN', 'KETOAN', '/Lớp/K11A1', '  ', '/CTSV/'])
    ).toEqual(['KETOAN', 'Lớp/K11A1', 'CTSV/']);
  });

  it('cấp quyền ALL cho admin bất kể có gắn group hay không', () => {
    const scope = resolveRequestAccessScope({
      preferred_username: 'superadmin',
      roles: ['admin', 'canbo'],
      groups: ['/KETOAN'],
    });
    expect(scope).toEqual({ type: 'ALL' });
  });

  it('cấp quyền DEPARTMENT cho cán bộ hoặc giảng viên gắn group', () => {
    expect(
      resolveRequestAccessScope({
        preferred_username: 'cb_ketoan',
        roles: ['canbo'],
        groups: ['/KETOAN'],
      })
    ).toEqual({ type: 'DEPARTMENT', departments: ['KETOAN'] });

    expect(
      resolveRequestAccessScope({
        preferred_username: 'gv_k11a1',
        roles: ['giangvien'],
        groups: ['/Lớp/K11A1'],
      })
    ).toEqual({ type: 'DEPARTMENT', departments: ['Lớp/K11A1'] });
  });

  it('cấp quyền ALL cho cán bộ không gắn group', () => {
    expect(
      resolveRequestAccessScope({
        preferred_username: 'canbo_chung',
        roles: ['canbo'],
        groups: [],
      })
    ).toEqual({ type: 'ALL' });
  });

  it('giới hạn sinh viên ở phạm vi PERSONAL ngay cả khi thuộc group lớp', () => {
    const student = {
      preferred_username: 'sv01',
      roles: ['sinhvien'],
      groups: ['/Lớp/K11A1'],
    };
    expect(resolveRequestAccessScope(student)).toEqual({
      type: 'PERSONAL',
      username: 'sv01',
    });
    expect(hasStaffOrDepartmentAccess(student)).toBe(false);
  });

  it('khớp phân cấp group cha - con và chặn chéo phòng ban', () => {
    expect(matchesDepartmentAccess(['Lớp'], 'Lớp')).toBe(true);
    expect(matchesDepartmentAccess(['Lớp'], 'Lớp/K11A1')).toBe(true);
    expect(matchesDepartmentAccess(['Lớp/K11A1'], 'Lớp/K11A1')).toBe(true);
    expect(matchesDepartmentAccess(['Lớp/K11A1'], 'Lớp/k11A2')).toBe(false);
    expect(matchesDepartmentAccess(['KETOAN'], 'CTSV')).toBe(false);
    expect(matchesDepartmentAccess(['KETOAN'], null)).toBe(false);
  });

  it('kiểm tra quyền xem và phê duyệt kết hợp cờ ẩn 2 phía', () => {
    const ketoanStaff = {
      preferred_username: 'cb_ketoan',
      roles: ['canbo'],
      groups: ['KETOAN'],
    };
    const studentOwner = {
      preferred_username: 'sv01',
      roles: ['sinhvien'],
      groups: ['Lớp/K11A1'],
    };

    expect(
      canViewRequest(studentOwner, {
        created_by: 'sv01',
        target_department: 'KETOAN',
        hidden_by_sender: true,
        hidden_by_receiver: false,
      })
    ).toBe(false);

    expect(
      canViewRequest(ketoanStaff, {
        created_by: 'sv01',
        target_department: 'KETOAN',
        hidden_by_sender: true,
        hidden_by_receiver: false,
      })
    ).toBe(true);

    expect(
      canViewRequest(ketoanStaff, {
        created_by: 'sv01',
        target_department: 'KETOAN',
        hidden_by_sender: false,
        hidden_by_receiver: true,
      })
    ).toBe(false);

    expect(
      canReviewRequest(ketoanStaff, { target_department: 'KETOAN' })
    ).toBe(true);
    expect(
      canReviewRequest(ketoanStaff, { target_department: 'CTSV' })
    ).toBe(false);
  });

  it('escape wildcard LIKE trong SQL lọc phòng ban', () => {
    const sql = buildDepartmentMatchSql(['Phong_100%'], 'target_department', 1);
    expect(sql.params).toEqual(['Phong_100%', 'Phong\\_100\\%/%', '%/Phong\\_100\\%']);
    expect(sql.condition).toContain("ESCAPE '\\'");
  });
});
