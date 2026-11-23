// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { validateUploadedFileBuffer } from '../src/utils/file-security.js';

describe('Tầng 1 File Quarantine & Magic Bytes Security', () => {
  it('cho phép ảnh PNG có chữ ký nhị phân thật (89 50 4E 47 0D 0A 1A 0A)', () => {
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    const result = validateUploadedFileBuffer({
      originalName: 'minh-chung.png',
      mimetype: 'image/png',
      buffer: pngHeader,
    });

    expect(result.ok).toBe(true);
    expect(result.detectedType).toBe('png');
  });

  it('cho phép tài liệu PDF có chữ ký %PDF- thật', () => {
    const pdfBuffer = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n', 'utf8');
    const result = validateUploadedFileBuffer({
      originalName: 'don-xac-nhan.pdf',
      mimetype: 'application/pdf',
      buffer: pdfBuffer,
    });

    expect(result.ok).toBe(true);
    expect(result.detectedType).toBe('pdf');
  });

  it('chặn tệp thực thi Windows PE (.exe) đổi đuôi giả mạo thành .png', () => {
    const spoofedExeAsPng = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
    const result = validateUploadedFileBuffer({
      originalName: 'malware.png',
      mimetype: 'image/png',
      buffer: spoofedExeAsPng,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('UNSUPPORTED_OR_SPOOFED_FILE');
  });

  it('chặn tệp HTML/SVG/Script chứa XSS dù gửi dưới định dạng giả mạo', () => {
    const svgXss = Buffer.from('<svg onload="alert(1)"></svg>', 'utf8');
    const result = validateUploadedFileBuffer({
      originalName: 'xss.svg',
      mimetype: 'image/svg+xml',
      buffer: svgXss,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('UNSUPPORTED_OR_SPOOFED_FILE');

    const htmlSpoofedPdf = Buffer.from('<!DOCTYPE html><script>alert(1)</script>', 'utf8');
    const spoofedResult = validateUploadedFileBuffer({
      originalName: 'fake.pdf',
      mimetype: 'application/pdf',
      buffer: htmlSpoofedPdf,
    });
    expect(spoofedResult.ok).toBe(false);
    expect(spoofedResult.code).toBe('UNSUPPORTED_OR_SPOOFED_FILE');
  });
});
