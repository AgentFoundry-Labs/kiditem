import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const scannerPath = path.join(
  repoRoot,
  'scripts/check-raw-snapshot-read-models.sh',
);
const adapterPath = path.join(
  repoRoot,
  'apps/server/src/advertising/adapter/out/repository/ad-campaign.repository.adapter.ts',
);
const marker = 'raw-snapshot-status-count-ok';

test('allows named owners but rejects direct consumer and lookalike-owner reads', () => {
  const fixture = mkdtempSync(path.join(tmpdir(), 'snapshot-boundary-'));
  try {
    for (const dir of ['scripts', 'apps/server/src/advertising/adapter/out/repository', 'apps/web/src', 'packages/shared/src']) {
      mkdirSync(path.join(fixture, dir), { recursive: true });
    }
    copyFileSync(scannerPath, path.join(fixture, 'scripts/check-raw-snapshot-read-models.sh'));
    const scan = () => spawnSync('bash', ['scripts/check-raw-snapshot-read-models.sh'], { cwd: fixture, encoding: 'utf8' });
    const owner = 'apps/server/src/advertising/adapter/out/repository/wing-itemwinner-kpi-source.repository.ts';
    writeFileSync(path.join(fixture, owner), 'tx.channelScrapeSnapshot.findMany({});');
    assert.equal(scan().status, 0);
    for (const file of ['apps/web/src/screen.ts', 'apps/server/src/advertising/adapter/out/repository/lookalike-source.repository.ts']) {
      writeFileSync(path.join(fixture, file), 'tx.channelScrapeSnapshot.findFirst({});');
      const result = scan();
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.ok(result.stdout.includes(file));
      rmSync(path.join(fixture, file));
    }
    writeFileSync(path.join(fixture, 'packages/shared/src/read.ts'), 'SELECT * FROM channel_scrape_snapshots');
    assert.equal(scan().status, 1);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('does not retain the retired account-day KPI owner exception', () => {
  assert.ok(!readFileSync(scannerPath, 'utf8').includes('ad-account-daily-kpi-source'));
});

test('does not retain the deleted campaign sweep raw-snapshot exception', () => {
  const scanner = readFileSync(scannerPath, 'utf8');
  const adapter = readFileSync(adapterPath, 'utf8');
  const markerFiles = spawnSync(
    'rg',
    ['-l', '--fixed-strings', marker, 'apps/server/src'],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  assert.equal(markerFiles.status, 1, markerFiles.stderr);
  assert.equal(markerFiles.stdout, '');
  assert.ok(!scanner.includes(marker));
  assert.ok(!adapter.includes('queryLatestCompleteCampaignSweeps'));
});
