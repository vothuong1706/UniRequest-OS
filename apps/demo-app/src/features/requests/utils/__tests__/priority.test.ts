// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import type { DepartmentGroupItem, RequestCategoryItem, RequestItem } from '../../types';
import {
  getPriorityLabel,
  getTargetDepartmentLabel,
  parseDescriptionPriority,
  resolveCategoryDisplay,
  resolveRequestDisplay,
} from '../priority';

describe('Request Display & Priority Helpers', () => {
  const departments: DepartmentGroupItem[] = [
    {
      id: 'g-1',
      name: 'KETOAN',
      path: 'KETOAN',
      display_label: 'KETOAN',
      parent_path: null,
      depth: 0,
      sub_group_count: 0,
    },
    {
      id: 'g-2',
      name: 'K11A1',
      path: 'Lớp/K11A1',
      display_label: 'Lớp / K11A1',
      parent_path: 'Lớp',
      depth: 1,
      sub_group_count: 0,
    },
  ];

  const categories: RequestCategoryItem[] = [
    {
      id: 'c-1',
      code: 'KETOAN_HOC_PHI',
      name: 'Miễn giảm học phí',
      department: 'KETOAN',
      sla_hours: 24,
      requires_evidence: false,
      is_active: true,
      sort_order: 10,
      created_at: '2026-11-21T00:00:00.000Z',
      updated_at: '2026-11-21T00:00:00.000Z',
    },
  ];

  it('ánh xạ nhãn phòng ban từ danh sách Keycloak hoặc tự định dạng phân cấp', () => {
    expect(getTargetDepartmentLabel('/Lớp/K11A1', departments)).toBe('Lớp / K11A1');
    expect(getTargetDepartmentLabel('CTSV/HoTro', departments)).toBe('CTSV / HoTro');
    expect(getTargetDepartmentLabel('  ', departments)).toBeNull();
  });

  it('tách tiền tố mức ưu tiên khỏi mô tả một cách chính xác', () => {
    expect(parseDescriptionPriority('[Ưu tiên: Khẩn cấp] Mất thẻ sinh viên')).toEqual({
      priority: 'URGENT',
      cleanDescription: 'Mất thẻ sinh viên',
    });

    expect(parseDescriptionPriority('[Ưu tiên: Ưu tiên cao] Cần ký gấp')).toEqual({
      priority: 'HIGH',
      cleanDescription: 'Cần ký gấp',
    });

    expect(parseDescriptionPriority('Nội dung thông thường')).toEqual({
      priority: 'NORMAL',
      cleanDescription: 'Nội dung thông thường',
    });
  });

  it('ưu tiên custom_category_label và fallback danh mục động theo phòng ban', () => {
    expect(
      resolveCategoryDisplay(
        { category: 'OTHER', custom_category_label: 'Xin gia hạn đóng học phí' },
        categories
      )
    ).toEqual({
      label: 'Xin gia hạn đóng học phí',
      department: 'Văn phòng Trường',
    });

    expect(resolveCategoryDisplay({ category: 'ketoan_hoc_phi' }, categories)).toEqual({
      label: 'Miễn giảm học phí',
      department: 'KETOAN',
    });
  });

  it('tổng hợp đầy đủ thông tin hiển thị yêu cầu và nhãn ưu tiên', () => {
    const req: RequestItem = {
      id: 'req-1',
      title: 'Gia hạn học phí kỳ 1',
      description: '[Ưu tiên: Khẩn cấp] Em xin gia hạn 2 tuần',
      category: 'KETOAN_HOC_PHI',
      target_department: 'KETOAN',
      priority: 'URGENT',
      status: 'PENDING',
      created_by: 'sinhvien',
      attachment_url: null,
      created_at: '2026-11-21T00:00:00.000Z',
      updated_at: '2026-11-21T00:00:00.000Z',
    };

    expect(resolveRequestDisplay(req, categories, departments)).toEqual({
      categoryCode: 'KETOAN_HOC_PHI',
      categoryLabel: 'Miễn giảm học phí',
      department: 'KETOAN',
      targetDepartmentLabel: 'KETOAN',
      priority: 'URGENT',
      cleanDescription: 'Em xin gia hạn 2 tuần',
    });

    expect(getPriorityLabel('NORMAL')).toBe('Bình thường');
    expect(getPriorityLabel('HIGH')).toBe('Ưu tiên cao');
    expect(getPriorityLabel('URGENT')).toBe('Khẩn cấp');
  });
});
