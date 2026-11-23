// SPDX-License-Identifier: Apache-2.0
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { verifyAuditChain } from '../src/utils/audit-hash-chain.js';
import {
  buildSeedAuditChainForRequest,
  DbQueryFn,
  loadSeedDataset,
  seedDemoData,
  seedDemoDataIfEmpty,
} from '../src/utils/seed-demo-data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_SEED_JSON = path.resolve(
  __dirname,
  '../../../config/seed/demo-data.json'
);

const EXPECTED_KEYCLOAK_DEPARTMENTS = [
  'CTSV',
  'KETOAN',
  'Phòng Quản trị Thiết bị',
  'Phòng khoa học và QLSV',
  'Chăm sóc sắc đẹp',
] as const;

describe('Seed Demo Data (External JSON) - Tính toàn vẹn SHA-256 & Idempotency', () => {
  it('đọc tệp dữ liệu ngoài config/seed/demo-data.json phủ đủ 15 danh mục cho 5 nhóm phòng ban thật', () => {
    const { filePath, dataset } = loadSeedDataset(DEFAULT_SEED_JSON);
    expect(filePath).toBe(DEFAULT_SEED_JSON);
    expect(dataset.categories.length).toBeGreaterThanOrEqual(12);
    expect(dataset.categories.length).toBeLessThanOrEqual(15);

    const seededDepts = new Set(dataset.categories.map((c) => c.department));
    for (const dept of EXPECTED_KEYCLOAK_DEPARTMENTS) {
      expect(seededDepts.has(dept)).toBe(true);
    }

    const uniqueCodes = new Set(dataset.categories.map((c) => c.code));
    expect(uniqueCodes.size).toBe(dataset.categories.length);
  });

  it('gồm 16-20 yêu cầu rải đều 7 ngày gần nhất, đủ trạng thái và có >= 2 đơn PENDING quá hạn SLA', () => {
    const { dataset } = loadSeedDataset(DEFAULT_SEED_JSON);
    expect(dataset.requests.length).toBeGreaterThanOrEqual(16);
    expect(dataset.requests.length).toBeLessThanOrEqual(20);

    const statuses = new Set(dataset.requests.map((r) => r.status));
    expect(statuses).toEqual(new Set(['PENDING', 'APPROVED', 'REJECTED']));

    const creators = new Set(dataset.requests.map((r) => r.created_by));
    expect(creators).toEqual(new Set(['sinhvien', 'sinhvien2']));

    const requestDepts = new Set(dataset.requests.map((r) => r.target_department));
    for (const dept of EXPECTED_KEYCLOAK_DEPARTMENTS) {
      expect(requestDepts.has(dept)).toBe(true);
    }

    const distinctDayBuckets = new Set(
      dataset.requests.map((r) => Math.floor(r.hoursAgo / 24))
    );
    expect(distinctDayBuckets.size).toBeGreaterThanOrEqual(7);

    const overduePending = dataset.requests.filter((r) => {
      if (r.status !== 'PENDING') return false;
      if (r.priority === 'URGENT') return r.hoursAgo > 2;
      if (r.priority === 'HIGH') return r.hoursAgo > 8;
      return r.hoursAgo > 24;
    });
    expect(overduePending.length).toBeGreaterThanOrEqual(2);
  });

  it('tính động chuỗi băm SHA-256 hợp lệ 100% cho toàn bộ yêu cầu mẫu (verifyAuditChain.valid = true)', () => {
    const { dataset } = loadSeedDataset(DEFAULT_SEED_JSON);
    const baseNow = new Date('2026-11-23T10:00:00.000Z');
    const categoryNameMap = new Map(dataset.categories.map((c) => [c.code, c.name]));

    for (let i = 0; i < dataset.requests.length; i++) {
      const spec = dataset.requests[i];
      const { auditRows } = buildSeedAuditChainForRequest(
        spec,
        i,
        categoryNameMap.get(spec.category) || spec.category,
        baseNow
      );

      expect(auditRows.length).toBeGreaterThanOrEqual(2);
      const integrity = verifyAuditChain(auditRows);
      expect(
        integrity.valid,
        `Audit chain không hợp lệ cho ${spec.id}: ${integrity.reason}`
      ).toBe(true);
      expect(integrity.checked_entries).toBe(auditRows.length);
      expect(integrity.latest_hash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('seedDemoData() chạy idempotent: lần 1 chèn đủ bản ghi, lần 2 không chèn trùng', async () => {
    const { dataset } = loadSeedDataset(DEFAULT_SEED_JSON);
    const insertedCategories = new Set<string>();
    const insertedRequests = new Set<string>();
    const insertedAudits = new Set<string>();
    const insertedComments = new Set<string>();
    const insertedNotis = new Set<string>();

    const mockDbQuery: DbQueryFn = async (sql, params = []) => {
      const idOrCode = String(params[0] ?? '');
      if (sql.includes('INSERT INTO request_categories')) {
        if (insertedCategories.has(idOrCode)) return { rows: [] };
        insertedCategories.add(idOrCode);
        return { rows: [{ code: idOrCode }] };
      }
      if (sql.includes('INSERT INTO requests')) {
        if (insertedRequests.has(idOrCode)) return { rows: [] };
        insertedRequests.add(idOrCode);
        return { rows: [{ id: idOrCode }] };
      }
      if (sql.includes('INSERT INTO request_audit_logs')) {
        if (insertedAudits.has(idOrCode)) return { rows: [] };
        insertedAudits.add(idOrCode);
        return { rows: [{ id: idOrCode }] };
      }
      if (sql.includes('INSERT INTO request_comments')) {
        if (insertedComments.has(idOrCode)) return { rows: [] };
        insertedComments.add(idOrCode);
        return { rows: [{ id: idOrCode }] };
      }
      if (sql.includes('INSERT INTO notifications')) {
        if (insertedNotis.has(idOrCode)) return { rows: [] };
        insertedNotis.add(idOrCode);
        return { rows: [{ id: idOrCode }] };
      }
      return { rows: [] };
    };

    const first = await seedDemoData(mockDbQuery, {
      baseNow: new Date('2026-11-23T10:00:00.000Z'),
      dataFile: DEFAULT_SEED_JSON,
    });
    expect(first.skipped).toBe(false);
    expect(first.dataFile).toBe(DEFAULT_SEED_JSON);
    expect(first.categoriesInserted).toBe(dataset.categories.length);
    expect(first.requestsInserted).toBe(dataset.requests.length);
    expect(first.commentsInserted).toBe(dataset.comments.length);
    expect(first.notificationsInserted).toBe(dataset.notifications.length);
    expect(first.auditLogsInserted).toBeGreaterThan(dataset.requests.length * 2);

    const second = await seedDemoData(mockDbQuery, {
      baseNow: new Date('2026-11-24T10:00:00.000Z'),
      dataFile: DEFAULT_SEED_JSON,
    });
    expect(second.categoriesInserted).toBe(0);
    expect(second.requestsInserted).toBe(0);
    expect(second.auditLogsInserted).toBe(0);
    expect(second.commentsInserted).toBe(0);
    expect(second.notificationsInserted).toBe(0);
  });

  it('seedDemoDataIfEmpty() bỏ qua khi SEED_DEMO_DATA=false hoặc DB đã có dữ liệu và báo lỗi rõ nếu tệp seed sai', async () => {
    let queryCalls = 0;
    const nonEmptyDb: DbQueryFn = async () => {
      queryCalls += 1;
      return { rows: [{ category_count: 5, request_count: 2 }] };
    };

    const disabledRes = await seedDemoDataIfEmpty(nonEmptyDb, { enabled: false });
    expect(disabledRes.skipped).toBe(true);
    expect(queryCalls).toBe(0);

    const nonEmptyRes = await seedDemoDataIfEmpty(nonEmptyDb, { enabled: true });
    expect(nonEmptyRes.skipped).toBe(true);
    expect(queryCalls).toBe(1);

    expect(() =>
      loadSeedDataset('/nonexistent/path/seed-does-not-exist.json')
    ).toThrow();
  });
});
