// SPDX-License-Identifier: Apache-2.0
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/**
 * Xác định URL dịch vụ theo ngữ cảnh chạy thực tế:
 * - Trên localhost / 127.0.0.1: dùng envVal (nếu khác 'auto') hoặc localFallbackUrl (tương thích dev :8000).
 * - Trên domain công cộng / HTTPS tunnel / LAN IP: tự động chuyển sang Same-Origin để chạy trọn vẹn qua reverse proxy.
 */
export function resolveServiceUrl(
  envVal: string | undefined,
  defaultPath: string,
  localFallbackUrl: string
): string {
  if (typeof window !== 'undefined' && !LOCAL_HOSTS.has(window.location.hostname)) {
    const normalizedPath = defaultPath.startsWith('/') ? defaultPath : `/${defaultPath}`;
    return `${window.location.origin}${normalizedPath}`;
  }

  const trimmed = envVal?.trim();
  if (!trimmed || trimmed.toLowerCase() === 'auto') {
    return localFallbackUrl;
  }
  return trimmed;
}
