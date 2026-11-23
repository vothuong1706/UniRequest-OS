// SPDX-License-Identifier: Apache-2.0
import type { Transporter } from 'nodemailer';
import { describe, expect, it, vi } from 'vitest';
import {
  escapeHtml,
  MailService,
  resolveEmailRecipients,
} from '../src/services/mail-service.js';

describe('MailService - Gmail SMTP cho Kestra SLA Watchdog & Daily Report', () => {
  it('escapeHtml chống XSS trong nội dung tiêu đề/phòng ban email', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
    );
  });

  it('resolveEmailRecipients lọc bỏ email mẫu nội bộ, giữ email thật và khử trùng lặp', () => {
    const recipients = resolveEmailRecipients(
      [
        'demo@unirequest.edu.vn',
        'fake@example.com',
        'canbo.ketoan@gmail.com',
        'CANBO.KETOAN@gmail.com',
      ],
      ['admin.ops@gmail.com', 'canbo.ketoan@gmail.com']
    );

    expect(recipients).toEqual([
      'canbo.ketoan@gmail.com',
      'admin.ops@gmail.com',
    ]);
  });

  it('bỏ qua an toàn (skipped=true, không ném lỗi) khi chưa cấu hình SMTP_PASS (chạy offline)', async () => {
    const svc = new MailService();
    const res = await svc.sendSlaAlertEmail({
      requestId: '11111111-1111-4111-8111-111111111111',
      title: 'Xin hóa đơn học phí',
      createdBy: 'sinhvien',
      senderGroup: 'K11A1',
      targetDepartment: 'KETOAN',
      priority: 'URGENT',
      hoursPendingText: '4.2h',
      thresholdHours: 2,
      keycloakEmails: ['canbo@gmail.com'],
    });

    expect(res.sent).toBe(false);
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe('SMTP_NOT_CONFIGURED');
  });

  it('gửi thành công email SLA Alert và Daily Report HTML qua transporter', async () => {
    const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'msg-123' });
    const fakeTransporter = { sendMail: mockSendMail } as unknown as Transporter;
    const svc = new MailService(fakeTransporter);

    const slaRes = await svc.sendSlaAlertEmail({
      requestId: '11111111-1111-4111-8111-111111111111',
      title: 'Báo hỏng máy chiếu <B201>',
      createdBy: 'sinhvien',
      senderGroup: 'K11A1',
      targetDepartment: 'Phòng Quản trị Thiết bị',
      priority: 'URGENT',
      hoursPendingText: '5.5h',
      thresholdHours: 2,
      keycloakEmails: ['qttb@gmail.com'],
    });

    expect(slaRes.sent).toBe(true);
    expect(slaRes.recipients).toEqual(['qttb@gmail.com']);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'qttb@gmail.com',
        subject: expect.stringContaining('[UniRequest SLA]'),
        html: expect.stringContaining('&lt;B201&gt;'),
      })
    );

    const dailyRes = await svc.sendDailyReportEmail({
      totalActive: 22,
      totalPending: 6,
      totalApproved: 14,
      totalRejected: 2,
      minioKey: 'unirequest-files/reports/daily/2026-11-23.csv',
      departmentBreakdown: [
        {
          target_department: 'KETOAN',
          total_requests: 6,
          pending_count: 2,
          approved_count: 3,
          rejected_count: 1,
          urgent_count: 1,
          avg_resolution_hours: 3.2,
        },
      ],
      extraRecipients: ['bgh@gmail.com'],
    });

    expect(dailyRes.sent).toBe(true);
    expect(dailyRes.recipients).toEqual(['bgh@gmail.com']);
    expect(mockSendMail).toHaveBeenCalledTimes(2);
  });
});
