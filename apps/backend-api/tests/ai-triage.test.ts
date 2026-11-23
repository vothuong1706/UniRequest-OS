// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  AiTriageService,
  analyzeRequestWithRuleEngine,
} from '../src/services/ai-triage-service.js';
import { DepartmentGroupItem, RequestCategoryEntity } from '../src/types/request.js';

const MOCK_DEPARTMENTS: DepartmentGroupItem[] = [
  {
    id: 'dept-1',
    name: 'CTSV',
    path: 'CTSV',
    display_label: 'CTSV',
    parent_path: null,
    depth: 0,
    sub_group_count: 0,
  },
  {
    id: 'dept-2',
    name: 'KETOAN',
    path: 'KETOAN',
    display_label: 'KETOAN',
    parent_path: null,
    depth: 0,
    sub_group_count: 0,
  },
  {
    id: 'dept-3',
    name: 'DAOTAO',
    path: 'DAOTAO',
    display_label: 'DAOTAO',
    parent_path: null,
    depth: 0,
    sub_group_count: 0,
  },
  {
    id: 'dept-4',
    name: 'CSVC',
    path: 'CSVC',
    display_label: 'CSVC',
    parent_path: null,
    depth: 0,
    sub_group_count: 0,
  },
];

const now = new Date();
const MOCK_CATEGORIES: RequestCategoryEntity[] = [
  {
    id: 'cat-1',
    code: 'CTSV_XAC_NHAN',
    name: 'Giấy xác nhận sinh viên',
    department: 'CTSV',
    sla_hours: 24,
    requires_evidence: false,
    is_active: true,
    sort_order: 1,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'cat-2',
    code: 'KETOAN_HOC_PHI',
    name: 'Miễn giảm & Gia hạn học phí',
    department: 'KETOAN',
    sla_hours: 24,
    requires_evidence: true,
    is_active: true,
    sort_order: 2,
    created_at: now,
    updated_at: now,
  },
  {
    id: 'cat-3',
    code: 'CSVC_SUA_CHUA',
    name: 'Báo hỏng cơ sở vật chất & thiết bị',
    department: 'CSVC',
    sla_hours: 8,
    requires_evidence: true,
    is_active: true,
    sort_order: 3,
    created_at: now,
    updated_at: now,
  },
];

describe('AiTriageService & Vietnamese Rule-NLP Engine [I]', () => {
  it('phân tuyến đúng KETOAN khi nội dung liên quan học phí / miễn giảm', () => {
    const result = analyzeRequestWithRuleEngine({
      title: 'Xin gia hạn đóng học phí học kỳ 2',
      description: 'Gia đình gặp khó khăn, em xin nộp biên lai chậm 2 tuần.',
      departments: MOCK_DEPARTMENTS,
      categories: MOCK_CATEGORIES,
    });

    expect(result.provider).toBe('rule-nlp-engine');
    expect(result.suggested_department).toBe('KETOAN');
    expect(result.suggested_category_code).toBe('KETOAN_HOC_PHI');
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it('phân tuyến đúng CTSV khi xin giấy xác nhận sinh viên vay vốn', () => {
    const result = analyzeRequestWithRuleEngine({
      title: 'Xin giấy xác nhận sinh viên để vay vốn ngân hàng',
      description: 'Cần gấp trong tuần này để nộp hồ sơ địa phương.',
      departments: MOCK_DEPARTMENTS,
      categories: MOCK_CATEGORIES,
    });

    expect(result.suggested_department).toBe('CTSV');
    expect(result.suggested_category_code).toBe('CTSV_XAC_NHAN');
    expect(['HIGH', 'URGENT']).toContain(result.suggested_priority);
  });

  it('giữ nhất quán Phòng ban-Danh mục: trả về OTHER nếu phòng được gợi ý chưa có danh mục riêng', () => {
    const onlyCtsvCategory = MOCK_CATEGORIES.filter((c) => c.department === 'CTSV');
    const result = analyzeRequestWithRuleEngine({
      title: 'Xin gia hạn đóng học phí học kỳ 2',
      departments: MOCK_DEPARTMENTS,
      categories: onlyCtsvCategory,
    });

    expect(result.suggested_department).toBe('KETOAN');
    expect(result.suggested_category_code).toBe('OTHER');
  });

  it('nhận diện URGENT và đúng CSVC khi báo sự cố chập điện / rò rỉ nước khẩn cấp', () => {
    const result = analyzeRequestWithRuleEngine({
      title: 'Khẩn cấp: Chập điện và rò rỉ nước phòng học A201',
      description: 'Đang mất điện và ngập nước hành lang tầng 2.',
      departments: MOCK_DEPARTMENTS,
      categories: MOCK_CATEGORIES,
    });

    expect(result.suggested_department).toBe('CSVC');
    expect(result.suggested_category_code).toBe('CSVC_SUA_CHUA');
    expect(result.suggested_priority).toBe('URGENT');
  });

  it('tự động fallback mượt sang rule-nlp-engine khi Ollama không phản hồi hoặc lỗi', async () => {
    const service = new AiTriageService();
    const failingFetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;

    const result = await service.suggestTriage(
      {
        title: 'Xin cấp giấy xác nhận sinh viên',
        description: 'Làm hồ sơ BHYT',
        departments: MOCK_DEPARTMENTS,
        categories: MOCK_CATEGORIES,
      },
      {
        aiEnabled: true,
        ollamaUrl: 'http://127.0.0.1:11434',
        fetchImpl: failingFetch,
        timeoutMs: 200,
      }
    );

    expect(result.provider).toBe('rule-nlp-engine');
    expect(result.suggested_department).toBe('CTSV');
    expect(result.latency_ms).toBeGreaterThanOrEqual(1);
  });

  it('ưu tiên dùng Ollama khi có kết quả JSON hợp lệ và đối chiếu đúng danh sách thật', async () => {
    const service = new AiTriageService();
    const mockFetch = (async () =>
      ({
        ok: true,
        json: async () => ({
          response: JSON.stringify({
            department_path: 'KETOAN',
            category_code: 'KETOAN_HOC_PHI',
            priority: 'HIGH',
            summary: 'Sinh viên xin gia hạn học phí học kỳ 2.',
            reason: 'Từ khóa học phí thuộc phạm vi Phòng Kế toán.',
          }),
        }),
      }) as Response) as unknown as typeof fetch;

    const result = await service.suggestTriage(
      {
        title: 'Xin gia hạn đóng học phí',
        departments: MOCK_DEPARTMENTS,
        categories: MOCK_CATEGORIES,
      },
      {
        aiEnabled: true,
        ollamaUrl: 'http://127.0.0.1:11434',
        ollamaModel: 'qwen2.5:3b',
        fetchImpl: mockFetch,
      }
    );

    expect(result.provider).toBe('ollama');
    expect(result.model).toBe('qwen2.5:3b');
    expect(result.suggested_department).toBe('KETOAN');
    expect(result.suggested_category_code).toBe('KETOAN_HOC_PHI');
    expect(result.suggested_priority).toBe('HIGH');
  });

  it('loại bỏ hoàn toàn nhóm Lớp và Lớp/* khỏi danh sách phòng ban gợi ý (không bao giờ gợi ý Lớp/K11A1)', () => {
    const deptsWithClasses: DepartmentGroupItem[] = [
      ...MOCK_DEPARTMENTS,
      {
        id: 'grp-lop',
        name: 'Lớp',
        path: 'Lớp',
        display_label: 'Lớp',
        parent_path: null,
        depth: 0,
        sub_group_count: 2,
      },
      {
        id: 'grp-k11a1',
        name: 'K11A1',
        path: 'Lớp/K11A1',
        display_label: 'Lớp / K11A1',
        parent_path: 'Lớp',
        depth: 1,
        sub_group_count: 0,
      },
    ];

    const result = analyzeRequestWithRuleEngine({
      title: 'Sinh viên lớp K11A1 báo lỗi máy tính không mở được và mất wifi phòng học',
      description: 'Cần sửa máy tính và kiểm tra mạng wifi tại phòng học của lớp K11A1.',
      departments: deptsWithClasses,
      categories: MOCK_CATEGORIES,
    });

    expect(result.suggested_department).toBe('CSVC');
    expect(result.suggested_department).not.toBe('Lớp');
    expect(result.suggested_department).not.toBe('Lớp/K11A1');
  });
});
