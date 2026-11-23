import crypto from 'crypto';
import {
  AuditAction,
  AuditIntegrityResult,
  RequestStatus,
} from '../types/request.js';

export const AUDIT_GENESIS_HASH = 'GENESIS';

export interface AuditHashPayload {
  prevHash: string;
  requestId: string;
  actor: string;
  action: AuditAction | string;
  toStatus?: RequestStatus | string | null;
  note?: string | null;
  createdAt: Date | string;
}

/**
 * Chuẩn hóa timestamp theo giây UTC (epoch seconds) để bất biến giữa PostgreSQL TIMESTAMP và JS Date.
 */
export function toCanonicalAuditTimestamp(createdAt: Date | string): string {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return '0';
  }
  return String(Math.floor(date.getTime() / 1000));
}

/**
 * Tính mã băm SHA-256 liên kết sổ cái bất biến:
 * SHA-256(prev_hash | request_id | actor | action | to_status | note | epoch_sec)
 */
export function computeAuditEntryHash(payload: AuditHashPayload): string {
  const raw = [
    payload.prevHash || AUDIT_GENESIS_HASH,
    payload.requestId,
    payload.actor,
    payload.action,
    payload.toStatus ?? '',
    payload.note ?? '',
    toCanonicalAuditTimestamp(payload.createdAt),
  ].join('|');

  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

export interface VerifiableAuditEntry {
  id?: string;
  request_id: string;
  actor: string;
  action: AuditAction | string;
  to_status: RequestStatus | string | null;
  note: string | null;
  created_at: Date | string;
  prev_hash?: string | null;
  entry_hash?: string | null;
}

/**
 * Xác minh toàn bộ chuỗi băm SHA-256 của nhật ký kiểm toán thuộc 1 yêu cầu.
 * Phát hiện ngay lập tức nếu có bất kỳ bản ghi nào bị sửa nội dung, xóa giữa chừng hoặc giả mạo hash.
 */
export function verifyAuditChain(entries: VerifiableAuditEntry[]): AuditIntegrityResult {
  if (entries.length === 0) {
    return {
      valid: true,
      checked_entries: 0,
      latest_hash: null,
    };
  }

  let expectedPrevHash = AUDIT_GENESIS_HASH;

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    if (!entry.entry_hash || !entry.prev_hash) {
      return {
        valid: false,
        checked_entries: index,
        latest_hash: expectedPrevHash === AUDIT_GENESIS_HASH ? null : expectedPrevHash,
        reason: `Bản ghi kiểm toán thứ ${index + 1} chưa được niêm phong chữ ký SHA-256.`,
      };
    }

    if (entry.prev_hash !== expectedPrevHash) {
      return {
        valid: false,
        checked_entries: index,
        latest_hash: expectedPrevHash === AUDIT_GENESIS_HASH ? null : expectedPrevHash,
        reason: `Đứt gãy liên kết prev_hash tại bản ghi thứ ${index + 1}.`,
      };
    }

    const expectedEntryHash = computeAuditEntryHash({
      prevHash: entry.prev_hash,
      requestId: entry.request_id,
      actor: entry.actor,
      action: entry.action,
      toStatus: entry.to_status,
      note: entry.note,
      createdAt: entry.created_at,
    });

    if (entry.entry_hash !== expectedEntryHash) {
      return {
        valid: false,
        checked_entries: index,
        latest_hash: expectedPrevHash === AUDIT_GENESIS_HASH ? null : expectedPrevHash,
        reason: `Phát hiện dữ liệu bị chỉnh sửa trái phép tại bản ghi thứ ${index + 1} (sai lệch SHA-256).`,
      };
    }

    expectedPrevHash = entry.entry_hash;
  }

  return {
    valid: true,
    checked_entries: entries.length,
    latest_hash: expectedPrevHash,
  };
}
