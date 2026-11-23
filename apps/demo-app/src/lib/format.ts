// Múi giờ chuẩn Đông Dương (+07:00 - Hà Nội / Bangkok / TP.HCM)
export const APP_TIMEZONE = 'Asia/Ho_Chi_Minh';

export function formatDateTime(value?: string | null): string {
  if (!value) return ' - ';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return ' - ';
  return parsed.toLocaleString('vi-VN', {
    timeZone: APP_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function getDateKeyInAppTimezone(value: Date | string = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function isSameDayInAppTimezone(
  value: string | Date,
  reference: Date = new Date()
): boolean {
  const targetKey = getDateKeyInAppTimezone(value);
  const refKey = getDateKeyInAppTimezone(reference);
  return Boolean(targetKey) && targetKey === refKey;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function isImageUrl(url?: string | null): boolean {
  if (!url) return false;
  return /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(url);
}

/**
 * Chuẩn hóa URL tệp đính kèm để hoạt động cả trên localhost lẫn domain HTTPS Internet
 * (chuyển đổi cả đường dẫn cũ http://localhost:9000/unirequest-files/... sang /api/upload/files/...).
 */
function resolveApiOrigin(apiBaseUrl: string): string {
  try {
    return new URL(apiBaseUrl).origin;
  } catch {
    return typeof window !== 'undefined' ? window.location.origin : '';
  }
}

export function resolveAttachmentUrl(
  url: string | null | undefined,
  apiBaseUrl: string
): string | null {
  if (!url) return null;

  const apiOrigin = resolveApiOrigin(apiBaseUrl);

  if (url.startsWith('/api/')) {
    return `${apiOrigin}${url}`;
  }

  const legacyMinioMatch = url.match(
    /^https?:\/\/(?:localhost|127\.0\.0\.1|minio):9000\/[^/]+\/(.+)$/i
  );
  if (legacyMinioMatch?.[1]) {
    return `${apiOrigin}/api/upload/files/${legacyMinioMatch[1]}`;
  }

  return url;
}
