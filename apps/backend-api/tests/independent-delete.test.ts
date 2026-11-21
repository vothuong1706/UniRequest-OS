import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();

vi.mock('../src/config/database.js', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  pool: { connect: vi.fn(), end: vi.fn() },
  checkDatabaseConnection: vi.fn(),
  ensureTablesExist: vi.fn(),
}));

import { requestService } from '../src/services/request-service.js';

describe('Two-Sided Independent Soft Delete (deleteRequests)', () => {
  const reqId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('người gửi xóa ở history chỉ bật hidden_by_sender = TRUE, giữ nguyên phía người nhận', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: reqId,
            created_by: 'sv01',
            target_department: 'KETOAN',
            hidden_by_sender: false,
            hidden_by_receiver: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: reqId, created_by: 'sv01', target_department: 'KETOAN' }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await requestService.deleteRequests(
      [reqId],
      { preferred_username: 'sv01', roles: ['sinhvien'], groups: [] },
      'history'
    );

    expect(result.forbidden).toBe(false);
    expect(result.side).toBe('sender');
    expect(result.deleted).toHaveLength(1);
    expect(mockQuery).toHaveBeenCalledTimes(3);
    expect(String(mockQuery.mock.calls[1][0])).toContain('SET hidden_by_sender = TRUE');
    expect(String(mockQuery.mock.calls[2][0])).toContain(
      'hidden_by_sender = TRUE\n         AND hidden_by_receiver = TRUE'
    );
  });

  it('người nhận xóa ở manage chỉ bật hidden_by_receiver = TRUE, giữ nguyên phía người gửi', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: reqId,
            created_by: 'sv01',
            target_department: 'KETOAN',
            hidden_by_sender: false,
            hidden_by_receiver: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: reqId, created_by: 'sv01', target_department: 'KETOAN' }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await requestService.deleteRequests(
      [reqId],
      { preferred_username: 'cb_ketoan', roles: ['canbo'], groups: ['KETOAN'] },
      'manage'
    );

    expect(result.forbidden).toBe(false);
    expect(result.side).toBe('receiver');
    expect(result.deleted).toHaveLength(1);
    expect(String(mockQuery.mock.calls[1][0])).toContain('SET hidden_by_receiver = TRUE');
  });

  it('chặn cán bộ ban khác xóa yêu cầu không thuộc phòng ban mình', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: reqId,
          created_by: 'sv01',
          target_department: 'CTSV',
          hidden_by_sender: false,
          hidden_by_receiver: false,
        },
      ],
    });

    const result = await requestService.deleteRequests(
      [reqId],
      { preferred_username: 'cb_ketoan', roles: ['canbo'], groups: ['KETOAN'] },
      'manage'
    );

    expect(result).toEqual({ deleted: [], side: 'receiver', forbidden: true });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('chặn sinh viên xóa yêu cầu của sinh viên khác', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: reqId,
          created_by: 'sv_other',
          target_department: 'KETOAN',
          hidden_by_sender: false,
          hidden_by_receiver: false,
        },
      ],
    });

    const result = await requestService.deleteRequests(
      [reqId],
      { preferred_username: 'sv01', roles: ['sinhvien'], groups: [] },
      'history'
    );

    expect(result).toEqual({ deleted: [], side: 'sender', forbidden: true });
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});
