import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..');
const deletedLegacyTables = [
  'ad_snapshots',
  'traffic_stats',
  'item_winners',
  ' ads ',
];

function runDevData(args: string[]) {
  return execFileSync(join(repoRoot, 'node_modules/.bin/tsx'), ['scripts/dev-data.ts', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

describe('legacy market-data migration entrypoints', () => {
  it('does not expose migration or seed commands/scripts for deleted market-data tables', () => {
    const packageJson = JSON.parse(
      readFileSync(join(repoRoot, 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts).not.toHaveProperty('migrate:dashboard');
    expect(packageJson.scripts).not.toHaveProperty('seed:channel-market-data');
    expect(existsSync(join(repoRoot, 'scripts/seed-channel-market-data.ts'))).toBe(false);
    expect(existsSync(join(repoRoot, 'scripts/coupang-dev-data.ts'))).toBe(false);
    expect(existsSync(join(repoRoot, 'scripts/wing-product-scrape.sh'))).toBe(false);
    expect(existsSync(join(repoRoot, 'scripts/import-returns.ts'))).toBe(false);
    expect(packageJson.scripts).toMatchObject({
      'data:dev:pull': 'tsx scripts/dev-data.ts pull',
      'data:dev:pack': 'tsx scripts/dev-data.ts pack',
      'data:dev:publish': 'tsx scripts/dev-data.ts publish',
      'data:dev:export': 'tsx scripts/dev-data.ts export',
      'data:dev:sanitize': 'tsx scripts/dev-data.ts sanitize',
      'data:dev:replay': 'tsx scripts/dev-data.ts replay',
    });
    expect(Object.keys(packageJson.scripts ?? {}).filter((name) => name.startsWith('data:coupang:'))).toEqual([]);

    for (const relativePath of [
      'scripts/migrate-dashboard-data.ts',
      'scripts/migrate-ad-data.ts',
    ]) {
      const absolutePath = join(repoRoot, relativePath);
      if (!existsSync(absolutePath)) continue;
      const contents = ` ${readFileSync(absolutePath, 'utf8')} `;
      for (const table of deletedLegacyTables) {
        expect(contents).not.toContain(table);
      }
    }
  });

  it('does not retain one-off backfill or legacy migration helpers', () => {
    const prismaFiles = readdirSync(join(repoRoot, 'prisma'));
    expect(prismaFiles.filter((name) => name.startsWith('backfill-'))).toEqual([]);
    expect(prismaFiles.filter((name) => name.startsWith('rollback-status-canonical'))).toEqual([]);

    for (const relativePath of [
      'scripts/init-agent-reader.sql',
      'scripts/migrate-agent-prompts.sql',
      'scripts/migrate-files-to-minio.ts',
      'scripts/seed-manager-agent.sql',
      'scripts/sidebar-route-audit.mjs',
      'scripts/split-prisma-schema.py',
      'scripts/sync-agent-definitions.sql',
    ]) {
      expect(existsSync(join(repoRoot, relativePath))).toBe(false);
    }
  });
});

describe('dev data coupang domain adapter', () => {
  it('exports scraper payloads and replays them in dry-run mode', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'kiditem-coupang-adapter-'));
    const payloadDir = join(tempRoot, 'payloads');
    const dataRoot = join(tempRoot, 'data');
    const payloadFile = join(payloadDir, 'wing-traffic.json');
    const datasetId = '2026-04-28-real-v1';

    mkdirSync(payloadDir, { recursive: true });
    writeFileSync(payloadFile, JSON.stringify({
      type: 'traffic',
      source: 'wing',
      data: [{ businessDate: '2026-04-28', visitors: 7 }],
    }));

    const exportOutput = JSON.parse(runDevData([
      'export',
      '--domain', 'coupang',
      '--dataset', datasetId,
      '--lane', 'real',
      '--payload', payloadFile,
      '--from', '2026-04-28',
      '--to', '2026-04-28',
      '--data-root', dataRoot,
    ])) as { exported: string; payloadCount: number };

    expect(exportOutput).toMatchObject({ exported: datasetId, payloadCount: 1 });

    const dryRun = JSON.parse(runDevData([
      'replay',
      '--domain', 'coupang',
      '--dataset', datasetId,
      '--data-root', dataRoot,
      '--dry-run',
    ])) as { datasetId: string; mode: string; payloads: number; sources: string[] };

    expect(dryRun).toMatchObject({
      datasetId,
      mode: 'scoped-replace',
      payloads: 1,
    });
    expect(dryRun.sources).toContain('wing');
  });
});
