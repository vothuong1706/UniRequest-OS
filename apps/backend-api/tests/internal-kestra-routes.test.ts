// SPDX-License-Identifier: Apache-2.0
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockGetRequestById = vi.fn();
const mockRecordAuditLog = vi.fn();
const mockCreateAndDispatch = vi.fn();
const mockEmitRequestUpdated = vi.fn();

vi.mock('../src/config/database.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  pool: { connect: vi.fn(), end: vi.fn() },
  checkDatabaseConnection: vi.fn(),
  ensureTablesExist: vi.fn(),
}));

vi.mock('../src/services/request-service.js', async () => {
  const actual = await vi.importActual<
    typeof import('../src/services/request-service.js')
  >('../src/services/request-service.js');
  return {
    ...actual,
    requestService: {
      ...actual.requestService,
      getRequestById: (...args: unknown[]) => mockGetRequestById(...args),
      recordAuditLog: (...args: unknown[]) => mockRecordAuditLog(...args),
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
}));

import { createApp } from '../src/app.js';
import { config } from '../src/config/environment.js';

describe('POST /api/internal/kestra/sla-alert', () => {
  const validId = '22222222-2222-4222-8222-222222222222';
  const app = createApp();

  beforeEach(() => {
    mockQuery.mockReset();
    mockGetRequestById.mockReset();
    mockRecordAuditLog.mockReset();
    mockCreateAndDispatch.mockReset();
    mockEmitRequestUpdated.mockReset();
  });

  it('trả về HTTP 401 khi thiếu hoặc sai header x-kestra-key', async () => {
    const res = await request(app)
      .post('/api/internal/kestra/sla-alert')
      .send({ request_id: validId });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('trả về HTTP 400 khi request_id không phải UUID hợp lệ', async () => {
    const res = await request(app)
      .post('/api/internal/kestra/sla-alert')
      .set('x-kestra-key', config.kestra.webhookKey)
      .send({ request_id: 'not-a-uuid' });

    expect(res.status).toBe(400);
  });

  it('bỏ qua nếu yêu cầu không ở trạng thái PENDING hoặc đã bị bên nhận ẩn', async () => {
    mockGetRequestById.mockResolvedValueOnce({
      id: validId,
      status: 'APPROVED',
      hidden_by_receiver: false,
    });

    const res = await request(app)
      .post('/api/internal/kestra/sla-alert')
      .set('x-kestra-key', config.kestra.webhookKey)
      .send({ request_id: validId });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      skipped: true,
      reason: 'NOT_ACTIVE_PENDING',
    });
    expect(mockRecordAuditLog).not.toHaveBeenCalled();
  });

  it('tránh gửi cảnh báo lặp lại cho cùng một đơn trong khoảng thời gian gần', async () => {
    mockGetRequestById.mockResolvedValueOnce({
      id: validId,
      title: 'Xin cấp bảng điểm',
      created_by: 'sv01',
      target_department: 'CTSV',
      status: 'PENDING',
      hidden_by_receiver: false,
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

    const res = await request(app)
      .post('/api/internal/kestra/sla-alert')
      .set('x-kestra-key', config.kestra.webhookKey)
      .send({ request_id: validId });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      skipped: true,
      reason: 'RECENTLY_ALERTED',
    });
    expect(mockCreateAndDispatch).not.toHaveBeenCalled();
  });

  it('ghi audit SLA_WARNING và bắn thông báo URGENT đúng phòng ban phụ trách', async () => {
    mockGetRequestById.mockResolvedValueOnce({
      id: validId,
      title: 'Hỗ trợ học bổng',
      created_by: 'sv01',
      target_department: 'Lớp/K11A1',
      status: 'PENDING',
      hidden_by_receiver: false,
    });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockRecordAuditLog.mockResolvedValueOnce({});
    mockCreateAndDispatch.mockResolvedValueOnce({});

    const res = await request(app)
      .post('/api/internal/kestra/sla-alert')
      .set('x-kestra-key', config.kestra.webhookKey)
      .send({
        request_id: validId,
        hours_pending: 3.5,
        threshold_hours: 2,
        execution_id: 'exec-001',
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      dispatched: true,
      request_id: validId,
      department: 'Lớp/K11A1',
    });

    expect(mockRecordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: validId,
        actor: 'kestra-sla-watchdog',
        action: 'SLA_WARNING',
      })
    );
    expect(mockCreateAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientRole: 'staff',
        recipientDepartment: 'Lớp/K11A1',
        type: 'SLA_WARNING',
        severity: 'URGENT',
        title: '[SLA Quá hạn - Lớp / K11A1] Hỗ trợ học bổng',
      })
    );
    expect(mockEmitRequestUpdated).toHaveBeenCalledWith(
      validId,
      'sv01',
      'STATUS_CHANGED',
      'Lớp/K11A1'
    );
  });
});
