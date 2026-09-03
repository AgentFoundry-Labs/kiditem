import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = join(import.meta.dirname, '..', '..');
const coreSchema = readFileSync(join(repoRoot, 'prisma/models/core.prisma'), 'utf8');
const channelsSchema = readFileSync(join(repoRoot, 'prisma/models/channels.prisma'), 'utf8');
const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const localDevelopment = readFileSync(join(repoRoot, 'scripts/run-local-development.mjs'), 'utf8');

test('persists exact source provenance for absolute ABC publication', () => {
  for (const field of [
    'officialCutoffDate',
    'publishedSellpiaSourceImportRunId',
    'publishedAdvertisingSourceImportRunId',
    'publishedMappingGeneration',
    'gradeBasisCutoffDate',
    'sellpiaSourceImportRunId',
    'advertisingSourceImportRunId',
    'sellpiaGeneration',
    'advertisingGeneration',
    'previousSellpiaSourceImportRunId',
    'nextSellpiaSourceImportRunId',
    'previousAdvertisingSourceImportRunId',
    'nextAdvertisingSourceImportRunId',
  ]) {
    assert.match(coreSchema, new RegExp(`\\b${field}\\b`));
  }

  for (const field of [
    'adCoverageStatus',
    'adObservedAt',
    'trafficCoverageStatus',
    'trafficObservedAt',
  ]) {
    assert.match(channelsSchema, new RegExp(`\\b${field}\\b`));
  }
});

test('starts the operation runtime worker in the all-in-one local development command', () => {
  assert.match(
    packageJson.scripts['dev:core'],
    /OPERATION_RUNTIME_WORKER_ENABLED=1 npm run dev:server/,
  );
  assert.equal(packageJson.scripts['dev:all'], 'node scripts/run-local-development.mjs');
  assert.match(localDevelopment, /command: 'npm run dev:core'/);
});
