// SPDX-License-Identifier: Apache-2.0
import crypto from 'crypto';
import { config } from '../config/environment.js';

const ATTACHMENT_PREFIX = '/api/upload/files/';
const PROXY_ABSOLUTE_REGEX =
  /^https?:\/\/[^/]+\/api\/upload\/files\/([^/?#]+)(?:[?#].*)?$/i;
const LEGACY_MINIO_REGEX =
  /^https?:\/\/(?:localhost|127\.0\.0\.1|minio):9000\/[^/]+\/([^/?#]+)(?:[?#].*)?$/i;
const DEFAULT_SIGNED_URL_TTL_SECONDS = 3600;

function resolveSigningSecret(): string {
  if (config.security.attachmentSigningSecret) {
    return config.security.attachmentSigningSecret;
  }
  const parts = [
    config.minio.secretKey,
    config.kestra.webhookKey,
    config.database.password,
  ].filter((part) => part.length > 0);
  if (parts.length === 0) {
    return '';
  }
  return crypto.createHash('sha256').update(parts.join(':'), 'utf8').digest('hex');
}

/**
 * Trích xuất objectName an toàn từ đường dẫn tệp đính kèm (/api/upload/files/<objectName>?...)
 * hoặc URL MinIO cũ. Trả về null nếu không phải URL tệp nội bộ.
 */
export function extractAttachmentObjectName(
  url: string | null | undefined
): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith(ATTACHMENT_PREFIX)) {
    const rest = trimmed.slice(ATTACHMENT_PREFIX.length);
    const objectName = rest.split(/[?#]/)[0]?.trim() || '';
    return /^[a-zA-Z0-9._-]+$/.test(objectName) ? objectName : null;
  }

  const proxyAbsoluteMatch = trimmed.match(PROXY_ABSOLUTE_REGEX);
  if (proxyAbsoluteMatch?.[1]) {
    const objectName = proxyAbsoluteMatch[1].trim();
    return /^[a-zA-Z0-9._-]+$/.test(objectName) ? objectName : null;
  }

  const legacyMatch = trimmed.match(LEGACY_MINIO_REGEX);
  if (legacyMatch?.[1]) {
    const objectName = legacyMatch[1].trim();
    return /^[a-zA-Z0-9._-]+$/.test(objectName) ? objectName : null;
  }

  return null;
}

/**
 * Chuẩn hóa URL tệp đính kèm về dạng sạch không kèm chữ ký (?exp=...&sig=...) trước khi lưu DB.
 * Trả về null nếu không phải đường dẫn tệp đính kèm nội bộ hợp lệ (chặn XSS javascript:/URL lạ).
 */
export function stripAttachmentSignature(
  url: string | null | undefined
): string | null {
  if (!url) return null;
  const objectName = extractAttachmentObjectName(url);
  if (objectName) {
    return `${ATTACHMENT_PREFIX}${objectName}`;
  }
  return null;
}

/**
 * Tạo chữ ký HMAC-SHA256 ngắn hạn cho một objectName và mốc hết hạn (epoch seconds).
 */
export function computeAttachmentSignature(
  objectName: string,
  exp: number,
  secretOverride?: string
): string {
  const secret = secretOverride || resolveSigningSecret();
  if (!secret) {
    throw new Error('Thiếu khóa bí mật để ký đường dẫn tệp đính kèm.');
  }
  return crypto
    .createHmac('sha256', secret)
    .update(`${objectName}:${exp}`, 'utf8')
    .digest('hex');
}

/**
 * Gắn chữ ký HMAC ngắn hạn (?exp=...&sig=...) vào đường dẫn tệp đính kèm /api/upload/files/<objectName>.
 * Giữ nguyên nếu là URL bên ngoài hoặc null.
 */
export function signAttachmentUrl(
  url: string | null | undefined,
  options?: { ttlSeconds?: number; nowSeconds?: number; secret?: string }
): string | null {
  if (!url) return null;
  const objectName = extractAttachmentObjectName(url);
  if (!objectName) {
    return url;
  }

  const rawTtl =
    options?.ttlSeconds ?? config.security.attachmentSignedUrlTtlSeconds;
  const ttlSeconds =
    Number.isFinite(rawTtl) && rawTtl > 0
      ? Math.floor(rawTtl)
      : DEFAULT_SIGNED_URL_TTL_SECONDS;
  const nowSeconds = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  const exp = nowSeconds + ttlSeconds;
  const sig = computeAttachmentSignature(objectName, exp, options?.secret);

  return `${ATTACHMENT_PREFIX}${objectName}?exp=${exp}&sig=${sig}`;
}

/**
 * Xác minh chữ ký HMAC ngắn hạn (constant-time) và hạn dùng cho GET /api/upload/files/:objectName.
 */
export function verifyAttachmentSignature(
  objectName: string,
  expRaw: unknown,
  sigRaw: unknown,
  options?: { nowSeconds?: number; secret?: string }
): boolean {
  if (!objectName || !/^[a-zA-Z0-9._-]+$/.test(objectName)) {
    return false;
  }
  if (typeof sigRaw !== 'string' || !/^[a-f0-9]{64}$/i.test(sigRaw)) {
    return false;
  }
  const exp = Number(expRaw);
  if (!Number.isInteger(exp) || exp <= 0) {
    return false;
  }

  const nowSeconds = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (exp < nowSeconds) {
    return false;
  }

  let expectedSig: string;
  try {
    expectedSig = computeAttachmentSignature(
      objectName,
      exp,
      options?.secret
    );
  } catch {
    return false;
  }
  const providedBuf = Buffer.from(sigRaw.toLowerCase(), 'utf8');
  const expectedBuf = Buffer.from(expectedSig.toLowerCase(), 'utf8');
  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}
