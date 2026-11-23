// SPDX-License-Identifier: Apache-2.0
import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../config/environment.js';

export interface MailDispatchResult {
  sent: boolean;
  skipped: boolean;
  recipients: string[];
  reason?: string;
  messageId?: string;
}

export interface SlaAlertEmailPayload {
  requestId: string;
  title: string;
  createdBy: string;
  senderGroup?: string | null;
  targetDepartment?: string | null;
  priority: string;
  hoursPendingText: string;
  thresholdHours?: number | string | null;
  executionId?: string | null;
  keycloakEmails?: string[];
}

export interface DailyReportDepartmentRow {
  target_department: string;
  total_requests: number;
  pending_count: number;
  approved_count: number;
  rejected_count: number;
  urgent_count: number;
  avg_resolution_hours: number;
}

export interface DailyReportEmailPayload {
  totalActive: number;
  totalPending: number;
  totalApproved: number;
  totalRejected: number;
  minioKey?: string | null;
  executionId?: string | null;
  departmentBreakdown: DailyReportDepartmentRow[];
  extraRecipients?: string[];
}

export interface DepartmentPendingItem {
  id: string;
  title: string;
  created_by: string;
  sender_group?: string | null;
  priority: string;
  hours_pending: number;
}

export interface DepartmentDailyReportEmailPayload {
  department: string;
  stats: DailyReportDepartmentRow;
  pendingItems: DepartmentPendingItem[];
  keycloakEmails: string[];
  executionId?: string | null;
}

const PLACEHOLDER_EMAIL_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'unirequest.local',
  'unirequest.edu.vn',
  'localhost',
]);

export function escapeHtml(input: unknown): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isPlaceholderEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() || '';
  return PLACEHOLDER_EMAIL_DOMAINS.has(domain);
}

/**
 * Gộp email thật của cán bộ từ Keycloak (lọc bỏ email mẫu nội bộ không tồn tại trên Internet)
 * với danh sách fallback SMTP_ALERT_TO trong .env.
 */
export function resolveEmailRecipients(
  keycloakEmails: readonly string[] = [],
  fallbackAlertTo: readonly string[] = config.smtp.alertTo
): string[] {
  const seen = new Set<string>();
  const resolved: string[] = [];

  const addIfValid = (raw: string, allowPlaceholder: boolean) => {
    const clean = raw.trim();
    if (!clean || !isValidEmail(clean)) return;
    if (!allowPlaceholder && isPlaceholderEmail(clean)) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    resolved.push(clean);
  };

  for (const email of keycloakEmails) {
    addIfValid(email, false);
  }
  for (const email of fallbackAlertTo) {
    addIfValid(email, true);
  }
  if (resolved.length === 0 && config.smtp.user) {
    addIfValid(config.smtp.user, false);
  }

  return resolved;
}

/**
 * Lọc nghiêm ngặt danh sách email thật của riêng một Phòng ban trên Keycloak.
 * Không fallback về SMTP_ALERT_TO hay SMTP_USER để bảo đảm cách ly dữ liệu
 * theo phạm vi DEPARTMENT và không spam nhiều email lẻ về hộp thư Admin.
 */
export function resolveStrictDepartmentEmails(
  keycloakEmails: readonly string[] = []
): string[] {
  const seen = new Set<string>();
  const resolved: string[] = [];

  for (const raw of keycloakEmails) {
    const clean = raw.trim();
    if (!clean || !isValidEmail(clean) || isPlaceholderEmail(clean)) {
      continue;
    }
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push(clean);
  }

  return resolved;
}

export class MailService {
  private transporter: Transporter | null = null;

  constructor(private readonly customTransporter?: Transporter) {}

  isConfigured(): boolean {
    if (this.customTransporter) return true;
    return Boolean(config.smtp.enabled && config.smtp.user && config.smtp.pass);
  }

  private getTransporter(): Transporter | null {
    if (this.customTransporter) return this.customTransporter;
    if (!this.isConfigured()) return null;
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: {
          user: config.smtp.user,
          pass: config.smtp.pass,
        },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      });
    }
    return this.transporter;
  }

  async sendSlaAlertEmail(
    payload: SlaAlertEmailPayload
  ): Promise<MailDispatchResult> {
    if (!this.isConfigured()) {
      return {
        sent: false,
        skipped: true,
        recipients: [],
        reason: 'SMTP_NOT_CONFIGURED',
      };
    }

    const recipients = resolveEmailRecipients(payload.keycloakEmails ?? []);
    if (recipients.length === 0) {
      return {
        sent: false,
        skipped: true,
        recipients: [],
        reason: 'NO_RECIPIENTS',
      };
    }

    const transporter = this.getTransporter();
    if (!transporter) {
      return {
        sent: false,
        skipped: true,
        recipients,
        reason: 'TRANSPORTER_UNAVAILABLE',
      };
    }

    const deptLabel = payload.targetDepartment
      ? payload.targetDepartment.split('/').join(' / ')
      : 'Chung';
    const senderDisplay = payload.senderGroup
      ? `${payload.createdBy} (${payload.senderGroup})`
      : payload.createdBy;
    const thresholdText =
      payload.thresholdHours !== undefined && payload.thresholdHours !== null
        ? `${payload.thresholdHours}h`
        : '24h';
    const subject = `[UniRequest SLA] Quá hạn ${payload.hoursPendingText} - ${deptLabel}: ${payload.title}`;
    const portalUrl = config.smtp.appPublicUrl;

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#111827;line-height:1.5;">
        <div style="background:#b91c1c;color:#ffffff;padding:16px 20px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:18px;">Cảnh báo yêu cầu quá hạn SLA</h2>
          <p style="margin:4px 0 0;font-size:13px;opacity:0.9;">Hệ thống UniRequest-OS (Kestra SLA Watchdog)</p>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 8px 8px;background:#ffffff;">
          <p style="margin-top:0;">Kính gửi cán bộ phụ trách <strong>${escapeHtml(deptLabel)}</strong>,</p>
          <p>Yêu cầu dưới đây đang ở trạng thái <strong>Chờ duyệt</strong> và đã vượt ngưỡng SLA xử lý:</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin:14px 0;">
            <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;width:36%;"><strong>Tiêu đề</strong></td><td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(payload.title)}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;"><strong>Người gửi</strong></td><td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(senderDisplay)}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;"><strong>Phòng ban</strong></td><td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(deptLabel)}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;"><strong>Mức ưu tiên</strong></td><td style="padding:8px;border:1px solid #e5e7eb;">${escapeHtml(payload.priority)}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;"><strong>Thời gian đã chờ</strong></td><td style="padding:8px;border:1px solid #e5e7eb;color:#b91c1c;"><strong>${escapeHtml(payload.hoursPendingText)} / ngưỡng ${escapeHtml(thresholdText)}</strong></td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f9fafb;"><strong>Mã hồ sơ</strong></td><td style="padding:8px;border:1px solid #e5e7eb;font-family:monospace;">${escapeHtml(payload.requestId)}</td></tr>
          </table>
          <p style="margin:18px 0;">
            <a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:13px;font-weight:bold;">Mở UniRequest-OS để xử lý</a>
          </p>
          <p style="font-size:11px;color:#6b7280;margin-bottom:0;">
            Email được gửi tự động từ Kestra SLA Watchdog (chống gửi lặp trong 6 giờ).
          </p>
        </div>
      </div>
    `.trim();

    const text = [
      `[UniRequest SLA] Cảnh báo yêu cầu quá hạn xử lý`,
      `- Tiêu đề: ${payload.title}`,
      `- Người gửi: ${senderDisplay}`,
      `- Phòng ban: ${deptLabel}`,
      `- Mức ưu tiên: ${payload.priority}`,
      `- Thời gian chờ: ${payload.hoursPendingText} (ngưỡng ${thresholdText})`,
      `- Mã hồ sơ: ${payload.requestId}`,
      `- Truy cập xử lý: ${portalUrl}`,
    ].join('\n');

    try {
      const fromHeader = config.smtp.from
        ? `UniRequest-OS <${config.smtp.from}>`
        : config.smtp.user;
      const info = await transporter.sendMail({
        from: fromHeader,
        to: recipients.join(', '),
        subject,
        text,
        html,
      });
      return {
        sent: true,
        skipped: false,
        recipients,
        messageId: info.messageId,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn('[MailService] Gửi email cảnh báo SLA thất bại:', msg);
      return {
        sent: false,
        skipped: false,
        recipients,
        reason: msg,
      };
    }
  }

  async sendDailyReportEmail(
    payload: DailyReportEmailPayload
  ): Promise<MailDispatchResult> {
    if (!this.isConfigured()) {
      return {
        sent: false,
        skipped: true,
        recipients: [],
        reason: 'SMTP_NOT_CONFIGURED',
      };
    }

    const recipients = resolveEmailRecipients(payload.extraRecipients ?? []);
    if (recipients.length === 0) {
      return {
        sent: false,
        skipped: true,
        recipients: [],
        reason: 'NO_RECIPIENTS',
      };
    }

    const transporter = this.getTransporter();
    if (!transporter) {
      return {
        sent: false,
        skipped: true,
        recipients,
        reason: 'TRANSPORTER_UNAVAILABLE',
      };
    }

    const todayStr = new Intl.DateTimeFormat('vi-VN', {
      timeZone: config.timezone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date());

    const subject = `[UniRequest] Báo cáo tổng hợp cuối ngày ${todayStr}`;
    const portalUrl = config.smtp.appPublicUrl;

    const rowsHtml = payload.departmentBreakdown
      .map(
        (row) => `
          <tr>
            <td style="padding:7px 8px;border:1px solid #e5e7eb;">${escapeHtml(row.target_department)}</td>
            <td style="padding:7px 8px;border:1px solid #e5e7eb;text-align:right;">${row.total_requests}</td>
            <td style="padding:7px 8px;border:1px solid #e5e7eb;text-align:right;color:#b45309;">${row.pending_count}</td>
            <td style="padding:7px 8px;border:1px solid #e5e7eb;text-align:right;color:#047857;">${row.approved_count}</td>
            <td style="padding:7px 8px;border:1px solid #e5e7eb;text-align:right;">${row.rejected_count}</td>
            <td style="padding:7px 8px;border:1px solid #e5e7eb;text-align:right;">${row.avg_resolution_hours}h</td>
          </tr>
        `
      )
      .join('');

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#111827;line-height:1.5;">
        <div style="background:#0f172a;color:#ffffff;padding:16px 20px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:18px;">Báo cáo tổng hợp cuối ngày (${escapeHtml(todayStr)})</h2>
          <p style="margin:4px 0 0;font-size:13px;opacity:0.85;">Hệ thống UniRequest-OS (Kestra Daily Report)</p>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 8px 8px;background:#ffffff;">
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;text-align:center;">
            <tr>
              <td style="padding:10px;border:1px solid #e5e7eb;background:#f9fafb;"><div style="font-size:11px;color:#6b7280;">Tổng hồ sơ</div><div style="font-size:20px;font-weight:bold;">${payload.totalActive}</div></td>
              <td style="padding:10px;border:1px solid #e5e7eb;background:#fffbeb;"><div style="font-size:11px;color:#b45309;">Chờ duyệt</div><div style="font-size:20px;font-weight:bold;color:#b45309;">${payload.totalPending}</div></td>
              <td style="padding:10px;border:1px solid #e5e7eb;background:#ecfdf5;"><div style="font-size:11px;color:#047857;">Đã duyệt</div><div style="font-size:20px;font-weight:bold;color:#047857;">${payload.totalApproved}</div></td>
              <td style="padding:10px;border:1px solid #e5e7eb;background:#f9fafb;"><div style="font-size:11px;color:#6b7280;">Từ chối</div><div style="font-size:20px;font-weight:bold;">${payload.totalRejected}</div></td>
            </tr>
          </table>
          ${
            rowsHtml
              ? `<h3 style="font-size:14px;margin:14px 0 8px;">Phân bổ theo từng Phòng ban</h3>
                 <table style="width:100%;border-collapse:collapse;font-size:12px;">
                   <thead>
                     <tr style="background:#f3f4f6;">
                       <th style="padding:7px 8px;border:1px solid #e5e7eb;text-align:left;">Phòng ban</th>
                       <th style="padding:7px 8px;border:1px solid #e5e7eb;text-align:right;">Tổng</th>
                       <th style="padding:7px 8px;border:1px solid #e5e7eb;text-align:right;">Chờ</th>
                       <th style="padding:7px 8px;border:1px solid #e5e7eb;text-align:right;">Duyệt</th>
                       <th style="padding:7px 8px;border:1px solid #e5e7eb;text-align:right;">Từ chối</th>
                       <th style="padding:7px 8px;border:1px solid #e5e7eb;text-align:right;">Xử lý TB</th>
                     </tr>
                   </thead>
                   <tbody>${rowsHtml}</tbody>
                 </table>`
              : '<p style="font-size:13px;color:#6b7280;">Hiện chưa có dữ liệu hồ sơ hoạt động.</p>'
          }
          ${
            payload.minioKey
              ? `<p style="font-size:12px;color:#4b5563;margin-top:14px;">Bản sao CSV đã lưu trữ: <code>${escapeHtml(payload.minioKey)}</code></p>`
              : ''
          }
          <p style="margin:18px 0 0;">
            <a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:13px;font-weight:bold;">Mở Bảng điều khiển UniRequest-OS</a>
          </p>
        </div>
      </div>
    `.trim();

    const text = [
      `[UniRequest] Báo cáo tổng hợp cuối ngày ${todayStr}`,
      `- Tổng hồ sơ: ${payload.totalActive} (Chờ duyệt: ${payload.totalPending}, Đã duyệt: ${payload.totalApproved}, Từ chối: ${payload.totalRejected})`,
      ...payload.departmentBreakdown.map(
        (r) =>
          `  + ${r.target_department}: ${r.total_requests} hồ sơ (${r.approved_count} duyệt, ${r.pending_count} chờ, ${r.rejected_count} từ chối, TB ${r.avg_resolution_hours}h)`
      ),
      payload.minioKey ? `- Tệp CSV lưu trữ: ${payload.minioKey}` : '',
      `- Cổng quản trị: ${portalUrl}`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const fromHeader = config.smtp.from
        ? `UniRequest-OS <${config.smtp.from}>`
        : config.smtp.user;
      const info = await transporter.sendMail({
        from: fromHeader,
        to: recipients.join(', '),
        subject,
        text,
        html,
      });
      return {
        sent: true,
        skipped: false,
        recipients,
        messageId: info.messageId,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn('[MailService] Gửi email báo cáo cuối ngày thất bại:', msg);
      return {
        sent: false,
        skipped: false,
        recipients,
        reason: msg,
      };
    }
  }

  /**
   * Báo cáo cuối ngày cấp Phòng ban (DEPARTMENT scope):
   * Chỉ chứa số liệu và danh sách đơn tồn đọng của ĐÚNG phòng ban đó,
   * chỉ gửi tới danh sách email thật của cán bộ thuộc Group phòng ban trên Keycloak.
   */
  async sendDepartmentDailyReportEmail(
    payload: DepartmentDailyReportEmailPayload
  ): Promise<MailDispatchResult> {
    if (!this.isConfigured()) {
      return {
        sent: false,
        skipped: true,
        recipients: [],
        reason: 'SMTP_NOT_CONFIGURED',
      };
    }

    const recipients = resolveStrictDepartmentEmails(payload.keycloakEmails);
    if (recipients.length === 0) {
      return {
        sent: false,
        skipped: true,
        recipients: [],
        reason: 'NO_DEPARTMENT_REAL_EMAIL',
      };
    }

    const transporter = this.getTransporter();
    if (!transporter) {
      return {
        sent: false,
        skipped: true,
        recipients,
        reason: 'TRANSPORTER_UNAVAILABLE',
      };
    }

    const todayStr = new Intl.DateTimeFormat('vi-VN', {
      timeZone: config.timezone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date());

    const deptLabel = payload.department.split('/').join(' / ');
    const { stats } = payload;
    const subject = `[UniRequest - ${deptLabel}] Báo cáo cuối ngày ${todayStr} (${stats.pending_count} chờ duyệt)`;
    const portalUrl = config.smtp.appPublicUrl;

    const pendingRowsHtml = payload.pendingItems
      .slice(0, 5)
      .map((item) => {
        const sender = item.sender_group
          ? `${item.created_by} (${item.sender_group})`
          : item.created_by;
        return `
          <tr>
            <td style="padding:7px 8px;border:1px solid #e5e7eb;">${escapeHtml(item.title)}</td>
            <td style="padding:7px 8px;border:1px solid #e5e7eb;">${escapeHtml(sender)}</td>
            <td style="padding:7px 8px;border:1px solid #e5e7eb;text-align:center;">${escapeHtml(item.priority)}</td>
            <td style="padding:7px 8px;border:1px solid #e5e7eb;text-align:right;color:#b45309;">${Number(item.hours_pending).toFixed(1)}h</td>
          </tr>
        `;
      })
      .join('');

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#111827;line-height:1.5;">
        <div style="background:#1e293b;color:#ffffff;padding:16px 20px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:18px;">Báo cáo cuối ngày - ${escapeHtml(deptLabel)} (${escapeHtml(todayStr)})</h2>
          <p style="margin:4px 0 0;font-size:13px;opacity:0.85;">Phạm vi riêng phòng ban (UniRequest-OS - Kestra Daily Report)</p>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 8px 8px;background:#ffffff;">
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;text-align:center;">
            <tr>
              <td style="padding:10px;border:1px solid #e5e7eb;background:#f9fafb;"><div style="font-size:11px;color:#6b7280;">Tổng hồ sơ</div><div style="font-size:20px;font-weight:bold;">${stats.total_requests}</div></td>
              <td style="padding:10px;border:1px solid #e5e7eb;background:#fffbeb;"><div style="font-size:11px;color:#b45309;">Chờ duyệt</div><div style="font-size:20px;font-weight:bold;color:#b45309;">${stats.pending_count}</div></td>
              <td style="padding:10px;border:1px solid #e5e7eb;background:#ecfdf5;"><div style="font-size:11px;color:#047857;">Đã duyệt</div><div style="font-size:20px;font-weight:bold;color:#047857;">${stats.approved_count}</div></td>
              <td style="padding:10px;border:1px solid #e5e7eb;background:#f9fafb;"><div style="font-size:11px;color:#6b7280;">Từ chối</div><div style="font-size:20px;font-weight:bold;">${stats.rejected_count}</div></td>
            </tr>
          </table>
          <p style="font-size:13px;margin:0 0 12px;color:#374151;">
            Đơn khẩn cấp: <strong>${stats.urgent_count}</strong> | Thời gian xử lý trung bình: <strong>${stats.avg_resolution_hours}h</strong>
          </p>
          ${
            pendingRowsHtml
              ? `<h3 style="font-size:14px;margin:14px 0 8px;">Danh sách hồ sơ đang chờ duyệt tại ${escapeHtml(deptLabel)}</h3>
                 <table style="width:100%;border-collapse:collapse;font-size:12px;">
                   <thead>
                     <tr style="background:#f3f4f6;">
                       <th style="padding:7px 8px;border:1px solid #e5e7eb;text-align:left;">Tiêu đề</th>
                       <th style="padding:7px 8px;border:1px solid #e5e7eb;text-align:left;">Người gửi</th>
                       <th style="padding:7px 8px;border:1px solid #e5e7eb;text-align:center;">Ưu tiên</th>
                       <th style="padding:7px 8px;border:1px solid #e5e7eb;text-align:right;">Đã chờ</th>
                     </tr>
                   </thead>
                   <tbody>${pendingRowsHtml}</tbody>
                 </table>`
              : `<p style="font-size:13px;color:#047857;">Tuyệt vời! Hiện không còn hồ sơ nào đang chờ duyệt tại <strong>${escapeHtml(deptLabel)}</strong>.</p>`
          }
          <p style="margin:18px 0 0;">
            <a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:13px;font-weight:bold;">Mở UniRequest-OS xử lý hồ sơ</a>
          </p>
          <p style="font-size:11px;color:#6b7280;margin-top:14px;margin-bottom:0;">
            Báo cáo này chỉ tổng hợp dữ liệu thuộc phòng ban ${escapeHtml(deptLabel)} theo chuẩn cách ly dữ liệu Zero-Trust.
          </p>
        </div>
      </div>
    `.trim();

    const text = [
      `[UniRequest - ${deptLabel}] Báo cáo cuối ngày ${todayStr}`,
      `- Tổng hồ sơ: ${stats.total_requests} (Chờ duyệt: ${stats.pending_count}, Đã duyệt: ${stats.approved_count}, Từ chối: ${stats.rejected_count})`,
      `- Khẩn cấp: ${stats.urgent_count} | Thời gian xử lý TB: ${stats.avg_resolution_hours}h`,
      ...(payload.pendingItems.length > 0
        ? [
            '- Hồ sơ đang chờ duyệt:',
            ...payload.pendingItems
              .slice(0, 5)
              .map(
                (i) =>
                  `  + [${i.priority}] ${i.title} - ${i.created_by}${i.sender_group ? ` (${i.sender_group})` : ''} (chờ ${Number(i.hours_pending).toFixed(1)}h)`
              ),
          ]
        : ['- Hiện không còn hồ sơ nào chờ duyệt.']),
      `- Truy cập xử lý: ${portalUrl}`,
    ].join('\n');

    try {
      const fromHeader = config.smtp.from
        ? `UniRequest-OS <${config.smtp.from}>`
        : config.smtp.user;
      const info = await transporter.sendMail({
        from: fromHeader,
        to: recipients.join(', '),
        subject,
        text,
        html,
      });
      return {
        sent: true,
        skipped: false,
        recipients,
        messageId: info.messageId,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(
        `[MailService] Gửi email báo cáo riêng phòng ban ${deptLabel} thất bại:`,
        msg
      );
      return {
        sent: false,
        skipped: false,
        recipients,
        reason: msg,
      };
    }
  }
}

export const mailService = new MailService();
