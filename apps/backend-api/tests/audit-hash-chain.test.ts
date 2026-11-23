import { describe, expect, it } from 'vitest';
import {
  AUDIT_GENESIS_HASH,
  computeAuditEntryHash,
  VerifiableAuditEntry,
  verifyAuditChain,
} from '../src/utils/audit-hash-chain.js';

function buildSignedChain(): VerifiableAuditEntry[] {
  const reqId = '11111111-1111-4111-8111-111111111111';
  const t1 = new Date('2026-11-23T05:00:00.000Z');
  const h1 = computeAuditEntryHash({
    prevHash: AUDIT_GENESIS_HASH,
    requestId: reqId,
    actor: 'sinhvien',
    action: 'CREATED',
    toStatus: 'PENDING',
    note: 'Tạo yêu cầu mới',
    createdAt: t1,
  });

  const t2 = new Date('2026-11-23T05:05:00.000Z');
  const h2 = computeAuditEntryHash({
    prevHash: h1,
    requestId: reqId,
    actor: 'canbo',
    action: 'APPROVED',
    toStatus: 'APPROVED',
    note: 'Đã phê duyệt hồ sơ',
    createdAt: t2,
  });

  return [
    {
      request_id: reqId,
      actor: 'sinhvien',
      action: 'CREATED',
      to_status: 'PENDING',
      note: 'Tạo yêu cầu mới',
      created_at: t1,
      prev_hash: AUDIT_GENESIS_HASH,
      entry_hash: h1,
    },
    {
      request_id: reqId,
      actor: 'canbo',
      action: 'APPROVED',
      to_status: 'APPROVED',
      note: 'Đã phê duyệt hồ sơ',
      created_at: t2,
      prev_hash: h1,
      entry_hash: h2,
    },
  ];
}

describe('SHA-256 Immutable Audit Ledger Verification', () => {
  it('xác nhận chuỗi sổ cái nguyên vẹn khi không có sửa đổi trái phép', () => {
    const chain = buildSignedChain();
    const res = verifyAuditChain(chain);

    expect(res.valid).toBe(true);
    expect(res.checked_entries).toBe(2);
    expect(res.latest_hash).toBe(chain[1].entry_hash);
  });

  it('phát hiện ngay lập tức khi nội dung note hoặc trạng thái bị sửa trực tiếp trong DB', () => {
    const chain = buildSignedChain();
    // Giả lập kẻ gian sửa note trực tiếp bằng SQL trong PostgreSQL
    chain[0].note = 'Đã chỉnh sửa nội dung trái phép';

    const res = verifyAuditChain(chain);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('chỉnh sửa trái phép');
  });

  it('phát hiện đứt gãy prev_hash nếu một bản ghi bị thay đổi liên kết', () => {
    const chain = buildSignedChain();
    chain[1].prev_hash = '0'.repeat(64);

    const res = verifyAuditChain(chain);
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('prev_hash');
  });
});
