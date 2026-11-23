// SPDX-License-Identifier: Apache-2.0
import path from 'path';

export interface FileValidationResult {
  ok: boolean;
  code?: 'UNSUPPORTED_OR_SPOOFED_FILE';
  message: string;
  detectedType?: string;
}

export const BLOCKED_FILE_EXTENSIONS = new Set([
  '.exe',
  '.msi',
  '.dll',
  '.bat',
  '.cmd',
  '.ps1',
  '.sh',
  '.bash',
  '.svg',
  '.html',
  '.htm',
  '.js',
  '.mjs',
  '.cjs',
  '.php',
  '.jsp',
  '.py',
  '.rb',
  '.jar',
  '.vbs',
  '.scr',
  '.com',
]);

export const ALLOWED_FILE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.pdf',
  '.docx',
  '.xlsx',
  '.pptx',
  '.zip',
  '.txt',
  '.csv',
]);

function startsWithBytes(buffer: Buffer, signature: readonly number[]): boolean {
  if (buffer.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (buffer[i] !== signature[i]) return false;
  }
  return true;
}

function isExecutableOrScriptPayload(buffer: Buffer): boolean {
  // Windows PE ("MZ"), ELF, Mach-O, Java Class / Mach-O Fat, Shebang ("#!")
  if (startsWithBytes(buffer, [0x4d, 0x5a])) return true;
  if (startsWithBytes(buffer, [0x7f, 0x45, 0x4c, 0x46])) return true;
  if (startsWithBytes(buffer, [0xcf, 0xfa, 0xed, 0xfe])) return true;
  if (startsWithBytes(buffer, [0xfe, 0xed, 0xfa, 0xcf])) return true;
  if (startsWithBytes(buffer, [0xca, 0xfe, 0xba, 0xbe])) return true;
  if (startsWithBytes(buffer, [0x23, 0x21])) return true;

  const headUtf8 = buffer.subarray(0, 256).toString('utf8').trimStart().toLowerCase();
  if (
    headUtf8.startsWith('<svg') ||
    headUtf8.startsWith('<!doctype html') ||
    headUtf8.startsWith('<html') ||
    headUtf8.startsWith('<script')
  ) {
    return true;
  }

  return false;
}

function detectBinaryType(buffer: Buffer): string | null {
  if (startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'png';
  }
  if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) {
    return 'jpeg';
  }
  if (
    startsWithBytes(buffer, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    startsWithBytes(buffer, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) {
    return 'gif';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  if (startsWithBytes(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return 'pdf';
  }
  if (
    startsWithBytes(buffer, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWithBytes(buffer, [0x50, 0x4b, 0x05, 0x06])
  ) {
    return 'zip-container';
  }
  return null;
}

function isPlainTextBuffer(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 4096);
  for (let i = 0; i < sample.length; i++) {
    const byte = sample[i];
    // Chặn ký tự null hoặc byte điều khiển nhị phân bất thường (trừ \t, \n, \r)
    if (byte === 0 || (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d)) {
      return false;
    }
  }
  return true;
}

export function isAllowedExtension(filename: string): {
  allowed: boolean;
  ext: string;
} {
  const ext = path.extname(filename || '').toLowerCase();
  if (!ext || BLOCKED_FILE_EXTENSIONS.has(ext) || !ALLOWED_FILE_EXTENSIONS.has(ext)) {
    return { allowed: false, ext };
  }
  return { allowed: true, ext };
}

/**
 * Trạm kiểm dịch tệp tin trong RAM Buffer (Tầng 1 Security):
 * Đối chiếu phần mở rộng với Magic Bytes nhị phân thực tế trước khi lưu vào MinIO S3.
 */
export function validateUploadedFileBuffer(params: {
  originalName: string;
  mimetype: string;
  buffer: Buffer;
}): FileValidationResult {
  const { allowed, ext } = isAllowedExtension(params.originalName);
  if (!allowed) {
    return {
      ok: false,
      code: 'UNSUPPORTED_OR_SPOOFED_FILE',
      message: `Định dạng tệp "${ext || '(không rõ)'}" bị chặn hoặc không nằm trong danh sách an toàn.`,
    };
  }

  if (!params.buffer || params.buffer.length === 0) {
    return {
      ok: false,
      code: 'UNSUPPORTED_OR_SPOOFED_FILE',
      message: 'Tệp tải lên bị rỗng hoặc không đọc được nội dung.',
    };
  }

  if (isExecutableOrScriptPayload(params.buffer)) {
    return {
      ok: false,
      code: 'UNSUPPORTED_OR_SPOOFED_FILE',
      message:
        'Phát hiện chữ ký tệp thực thi hoặc mã nhúng không an toàn bên trong tệp tải lên.',
    };
  }

  if (ext === '.txt' || ext === '.csv') {
    if (!isPlainTextBuffer(params.buffer)) {
      return {
        ok: false,
        code: 'UNSUPPORTED_OR_SPOOFED_FILE',
        message: 'Tệp văn bản chứa dữ liệu nhị phân giả mạo không hợp lệ.',
      };
    }
    return { ok: true, message: 'Hợp lệ', detectedType: 'text/plain' };
  }

  const detected = detectBinaryType(params.buffer);
  const expectedByExt: Record<string, string> = {
    '.png': 'png',
    '.jpg': 'jpeg',
    '.jpeg': 'jpeg',
    '.gif': 'gif',
    '.webp': 'webp',
    '.pdf': 'pdf',
    '.zip': 'zip-container',
    '.docx': 'zip-container',
    '.xlsx': 'zip-container',
    '.pptx': 'zip-container',
  };

  const expectedType = expectedByExt[ext];
  if (!detected || detected !== expectedType) {
    return {
      ok: false,
      code: 'UNSUPPORTED_OR_SPOOFED_FILE',
      message: `Chữ ký nhị phân (Magic Bytes) không khớp với định dạng "${ext}" (nghi vấn giả mạo tệp).`,
    };
  }

  return {
    ok: true,
    message: 'Hợp lệ',
    detectedType: detected,
  };
}
