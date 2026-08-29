import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = join(import.meta.dirname, '..', '..');
const coreSchema = readFileSync(join(repoRoot, 'prisma/models/core.prisma'), 'utf8');
const channelsSchema = readFileSync(join(repoRoot, 'prisma/models/channels.prisma'), 'utf8');
const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));

test('persists independent profitability source provenance', () => {
  for (const field of [
    'evaluationCutoffDate',
    'sellpiaCoverageStartDate',
    'sellpiaCoverageEndDate',
    'advertisingCoverageStartDate',
    'advertisingCoverageEndDate',
    'ordersSourceStatus',
    'ordersCoverageStartDate',
    'ordersCoverageEndDate',
    'ordersSourceCapturedAt',
    'mappingSourceStatus',
    'mappingInventoryGeneration',
    'mappingVerifiedAt',
    'coverageStartDate',
    'coverageEndDate',
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
  assert.match(packageJson.scripts['dev:all'], /npm run dev:core/);
});
