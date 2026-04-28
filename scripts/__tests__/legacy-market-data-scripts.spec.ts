import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repoRoot = join(__dirname, '..', '..');
const deletedLegacyTables = [
  'ad_snapshots',
  'traffic_stats',
  'item_winners',
  ' ads ',
];

function runCoupangData(args: string[]) {
  return execFileSync(join(repoRoot, 'node_modules/.bin/tsx'), ['scripts/coupang-dev-data.ts', ...args], {
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
    expect(packageJson.scripts).toHaveProperty('data:coupang:replay');
    expect(packageJson.scripts).toHaveProperty('data:coupang:pack');
    expect(packageJson.scripts).toHaveProperty('data:coupang:publish');

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
});

describe('coupang dev data bundle packaging', () => {
  it('publishes a standard zip filename and latest manifest that pull can replay', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'kiditem-dev-data-'));
    const payloadDir = join(tempRoot, 'payloads');
    const producerRoot = join(tempRoot, 'producer');
    const consumerRoot = join(tempRoot, 'consumer');
    const driveRoot = join(tempRoot, 'drive');
    const payloadFile = join(payloadDir, 'wing-traffic.json');
    const datasetId = '2026-04-28-real-v1';
    const archiveFileName = 'kiditem-coupang-real-2026-04-28-real-v1.zip';

    mkdirSync(payloadDir, { recursive: true });
    writeFileSync(payloadFile, JSON.stringify({
      type: 'traffic',
      source: 'wing',
      data: [{ businessDate: '2026-04-28', visitors: 7 }],
    }));

    runCoupangData([
      'export',
      '--dataset', datasetId,
      '--lane', 'real',
      '--payload', payloadFile,
      '--from', '2026-04-28',
      '--to', '2026-04-28',
      '--data-root', producerRoot,
    ]);

    const packOutput = JSON.parse(runCoupangData([
      'pack',
      '--dataset', datasetId,
      '--data-root', producerRoot,
    ])) as { archiveFileName: string; archivePath: string; sha256: string };

    expect(packOutput.archiveFileName).toBe(archiveFileName);
    expect(existsSync(packOutput.archivePath)).toBe(true);
    expect(packOutput.sha256).toMatch(/^[a-f0-9]{64}$/);

    runCoupangData([
      'publish',
      '--dataset', datasetId,
      '--data-root', producerRoot,
      '--drive-root', driveRoot,
    ]);

    const latestJsonPath = join(driveRoot, 'coupang-real', 'latest.json');
    const latestJson = JSON.parse(await readFile(latestJsonPath, 'utf8')) as {
      datasetId: string;
      archiveFileName: string;
      archivePath: string;
      sha256: string;
    };

    expect(latestJson).toMatchObject({
      datasetId,
      archiveFileName,
      archivePath: `bundles/${archiveFileName}`,
      sha256: packOutput.sha256,
    });
    expect(readFileSync(join(driveRoot, 'coupang-real', 'latest.txt'), 'utf8').trim()).toBe(datasetId);
    expect(existsSync(join(driveRoot, 'coupang-real', 'bundles', archiveFileName))).toBe(true);
    expect(readFileSync(join(driveRoot, 'coupang-real', 'bundles', `${archiveFileName}.sha256`), 'utf8'))
      .toContain(packOutput.sha256);

    runCoupangData([
      'pull',
      '--lane', 'real',
      '--drive-root', driveRoot,
      '--data-root', consumerRoot,
    ]);

    const dryRun = JSON.parse(runCoupangData([
      'replay',
      '--data-root', consumerRoot,
      '--dry-run',
    ])) as { datasetId: string; mode: string; payloads: number; sources: string[] };

    expect(dryRun).toMatchObject({
      datasetId,
      mode: 'scoped-replace',
      payloads: 1,
    });
    expect(dryRun.sources).toContain('wing');
  }, 30000);
});
