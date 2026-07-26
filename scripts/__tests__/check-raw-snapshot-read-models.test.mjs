import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

test('allows only the reviewed campaign sweep status-count raw snapshot join', () => {
  const scanner = readFileSync(scannerPath, 'utf8');
  const adapter = readFileSync(adapterPath, 'utf8');
  const markerFiles = execFileSync(
    'rg',
    ['-l', '--fixed-strings', marker, 'apps/server/src'],
    { cwd: repoRoot, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean);

  assert.match(
    scanner,
    /rg -v --fixed-strings 'raw-snapshot-status-count-ok'/,
  );
  assert.deepEqual(markerFiles, [
    'apps/server/src/advertising/adapter/out/repository/ad-campaign.repository.adapter.ts',
  ]);
  assert.equal(adapter.split(marker).length - 1, 1);

  const methodStart = adapter.indexOf(
    'private async queryLatestCompleteCampaignSweeps',
  );
  const methodEnd = adapter.indexOf('\n  findProductTargetRollups', methodStart);
  assert.notEqual(methodStart, -1);
  assert.notEqual(methodEnd, -1);
  assert.match(
    adapter.slice(methodStart, methodEnd),
    /JOIN channel_scrape_snapshots snapshot -- raw-snapshot-status-count-ok/,
  );
});
