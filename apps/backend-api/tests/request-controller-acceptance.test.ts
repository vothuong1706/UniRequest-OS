// SPDX-License-Identifier: Apache-2.0
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeycloakUser } from '../src/types/request.js';

const mockGetCategoryByCode = vi.fn();
const mockListCategories = vi.fn();
const mockResolveTargetDepartmentPath = vi.fn();
const mockResolveUserGroupPaths = vi.fn();
const mockListGroups = vi.fn();
const mockCreateRequest = vi.fn();
const mockGetRequestById = vi.fn();
const mockUpdateRequestStatus = vi.fn();
const mockAttachWorkflowExecution = vi.fn();
const mockEmitLifecycleEvent = vi.fn();
const mockCreateAndDispatch = vi.fn();
const mockEmitRequestUpdated = vi.fn();

let currentMockUser: KeycloakUser = {
  preferred_username: 'sinhvien',
  roles: ['sinhvien'],
  groups: ['Lớp/K11A1'],
};

vi.mock('../src/middlewares/auth-middleware.js', () => ({
  authenticateToken: (
    req: { user?: KeycloakUser },
    _res: unknown,
    next: () => void
  ) => {
    req.user = currentMockUser;
    next();
  },
  verifyKeycloakJwt: vi.fn(),
  getKeycloakPublicKey: vi.fn(),
}));

vi.mock('../src/services/category-service.js', () => ({
  categoryService: {
    getByCode: (...args: unknown[]) => mockGetCategoryByCode(...args),
    list: (...args: unknown[]) => mockListCategories(...args),
  },
}));

vi.mock('../src/services/keycloak-group-service.js', () => ({
  keycloakGroupService: {
    resolveTargetDepartmentPath: (...args: unknown[]) =>
      mockResolveTargetDepartmentPath(...args),
    resolveUserGroupPaths: (...args: unknown[]) =>
      mockResolveUserGroupPaths(...args),
    listGroups: (...args: unknown[]) => mockListGroups(...args),
  },
}));

vi.mock('../src/services/request-service.js', async () => {
  const actual = await vi.importActual<
    typeof import('../src/services/request-service.js')
  >('../src/services/request-service.js');
  return {
    ...actual,
    requestService: {
      ...actual.requestService,
      createRequest: (...args: unknown[]) => mockCreateRequest(...args),
      getRequestById: (...args: unknown[]) => mockGetRequestById(...args),
      updateRequestStatus: (...args: unknown[]) =>
        mockUpdateRequestStatus(...args),
      attachWorkflowExecution: (...args: unknown[]) =>
        mockAttachWorkflowExecution(...args),
    },
  };
});

vi.mock('../src/services/workflow-service.js', async () => {
  const actual = await vi.importActual<
    typeof import('../src/services/workflow-service.js')
  >('../src/services/workflow-service.js');
  return {
    ...actual,
    workflowService: {
      emitLifecycleEvent: (...args: unknown[]) =>
        mockEmitLifecycleEvent(...args),
    },
  };
});

vi.mock('../src/services/notification-service.js', () => ({
  notificationService: {
    createAndDispatch: (...args: unknown[]) => mockCreateAndDispatch(...args),
  },
}));

vi.mock('../src/realtime/socket-server.js', () => ({
  emitRequestUpdated: (...args: unknown[]) => mockEmitRequestUpdated(...args),
  emitToStaff: vi.fn(),
  emitToUser: vi.fn(),
}));

import { createApp } from '../src/app.js';
import { analyzeRequestWithRuleEngine } from '../src/services/ai-triage-service.js';

describe('SDLC Step 5 - Acceptance Criteria (Given/When/Then) & Vietnamese AI Suggestion Eval', () => {
  const app = createApp();
  const validUuid = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    currentMockUser = {
      preferred_username: 'sinhvien',
      roles: ['sinhvien'],
      groups: ['Lớp/K11A1'],
    };
    mockGetCategoryByCode.mockReset();
    mockListCategories.mockReset();
    mockResolveTargetDepartmentPath.mockReset();
    mockResolveUserGroupPaths.mockReset();
    mockListGroups.mockReset();
    mockCreateRequest.mockReset();
    mockGetRequestById.mockReset();
    mockUpdateRequestStatus.mockReset();
    mockAttachWorkflowExecution.mockReset();
    mockEmitLifecycleEvent.mockReset();
    mockCreateAndDispatch.mockReset();
    mockEmitRequestUpdated.mockReset();

    mockCreateAndDispatch.mockResolvedValue({});
  });

  it('[Given/When/Then - Kiểm tra đầu vào #1] Given sinh viên tạo đơn, When tiêu đề ngắn dưới 5 ký tự, Then trả về HTTP 400 TITLE_TOO_SHORT', async () => {
    const res = await request(app).post('/api/requests').send({
      title: 'A12',
      target_department: 'CTSV',
      priority: 'NORMAL',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TITLE_TOO_SHORT');
  });

  it('[Given/When/Then - Kiểm tra đầu vào #2] Given sinh viên tạo đơn, When priority ngoài tập NORMAL|HIGH|URGENT, Then trả về HTTP 400 INVALID_PRIORITY', async () => {
    mockGetCategoryByCode.mockResolvedValueOnce(null);

    const res = await request(app).post('/api/requests').send({
      title: 'Xin giấy xác nhận sinh viên',
      target_department: 'CTSV',
      priority: 'EXTREME_PRIORITY',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_PRIORITY');
  });

  it('[Given/When/Then - Kiểm tra đầu vào #3] Given danh mục yêu cầu minh chứng, When thiếu attachment_url và mô tả < 15 ký tự, Then trả về HTTP 400 EVIDENCE_REQUIRED', async () => {
    mockGetCategoryByCode.mockResolvedValueOnce({
      code: 'KETOAN_HOC_PHI',
      name: 'Miễn giảm học phí',
      department: 'KETOAN',
      requires_evidence: true,
    });

    const res = await request(app).post('/api/requests').send({
      title: 'Xin miễn giảm học phí kỳ 2',
      category: 'KETOAN_HOC_PHI',
      description: 'Mô tả ngắn',
      target_department: 'KETOAN',
      priority: 'NORMAL',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('EVIDENCE_REQUIRED');
  });

  it('[Given/When/Then - Kiểm tra đầu vào #4] Given sinh viên chọn mức URGENT, When mô tả lý do dưới 10 ký tự, Then trả về HTTP 400 URGENT_REASON_REQUIRED', async () => {
    mockGetCategoryByCode.mockResolvedValueOnce({
      code: 'CTSV_XAC_NHAN',
      name: 'Giấy xác nhận sinh viên',
      department: 'CTSV',
      requires_evidence: false,
    });

    const res = await request(app).post('/api/requests').send({
      title: 'Khẩn cấp xin giấy xác nhận',
      category: 'CTSV_XAC_NHAN',
      description: 'Cần gấp',
      target_department: 'CTSV',
      priority: 'URGENT',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('URGENT_REASON_REQUIRED');
  });

  it('[Given/When/Then - Kiểm tra đầu vào #5] Given phòng ban không tồn tại trên Keycloak, When gửi POST /api/requests, Then trả về HTTP 400 INVALID_TARGET_DEPARTMENT', async () => {
    mockGetCategoryByCode.mockResolvedValueOnce(null);
    mockResolveTargetDepartmentPath.mockResolvedValueOnce({
      valid: false,
      canonicalPath: '',
    });

    const res = await request(app).post('/api/requests').send({
      title: 'Xin cấp giấy xác nhận sinh viên',
      description: 'Nộp hồ sơ thực tập tốt nghiệp tại doanh nghiệp',
      target_department: 'PHONG_KHONG_TON_TAI',
      priority: 'NORMAL',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TARGET_DEPARTMENT');
  });

  it('[Given/When/Then - Kiểm tra đầu vào #6 & #7] Given cán bộ xử lý đơn, When từ chối thiếu lý do trả về 400 REJECT_REASON_REQUIRED; When đơn đã duyệt trả về 409 ALREADY_PROCESSED', async () => {
    currentMockUser = {
      preferred_username: 'canbo',
      roles: ['canbo'],
      groups: ['CTSV'],
    };
    mockResolveUserGroupPaths.mockResolvedValue(['CTSV']);

    // Trường hợp 1: Từ chối đơn PENDING nhưng review_note < 5 ký tự
    mockGetRequestById.mockResolvedValueOnce({
      id: validUuid,
      title: 'Xin giấy xác nhận',
      created_by: 'sinhvien',
      target_department: 'CTSV',
      status: 'PENDING',
    });

    const rejectRes = await request(app)
      .put(`/api/requests/${validUuid}/status`)
      .send({ status: 'REJECTED', review_note: 'Sai' });

    expect(rejectRes.status).toBe(400);
    expect(rejectRes.body.code).toBe('REJECT_REASON_REQUIRED');

    // Trường hợp 2: Đơn đã APPROVED trước đó, cán bộ (không phải admin) bấm duyệt lại
    mockGetRequestById.mockResolvedValueOnce({
      id: validUuid,
      title: 'Xin giấy xác nhận',
      created_by: 'sinhvien',
      target_department: 'CTSV',
      status: 'APPROVED',
    });

    const conflictRes = await request(app)
      .put(`/api/requests/${validUuid}/status`)
      .send({ status: 'APPROVED', review_note: 'Duyệt lần 2' });

    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.code).toBe('ALREADY_PROCESSED');
  });

  it('[Given/When/Then - Happy Path] Given dữ liệu hợp lệ, When POST /api/requests, Then tạo đơn 201 Created, gắn executionId Kestra và phát sự kiện realtime', async () => {
    mockGetCategoryByCode.mockResolvedValueOnce({
      code: 'CTSV_XAC_NHAN',
      name: 'Giấy xác nhận sinh viên',
      department: 'CTSV',
      requires_evidence: false,
    });
    mockResolveTargetDepartmentPath.mockResolvedValueOnce({
      valid: true,
      canonicalPath: 'CTSV',
    });
    mockCreateRequest.mockResolvedValueOnce({
      id: validUuid,
      title: 'Xin giấy xác nhận sinh viên vay vốn',
      description: 'Em cần nộp hồ sơ vay vốn ngân hàng chính sách xã hội.',
      category: 'CTSV_XAC_NHAN',
      target_department: 'CTSV',
      priority: 'HIGH',
      status: 'PENDING',
      created_by: 'sinhvien',
    });
    mockEmitLifecycleEvent.mockResolvedValueOnce({
      dispatched: true,
      executionId: 'kestra-exec-2026',
    });
    mockAttachWorkflowExecution.mockResolvedValueOnce(undefined);

    const res = await request(app).post('/api/requests').send({
      title: 'Xin giấy xác nhận sinh viên vay vốn',
      description: 'Em cần nộp hồ sơ vay vốn ngân hàng chính sách xã hội.',
      category: 'CTSV_XAC_NHAN',
      target_department: 'CTSV',
      priority: 'HIGH',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.workflow_execution_id).toBe('kestra-exec-2026');
    expect(mockAttachWorkflowExecution).toHaveBeenCalledWith(
      validUuid,
      'kestra-exec-2026',
      'request.created',
      'sinhvien',
      ['sinhvien']
    );
    expect(mockEmitRequestUpdated).toHaveBeenCalledWith(
      validUuid,
      'sinhvien',
      'CREATED',
      'CTSV'
    );
  });

  it('[AI Eval - Bộ câu mẫu tiếng Việt 5 Nhóm Phòng ban] phân tuyến chính xác 100% cả tiếng Việt có dấu & không dấu với độ trễ trung bình < 5ms', () => {
    const now = new Date();
    const departments = [
      { id: 'd1', name: 'KETOAN', path: 'KETOAN', display_label: 'KETOAN', parent_path: null, depth: 0, sub_group_count: 0 },
      { id: 'd2', name: 'CTSV', path: 'CTSV', display_label: 'CTSV', parent_path: null, depth: 0, sub_group_count: 0 },
      { id: 'd3', name: 'DAOTAO', path: 'DAOTAO', display_label: 'DAOTAO', parent_path: null, depth: 0, sub_group_count: 0 },
      { id: 'd4', name: 'CSVC', path: 'CSVC', display_label: 'CSVC', parent_path: null, depth: 0, sub_group_count: 0 },
      { id: 'd5', name: 'CNTT', path: 'CNTT', display_label: 'CNTT', parent_path: null, depth: 0, sub_group_count: 0 },
    ];
    const categories = [
      { id: 'c1', code: 'KETOAN_HOC_PHI', name: 'Học phí & Biên lai', department: 'KETOAN', sla_hours: 24, requires_evidence: true, is_active: true, sort_order: 1, created_at: now, updated_at: now },
      { id: 'c2', code: 'CTSV_XAC_NHAN', name: 'Giấy xác nhận & BHYT', department: 'CTSV', sla_hours: 24, requires_evidence: false, is_active: true, sort_order: 2, created_at: now, updated_at: now },
      { id: 'c3', code: 'DAOTAO_HOC_VU', name: 'Phúc khảo & Bảng điểm tín chỉ', department: 'DAOTAO', sla_hours: 24, requires_evidence: false, is_active: true, sort_order: 3, created_at: now, updated_at: now },
      { id: 'c4', code: 'CSVC_SUA_CHUA', name: 'Báo hỏng thiết bị & Phòng học', department: 'CSVC', sla_hours: 8, requires_evidence: true, is_active: true, sort_order: 4, created_at: now, updated_at: now },
      { id: 'c5', code: 'CNTT_TAI_KHOAN', name: 'Hỗ trợ Wifi & Tài khoản SSO', department: 'CNTT', sla_hours: 8, requires_evidence: false, is_active: true, sort_order: 5, created_at: now, updated_at: now },
    ];

    const goldenDataset = [
      {
        title: 'Xin xuất lại biên lai thanh toán học phí học kỳ 2',
        description: 'Em đã chuyển khoản học phí nhưng chưa nhận được hóa đơn điện tử.',
        expectedDept: 'KETOAN',
        expectedCat: 'KETOAN_HOC_PHI',
        expectedPriority: 'NORMAL',
      },
      {
        title: 'Xin cap giay xac nhan sinh vien va the BHYT (khong dau)',
        description: 'Can gap trong tuan nay de nop ho so vay von ngan hang.',
        expectedDept: 'CTSV',
        expectedCat: 'CTSV_XAC_NHAN',
        expectedPriority: 'HIGH',
      },
      {
        title: 'Đơn xin phúc khảo điểm thi học phần Cấu trúc dữ liệu',
        description: 'Em muốn kiểm tra lại bảng điểm tín chỉ và lịch thi học kỳ vừa qua.',
        expectedDept: 'DAOTAO',
        expectedCat: 'DAOTAO_HOC_VU',
        expectedPriority: 'HIGH',
      },
      {
        title: 'Khẩn cấp: Chập điện và hỏng máy chiếu tại giảng đường B302',
        description: 'Mất điện toàn bộ phòng học ngay trong ngày thi.',
        expectedDept: 'CSVC',
        expectedCat: 'CSVC_SUA_CHUA',
        expectedPriority: 'URGENT',
      },
      {
        title: 'Lỗi không đăng nhập được tài khoản SSO Keycloak và mất kết nối Wifi',
        description: 'Xin trung tâm CNTT cấp lại mật khẩu email sinh viên.',
        expectedDept: 'CNTT',
        expectedCat: 'CNTT_TAI_KHOAN',
        expectedPriority: 'HIGH',
      },
    ];

    const start = performance.now();
    for (const sample of goldenDataset) {
      const suggestion = analyzeRequestWithRuleEngine({
        title: sample.title,
        description: sample.description,
        departments,
        categories,
      });

      expect(suggestion.suggested_department).toBe(sample.expectedDept);
      expect(suggestion.suggested_category_code).toBe(sample.expectedCat);
      expect(suggestion.suggested_priority).toBe(sample.expectedPriority);
      expect(suggestion.confidence).toBeGreaterThanOrEqual(0.65);
    }
    const avgLatencyMs = (performance.now() - start) / goldenDataset.length;
    expect(avgLatencyMs).toBeLessThan(5);
  });
});
