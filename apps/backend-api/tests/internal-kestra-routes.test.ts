// SPDX-License-Identifier: Apache-2.0
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockGetRequestById = vi.fn();
const mockRecordAuditLog = vi.fn();
const mockCreateAndDispatch = vi.fn();
const mockEmitRequestUpdated = vi.fn();
const mockGetDepartmentMemberEmails = vi.fn();
const mockSendSlaAlertEmail = vi.fn();
const mockSendDailyReportEmail = vi.fn();
const mockSendDepartmentDailyReportEmail = vi.fn();

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

vi.mock('../src/services/keycloak-group-service.js', () => ({
  keycloakGroupService: {
    getDepartmentMemberEmails: (...args: unknown[]) =>
      mockGetDepartmentMemberEmails(...args),
  },
}));

vi.mock('../src/services/mail-service.js', () => ({
  mailService: {
    sendSlaAlertEmail: (...args: unknown[]) => mockSendSlaAlertEmail(...args),
    sendDailyReportEmail: (...args: unknown[]) =>
      mockSendDailyReportEmail(...args),
    sendDepartmentDailyReportEmail: (...args: unknown[]) =>
      mockSendDepartmentDailyReportEmail(...args),
  },
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
    mockGetDepartmentMemberEmails.mockReset();
    mockSendSlaAlertEmail.mockReset();
    mockSendDailyReportEmail.mockReset();
    mockSendDepartmentDailyReportEmail.mockReset();
    mockGetDepartmentMemberEmails.mockResolvedValue(['canbo@gmail.com']);
    mockSendSlaAlertEmail.mockResolvedValue({
      sent: true,
      skipped: false,
      recipients: ['canbo@gmail.com'],
    });
    mockSendDailyReportEmail.mockResolvedValue({
      sent: true,
      skipped: false,
      recipients: ['admin@gmail.com'],
    });
    mockSendDepartmentDailyReportEmail.mockResolvedValue({
      sent: true,
      skipped: false,
      recipients: ['canbo@gmail.com'],
    });
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
    expect(res.body).toMatchObject({
      success: true,
      dispatched: true,
      request_id: validId,
      department: 'Lớp/K11A1',
      email: {
        sent: true,
        skipped: false,
        recipients_count: 1,
      },
    });
    expect(mockGetDepartmentMemberEmails).toHaveBeenCalledWith('Lớp/K11A1');
    expect(mockSendSlaAlertEmail).toHaveBeenCalledTimes(1);

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

  it('POST /api/internal/kestra/daily-report-notify chặn 401 khi sai key và gửi email báo cáo khi hợp lệ', async () => {
    const unauthorized = await request(app)
      .post('/api/internal/kestra/daily-report-notify')
      .send({ total_active: 10 });
    expect(unauthorized.status).toBe(401);

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          target_department: 'KETOAN',
          total_requests: 6,
          pending_count: 2,
          approved_count: 3,
          rejected_count: 1,
          urgent_count: 1,
          avg_resolution_hours: 4.5,
        },
        {
          target_department: 'CTSV',
          total_requests: 4,
          pending_count: 0,
          approved_count: 4,
          rejected_count: 0,
          urgent_count: 0,
          avg_resolution_hours: 2.0,
        },
      ],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 'req-kt-1',
          title: 'Tra soát học phí',
          created_by: 'sinhvien',
          sender_group: 'K11A1',
          target_department: 'KETOAN',
          priority: 'URGENT',
          hours_pending: 3.5,
        },
      ],
    });
    mockGetDepartmentMemberEmails
      .mockResolvedValueOnce(['ketoan@gmail.com'])
      .mockResolvedValueOnce(['ctsv@unirequest.edu.vn']);
    mockSendDepartmentDailyReportEmail
      .mockResolvedValueOnce({
        sent: true,
        skipped: false,
        recipients: ['ketoan@gmail.com'],
      })
      .mockResolvedValueOnce({
        sent: false,
        skipped: true,
        recipients: [],
        reason: 'NO_DEPARTMENT_REAL_EMAIL',
      });

    const okRes = await request(app)
      .post('/api/internal/kestra/daily-report-notify')
      .set('x-kestra-key', config.kestra.webhookKey)
      .send({
        total_active: 22,
        total_pending: 8,
        total_approved: 12,
        total_rejected: 2,
        minio_key: 'unirequest-files/reports/daily/test.csv',
        execution_id: 'exec-daily-1',
      });

    expect(okRes.status).toBe(200);
    expect(okRes.body).toMatchObject({
      success: true,
      department_sent_count: 1,
      department_reports: [
        {
          department: 'KETOAN',
          sent: true,
          skipped: false,
          recipients_count: 1,
        },
        {
          department: 'CTSV',
          sent: false,
          skipped: true,
          recipients_count: 0,
          reason: 'NO_DEPARTMENT_REAL_EMAIL',
        },
      ],
      email: {
        sent: true,
        skipped: false,
        recipients_count: 1,
      },
    });
    expect(mockSendDepartmentDailyReportEmail).toHaveBeenCalledTimes(2);
    expect(mockSendDepartmentDailyReportEmail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        department: 'KETOAN',
        keycloakEmails: ['ketoan@gmail.com'],
        pendingItems: [
          expect.objectContaining({
            id: 'req-kt-1',
            title: 'Tra soát học phí',
          }),
        ],
      })
    );
    expect(mockSendDailyReportEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        totalActive: 22,
        totalPending: 8,
        totalApproved: 12,
        totalRejected: 2,
      })
    );
  });
});
