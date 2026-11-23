// SPDX-License-Identifier: Apache-2.0
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KeycloakUser } from '../src/types/request.js';

const mockGetRequestById = vi.fn();
const mockResolveUserGroupPaths = vi.fn();
const mockListByRequestId = vi.fn();
const mockCreateComment = vi.fn();
const mockCreateAndDispatch = vi.fn();

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

vi.mock('../src/services/keycloak-group-service.js', async () => {
  const actual = await vi.importActual<
    typeof import('../src/services/keycloak-group-service.js')
  >('../src/services/keycloak-group-service.js');
  return {
    ...actual,
    keycloakGroupService: {
      resolveUserGroupPaths: (...args: unknown[]) =>
        mockResolveUserGroupPaths(...args),
    },
  };
});

vi.mock('../src/services/request-service.js', async () => {
  const actual = await vi.importActual<
    typeof import('../src/services/request-service.js')
  >('../src/services/request-service.js');
  return {
    ...actual,
    requestService: {
      ...actual.requestService,
      getRequestById: (...args: unknown[]) => mockGetRequestById(...args),
    },
  };
});

vi.mock('../src/services/comment-service.js', () => ({
  commentService: {
    listByRequestId: (...args: unknown[]) => mockListByRequestId(...args),
    createComment: (...args: unknown[]) => mockCreateComment(...args),
  },
}));

vi.mock('../src/services/notification-service.js', () => ({
  notificationService: {
    createAndDispatch: (...args: unknown[]) => mockCreateAndDispatch(...args),
  },
}));

vi.mock('../src/realtime/socket-server.js', () => ({
  emitRequestUpdated: vi.fn(),
  emitToStaff: vi.fn(),
  emitToUser: vi.fn(),
}));

import { createApp } from '../src/app.js';

describe('Comment Anti-Spam Guard - Chỉ mở Trao đổi khi yêu cầu đã APPROVED', () => {
  const app = createApp();
  const validUuid = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    currentMockUser = {
      preferred_username: 'sinhvien',
      roles: ['sinhvien'],
      groups: ['Lớp/K11A1'],
    };
    mockGetRequestById.mockReset();
    mockResolveUserGroupPaths.mockReset();
    mockListByRequestId.mockReset();
    mockCreateComment.mockReset();
    mockCreateAndDispatch.mockReset();
    mockResolveUserGroupPaths.mockResolvedValue(['Lớp/K11A1']);
    mockCreateAndDispatch.mockResolvedValue(undefined);
  });

  it('chặn gửi trao đổi (403 COMMENTS_ONLY_WHEN_APPROVED) khi yêu cầu đang ở trạng thái PENDING', async () => {
    mockGetRequestById.mockResolvedValueOnce({
      id: validUuid,
      title: 'Xin giấy xác nhận',
      status: 'PENDING',
      created_by: 'sinhvien',
      target_department: 'CTSV',
    });

    const res = await request(app)
      .post(`/api/requests/${validUuid}/comments`)
      .send({ content: 'Thầy duyệt giúp em sớm ạ' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('COMMENTS_ONLY_WHEN_APPROVED');
    expect(mockCreateComment).not.toHaveBeenCalled();
  });

  it('chặn gửi trao đổi (403 COMMENTS_ONLY_WHEN_APPROVED) khi yêu cầu đã bị REJECTED', async () => {
    mockGetRequestById.mockResolvedValueOnce({
      id: validUuid,
      title: 'Xin miễn giảm',
      status: 'REJECTED',
      created_by: 'sinhvien',
      target_department: 'KETOAN',
    });

    const res = await request(app)
      .post(`/api/requests/${validUuid}/comments`)
      .send({ content: 'Sao lại từ chối đơn của em' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('COMMENTS_ONLY_WHEN_APPROVED');
    expect(mockCreateComment).not.toHaveBeenCalled();
  });

  it('trả về danh sách rỗng & comments_enabled=false khi GET comments của yêu cầu chưa APPROVED', async () => {
    mockGetRequestById.mockResolvedValueOnce({
      id: validUuid,
      title: 'Đơn đang chờ',
      status: 'PENDING',
      created_by: 'sinhvien',
      target_department: 'CTSV',
    });

    const res = await request(app).get(`/api/requests/${validUuid}/comments`);

    expect(res.status).toBe(200);
    expect(res.body.comments_enabled).toBe(false);
    expect(res.body.data).toEqual([]);
    expect(mockListByRequestId).not.toHaveBeenCalled();
  });

  it('cho phép xem và gửi trao đổi bình thường (201 Created) khi yêu cầu đã được APPROVED', async () => {
    mockGetRequestById.mockResolvedValueOnce({
      id: validUuid,
      title: 'Xin giấy xác nhận sinh viên',
      status: 'APPROVED',
      created_by: 'sinhvien',
      target_department: 'CTSV',
    });
    mockCreateComment.mockResolvedValueOnce({
      id: '33333333-3333-4333-8333-333333333333',
      request_id: validUuid,
      author_username: 'sinhvien',
      author_role: 'sinhvien',
      content: 'Em cảm ơn, chiều nay em qua phòng CTSV nhận giấy ạ.',
      created_at: new Date('2026-11-23T10:00:00Z'),
    });

    const res = await request(app)
      .post(`/api/requests/${validUuid}/comments`)
      .send({ content: 'Em cảm ơn, chiều nay em qua phòng CTSV nhận giấy ạ.' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(mockCreateComment).toHaveBeenCalledTimes(1);
  });
});
