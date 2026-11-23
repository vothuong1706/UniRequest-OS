// SPDX-License-Identifier: Apache-2.0
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');

function collectFilesRecursively(dir: string, exts: string[]): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      results.push(...collectFilesRecursively(fullPath, exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('SDLC Compliance & Open-Source Repository Hygiene Audit', () => {
  it('[Pháp lý FOSS] LICENSE chuẩn Apache-2.0, NOTICE, CHANGELOG, CONTRIBUTING, SECURITY và đồng bộ phiên bản 1.0.0', () => {
    const licenseText = fs.readFileSync(path.join(REPO_ROOT, 'LICENSE'), 'utf-8');
    expect(licenseText).toContain('Apache License');
    expect(licenseText).toContain('Version 2.0, January 2004');

    const noticeText = fs.readFileSync(path.join(REPO_ROOT, 'NOTICE'), 'utf-8');
    expect(noticeText).toContain('Apache License, Version 2.0');
    expect(noticeText).toContain('AGPL-3.0-or-later');

    for (const ossFile of ['CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md']) {
      const fullPath = path.join(REPO_ROOT, ossFile);
      expect(fs.existsSync(fullPath), `Thiếu tệp OSS chuẩn ${ossFile}`).toBe(true);
      expect(fs.readFileSync(fullPath, 'utf-8').trim().length).toBeGreaterThan(100);
    }

    const backendPkg = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, 'apps/backend-api/package.json'), 'utf-8')
    ) as { version?: string };
    const frontendPkg = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, 'apps/demo-app/package.json'), 'utf-8')
    ) as { version?: string };
    expect(backendPkg.version).toBe('1.0.0');
    expect(frontendPkg.version).toBe('1.0.0');
  });

  it('[SPDX Header] 100% tệp mã nguồn .ts/.tsx của nhóm có dòng đầu // SPDX-License-Identifier: Apache-2.0', () => {
    const targetDirs = [
      path.join(REPO_ROOT, 'apps/backend-api/src'),
      path.join(REPO_ROOT, 'apps/backend-api/tests'),
      path.join(REPO_ROOT, 'apps/demo-app/src'),
    ];
    const sourceFiles = targetDirs.flatMap((dir) =>
      collectFilesRecursively(dir, ['.ts', '.tsx'])
    );
    expect(sourceFiles.length).toBeGreaterThan(50);

    const missingSpdx: string[] = [];
    for (const filePath of sourceFiles) {
      const firstLine = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/, 1)[0];
      if (firstLine !== '// SPDX-License-Identifier: Apache-2.0') {
        missingSpdx.push(path.relative(REPO_ROOT, filePath));
      }
    }
    expect(missingSpdx, `Các tệp thiếu SPDX header: ${missingSpdx.join(', ')}`).toEqual(
      []
    );
  });

  it('[Tài liệu & Liên kết Markdown] toàn bộ liên kết tương đối trong README.md và docs/**/*.md đều trỏ tới tệp tồn tại', () => {
    const mdFiles = [
      path.join(REPO_ROOT, 'README.md'),
      ...collectFilesRecursively(path.join(REPO_ROOT, 'docs'), ['.md']),
    ];

    const brokenLinks: string[] = [];
    const linkRegex = /!?\[[^\]]*\]\(([^)]+)\)/g;

    for (const mdPath of mdFiles) {
      const raw = fs.readFileSync(mdPath, 'utf-8');
      const stripped = raw.replace(/```[\s\S]*?```/g, '');
      let match: RegExpExecArray | null;
      while ((match = linkRegex.exec(stripped)) !== null) {
        const href = match[1].trim().split(/\s+/)[0];
        if (
          !href ||
          href.startsWith('http://') ||
          href.startsWith('https://') ||
          href.startsWith('mailto:') ||
          href.startsWith('#')
        ) {
          continue;
        }
        const targetRel = decodeURIComponent(href.split('#')[0]);
        if (!targetRel) continue;
        const resolved = path.resolve(path.dirname(mdPath), targetRel);
        if (!fs.existsSync(resolved)) {
          brokenLinks.push(
            `${path.relative(REPO_ROOT, mdPath)} -> ${href}`
          );
        }
      }
    }

    expect(brokenLinks, `Liên kết Markdown bị gãy: ${brokenLinks.join('; ')}`).toEqual(
      []
    );
  });

  it('[Tầng 1 & 2 - Định danh SSO] realm-export.json hợp lệ, bật PKCE S256, giữ đủ nhóm phòng ban và không mở rộng https://*', () => {
    const realmPath = path.join(REPO_ROOT, 'config/keycloak/realm-export.json');
    const raw = fs.readFileSync(realmPath, 'utf-8');
    const parsed = JSON.parse(raw) as {
      realm?: string;
      roles?: { realm?: Array<{ name?: string }> };
      groups?: Array<{ name?: string; subGroups?: Array<{ name?: string }> }>;
      clients?: Array<{
        clientId?: string;
        redirectUris?: string[];
        attributes?: Record<string, string>;
      }>;
      users?: Array<{ username?: string }>;
    };

    expect(parsed.realm).toBe('unirequest');

    const portalClient = parsed.clients?.find(
      (c) => c.clientId === 'unirequest-portal'
    );
    expect(portalClient).toBeDefined();
    expect(portalClient?.attributes?.['pkce.code.challenge.method']).toBe('S256');
    expect(portalClient?.redirectUris).not.toContain('https://*');

    const groupNames = (parsed.groups || []).map((g) => g.name);
    expect(groupNames).toEqual(
      expect.arrayContaining([
        'CTSV',
        'KETOAN',
        'Chăm sóc sắc đẹp',
        'Phòng Quản trị Thiết bị',
        'Phòng khoa học và QLSV',
        'Lớp',
      ])
    );

    const roleNames = (parsed.roles?.realm || []).map((r) => r.name);
    expect(roleNames).toEqual(
      expect.arrayContaining(['sinhvien', 'canbo', 'giangvien'])
    );

    const usernames = (parsed.users || []).map((u) => u.username);
    expect(usernames).toEqual(
      expect.arrayContaining(['sinhvien', 'sinhvien2', 'canbo', 'giangvien'])
    );
  });

  it('[Tầng 2 - Điều phối Kestra GitOps] đủ 3 workflow YAML dưới namespace unirequest.dxos và không hardcode webhook key', () => {
    const flowsDir = path.join(REPO_ROOT, 'config/kestra/flows');
    const expectedFlows = [
      {
        file: 'unirequest-lifecycle.yml',
        id: 'unirequest-lifecycle',
        marker: 'io.kestra.plugin.core.trigger.Webhook',
      },
      {
        file: 'unirequest-sla-watchdog.yml',
        id: 'unirequest-sla-watchdog',
        marker: '*/15 * * * *',
      },
      {
        file: 'unirequest-daily-report.yml',
        id: 'unirequest-daily-report',
        marker: '30 17 * * *',
      },
    ];

    for (const flow of expectedFlows) {
      const flowPath = path.join(flowsDir, flow.file);
      expect(fs.existsSync(flowPath), `Thiếu workflow ${flow.file}`).toBe(true);
      const content = fs.readFileSync(flowPath, 'utf-8');
      expect(content).toContain(`id: ${flow.id}`);
      expect(content).toContain('namespace: unirequest.dxos');
      expect(content).toContain(flow.marker);
    }

    const lifecycleYaml = fs.readFileSync(
      path.join(flowsDir, 'unirequest-lifecycle.yml'),
      'utf-8'
    );
    expect(lifecycleYaml).toContain('{{ envs.webhook_key }}');
  });

  it('[Tầng 2 - Lược đồ CSDL] init.sql định nghĩa đủ 7 bảng, cờ xóa 2 phía và chuỗi băm SHA-256', () => {
    const initSqlPath = path.join(
      REPO_ROOT,
      'apps/backend-api/db/init.sql'
    );
    const sql = fs.readFileSync(initSqlPath, 'utf-8');

    const requiredTables = [
      'requests',
      'request_audit_logs',
      'request_categories',
      'request_comments',
      'notifications',
      'notification_reads',
      'push_subscriptions',
    ];

    for (const table of requiredTables) {
      expect(
        sql.includes(`CREATE TABLE IF NOT EXISTS ${table}`),
        `Thiếu định nghĩa bảng ${table} trong init.sql`
      ).toBe(true);
    }

    expect(sql).toContain('hidden_by_sender');
    expect(sql).toContain('hidden_by_receiver');
    expect(sql).toContain('prev_hash');
    expect(sql).toContain('entry_hash');
  });

  it('[Tầng 3 - Zero-Hardcode & Đồng bộ Cấu hình] đồng bộ biến môi trường giữa .env.example, docker-compose.yml và environment.ts', () => {
    const envExample = fs.readFileSync(
      path.join(REPO_ROOT, '.env.example'),
      'utf-8'
    );
    const composeYml = fs.readFileSync(
      path.join(REPO_ROOT, 'docker-compose.yml'),
      'utf-8'
    );
    const envTs = fs.readFileSync(
      path.join(REPO_ROOT, 'apps/backend-api/src/config/environment.ts'),
      'utf-8'
    );

    const requiredVars = [
      'POSTGRES_DB',
      'POSTGRES_USER',
      'POSTGRES_PASSWORD',
      'KC_ADMIN_USER',
      'KC_ADMIN_PASSWORD',
      'MINIO_ROOT_USER',
      'MINIO_ROOT_PASSWORD',
      'KESTRA_BASIC_AUTH_USER',
      'KESTRA_BASIC_AUTH_PASSWORD',
      'KESTRA_WEBHOOK_KEY',
      'VAPID_SUBJECT',
      'VAPID_PUBLIC_KEY',
      'VAPID_PRIVATE_KEY',
      'CORS_ALLOWED_ORIGINS',
      'ATTACHMENT_SIGNING_SECRET',
      'ATTACHMENT_SIGNED_URL_TTL_SECONDS',
      'SEED_DEMO_DATA',
      'SEED_DATA_FILE',
      'AI_ENABLED',
      'OLLAMA_URL',
      'OLLAMA_MODEL',
      'AI_TIMEOUT_MS',
    ];

    for (const key of requiredVars) {
      expect(
        envExample.includes(`${key}=`),
        `Thiếu biến ${key} trong .env.example`
      ).toBe(true);
      expect(
        composeYml.includes(key),
        `Thiếu truyền biến ${key} trong docker-compose.yml`
      ).toBe(true);
    }

    // Không hardcode dữ liệu mẫu hay bí mật trong mã nguồn
    const seedLoaderTs = fs.readFileSync(
      path.join(REPO_ROOT, 'apps/backend-api/src/utils/seed-demo-data.ts'),
      'utf-8'
    );
    expect(seedLoaderTs).not.toContain('SEED_REQUESTS');
    const seedJsonPath = path.join(REPO_ROOT, 'config/seed/demo-data.json');
    expect(fs.existsSync(seedJsonPath)).toBe(true);
    const seedParsed = JSON.parse(fs.readFileSync(seedJsonPath, 'utf-8')) as {
      categories?: unknown[];
      requests?: unknown[];
    };
    expect(Array.isArray(seedParsed.categories)).toBe(true);
    expect(Array.isArray(seedParsed.requests)).toBe(true);

    // Kiểm tra cấu trúc: không đặt giá trị bí mật mặc định không rỗng trong docker-compose.yml hay environment.ts
    expect(composeYml).not.toMatch(
      /(?:VAPID_PRIVATE_KEY|POSTGRES_PASSWORD|KC_ADMIN_PASSWORD|KONG_PG_PASSWORD|MINIO_ROOT_PASSWORD|KESTRA_BASIC_AUTH_PASSWORD|KESTRA_WEBHOOK_KEY|ATTACHMENT_SIGNING_SECRET):\s*["']?\$\{[^}]+:-[^}]+\}/
    );
    expect(envTs).not.toMatch(
      /process\.env\.(?:DB_PASSWORD|KC_ADMIN_PASSWORD|MINIO_SECRET_KEY|KESTRA_WEBHOOK_KEY|KESTRA_BASIC_AUTH_PASSWORD|VAPID_PRIVATE_KEY|ATTACHMENT_SIGNING_SECRET)\s*\|\|\s*['"][^'"]+['"]/
    );

    // Chặn /api/internal không phân biệt hoa/thường trên cả Nginx và Kong
    const nginxConf = fs.readFileSync(
      path.join(REPO_ROOT, 'apps/demo-app/nginx.conf'),
      'utf-8'
    );
    const kongSetup = fs.readFileSync(
      path.join(REPO_ROOT, 'kong-setup.sh'),
      'utf-8'
    );
    expect(nginxConf).toContain('location ~* ^/api/+internal(/|$)');
    expect(kongSetup).toContain('~/[aA][pP][iI]/+[iI][nN][tT][eE][rR][nN][aA][lL](/|$)');

    expect(composeYml).toContain('host.docker.internal:host-gateway');
    expect(composeYml).not.toContain('kestra/kestra:latest');
    expect(composeYml).not.toContain('kestra/kestra:nightly');
    expect(composeYml).not.toContain('pgsty/silo:latest');
    expect(envTs).toContain('process.env.AI_ENABLED');
    expect(envTs).toContain('process.env.OLLAMA_URL');
    expect(envTs).toContain('process.env.OLLAMA_MODEL');
    expect(envTs).toContain('process.env.AI_TIMEOUT_MS');
  });

  it('[Tầng 7 - Minh bạch Tài nguyên & Bàn giao] toàn bộ 12 ảnh chụp thực tế đều tồn tại và được đăng ký trong docs/images/README.md', () => {
    const screenshotsDir = path.join(REPO_ROOT, 'docs/images/screenshots');
    const imagesReadme = fs.readFileSync(
      path.join(REPO_ROOT, 'docs/images/README.md'),
      'utf-8'
    );

    const pngFiles = fs
      .readdirSync(screenshotsDir)
      .filter((f) => f.toLowerCase().endsWith('.png'));

    expect(pngFiles.length).toBeGreaterThanOrEqual(12);
    expect(pngFiles).toContain('TaoYeuCau.png');

    for (const fileName of pngFiles) {
      expect(
        imagesReadme.includes(`\`${fileName}\``),
        `Ảnh chụp thực tế ${fileName} chưa được đăng ký trong docs/images/README.md`
      ).toBe(true);
    }
  });
});
