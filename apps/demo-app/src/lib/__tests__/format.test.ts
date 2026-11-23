import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatDateTime,
  getDateKeyInAppTimezone,
  isSameDayInAppTimezone,
  resolveAttachmentUrl,
} from '../format';
import { resolveServiceUrl } from '../runtime-urls';

describe('Vietnam / Bangkok (+07:00) Timezone Formatting', () => {
  it('hiển thị đúng giờ Việt Nam / Bangkok (+07:00) từ mốc ISO UTC', () => {
    // 17:30 UTC ngày 20/11 -> 00:30 ngày 21/11 theo Asia/Ho_Chi_Minh (GMT+7)
    const formatted = formatDateTime('2026-11-20T17:30:00.000Z');
    expect(formatted).toContain('00:30');
    expect(formatted).toContain('21/11/2026');
  });

  it('tính chính xác khóa ngày YYYY-MM-DD theo múi giờ +07:00 quanh nửa đêm', () => {
    expect(getDateKeyInAppTimezone('2026-11-20T17:05:00.000Z')).toBe('2026-11-21');
    expect(getDateKeyInAppTimezone('2026-11-20T16:55:00.000Z')).toBe('2026-11-20');
  });

  it('nhận diện cùng ngày chính xác theo múi giờ +07:00', () => {
    const ref = new Date('2026-11-21T02:00:00.000Z'); // 09:00 ngày 21/11 (+07:00)
    expect(isSameDayInAppTimezone('2026-11-20T17:15:00.000Z', ref)).toBe(true);
    expect(isSameDayInAppTimezone('2026-11-20T16:45:00.000Z', ref)).toBe(false);
  });
});

describe('Same-Origin & Internet Attachment URL Resolution', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('giữ localhost:8000 khi chạy local và tự động chuyển Same-Origin khi chạy qua domain HTTPS', () => {
    vi.stubGlobal('window', {
      location: { hostname: 'localhost', origin: 'http://localhost:3000' },
    });
    expect(resolveServiceUrl('auto', '/api', 'http://localhost:8000/api')).toBe(
      'http://localhost:8000/api'
    );

    vi.stubGlobal('window', {
      location: {
        hostname: 'unirequest.example.vn',
        origin: 'https://unirequest.example.vn',
      },
    });
    expect(resolveServiceUrl('auto', '/api', 'http://localhost:8000/api')).toBe(
      'https://unirequest.example.vn/api'
    );
    expect(
      resolveServiceUrl(
        'http://localhost:8000/auth',
        '/auth',
        'http://localhost:8000/auth'
      )
    ).toBe('https://unirequest.example.vn/auth');
  });

  it('chuẩn hóa đường dẫn tệp MinIO cũ và đường dẫn tương đối sang proxy /api/upload/files', () => {
    expect(
      resolveAttachmentUrl(
        '/api/upload/files/123_abc_minhchung.png',
        'https://unirequest.example.vn/api'
      )
    ).toBe('https://unirequest.example.vn/api/upload/files/123_abc_minhchung.png');

    expect(
      resolveAttachmentUrl(
        'http://localhost:9000/unirequest-files/123_abc_minhchung.png',
        'https://unirequest.example.vn/api'
      )
    ).toBe('https://unirequest.example.vn/api/upload/files/123_abc_minhchung.png');
  });
});
