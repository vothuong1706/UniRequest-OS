// SPDX-License-Identifier: Apache-2.0
import { Readable } from 'node:stream';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetObjectStream = vi.fn();
const mockVerifyKeycloakJwt = vi.fn();

vi.mock('../src/middlewares/auth-middleware.js', () => ({
  authenticateToken: (_req: unknown, _res: unknown, next: () => void) => next(),
  verifyKeycloakJwt: (...args: unknown[]) => mockVerifyKeycloakJwt(...args),
  getKeycloakPublicKey: vi.fn(),
}));

vi.mock('../src/services/storage-service.js', () => ({
  storageService: {
    getObjectStream: (...args: unknown[]) => mockGetObjectStream(...args),
    uploadFile: vi.fn(),
  },
}));

import { createApp } from '../src/app.js';
import {
  extractAttachmentObjectName,
  signAttachmentUrl,
  stripAttachmentSignature,
  verifyAttachmentSignature,
} from '../src/utils/attachment-signing.js';

describe('Attachment Signed URL & Private MinIO Proxy Guard', () => {
  const app = createApp();

  beforeEach(() => {
    mockGetObjectStream.mockReset();
    mockVerifyKeycloakJwt.mockReset();
  });

  it('ký và xác minh chữ ký HMAC ngắn hạn, chặn URL bị sửa tham số hoặc hết hạn', () => {
    const now = 1_800_000_000;
    const secret = 'test-signing-secret-2026';
    const signed = signAttachmentUrl('/api/upload/files/12345_proof.png', {
      ttlSeconds: 600,
      nowSeconds: now,
      secret,
    });

    expect(signed).toMatch(
      /^\/api\/upload\/files\/12345_proof\.png\?exp=\d+&sig=[a-f0-9]{64}$/
    );

    const parsed = new URL(`http://localhost:3000${signed}`);
    const exp = parsed.searchParams.get('exp');
    const sig = parsed.searchParams.get('sig');

    expect(
      verifyAttachmentSignature('12345_proof.png', exp, sig, {
        nowSeconds: now + 300,
        secret,
      })
    ).toBe(true);

    // Hết hạn
    expect(
      verifyAttachmentSignature('12345_proof.png', exp, sig, {
        nowSeconds: now + 601,
        secret,
      })
    ).toBe(false);

    // Tráo tên tệp khác dùng lại chữ ký cũ
    expect(
      verifyAttachmentSignature('other_file.png', exp, sig, {
        nowSeconds: now + 100,
        secret,
      })
    ).toBe(false);

    // Strip chữ ký trước khi lưu DB & chặn URL độc hại (XSS / URL ngoài)
    expect(stripAttachmentSignature(signed)).toBe('/api/upload/files/12345_proof.png');
    expect(
      extractAttachmentObjectName('http://localhost:9000/unirequest-files/legacy.pdf')
    ).toBe('legacy.pdf');
    expect(
      extractAttachmentObjectName(
        'https://demo.trycloudflare.com/api/upload/files/12345_proof.png?exp=1&sig=2'
      )
    ).toBe('12345_proof.png');
    expect(stripAttachmentSignature('javascript:alert(1)')).toBeNull();
    expect(stripAttachmentSignature('https://evil.example.com/phish.png')).toBeNull();

    // TTL không hợp lệ (NaN / <= 0) tự hồi về mặc định an toàn thay vì tạo exp=NaN
    const fallbackSigned = signAttachmentUrl('/api/upload/files/12345_proof.png', {
      ttlSeconds: Number.NaN,
      nowSeconds: now,
      secret,
    });
    expect(fallbackSigned).toMatch(
      /^\/api\/upload\/files\/12345_proof\.png\?exp=\d+&sig=[a-f0-9]{64}$/
    );
  });

  it('GET /api/upload/files/:objectName trả về HTTP 401 khi không có chữ ký HMAC và không có JWT', async () => {
    const res = await request(app).get('/api/upload/files/12345_proof.png');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('ATTACHMENT_AUTH_REQUIRED');
    expect(mockGetObjectStream).not.toHaveBeenCalled();
  });

  it('GET /api/upload/files/:objectName phục vụ tệp khi có chữ ký HMAC hợp lệ', async () => {
    mockGetObjectStream.mockResolvedValueOnce({
      stream: Readable.from(Buffer.from('PNG_BYTES')),
      contentType: 'image/png',
      size: 9,
    });

    const signed = signAttachmentUrl('/api/upload/files/12345_proof.png');
    const res = await request(app).get(signed!);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.headers['cache-control']).toBe('private, max-age=300');
    expect(mockGetObjectStream).toHaveBeenCalledWith('12345_proof.png');
  });

  it('GET /api/upload/files/:objectName cho phép tải bằng Bearer JWT hợp lệ ngay cả khi không có ?sig', async () => {
    mockVerifyKeycloakJwt.mockResolvedValueOnce({
      preferred_username: 'sinhvien',
      roles: ['sinhvien'],
      groups: ['Lớp/K11A1'],
    });
    mockGetObjectStream.mockResolvedValueOnce({
      stream: Readable.from(Buffer.from('PDF_BYTES')),
      contentType: 'application/pdf',
      size: 9,
    });

    const res = await request(app)
      .get('/api/upload/files/12345_report.pdf')
      .set('Authorization', 'Bearer valid-jwt-token');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });
});
