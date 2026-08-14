import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeSourcingLongRunningActions,
} from '../check-sourcing-long-running-actions.mjs';

const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'sourcing-long-running-actions',
);

function fixture(name) {
  return readFileSync(join(fixtures, name), 'utf8');
}

test('allows a persisted-snapshot read effect', () => {
  const result = analyzeSourcingLongRunningActions({
    webSources: [{
      path: 'apps/web/src/app/(sourcing-ai)/safe-read.tsx',
      source: fixture('allowed-read-effect.tsx'),
    }],
    sourcingServerSources: [],
  });

  assert.deepEqual(result.findings, []);
});

test('allows the persisted batch history read that replaces per-product queries', () => {
  const result = analyzeSourcingLongRunningActions({
    webSources: [{
      path: 'apps/web/src/app/(sourcing-ai)/product-tracking.tsx',
      source: fixture('allowed-batch-history-read.tsx'),
    }],
    sourcingServerSources: [],
  });

  assert.deepEqual(result.findings, []);
});

test('rejects an explicit operation start inside a sourcing effect', () => {
  const result = analyzeSourcingLongRunningActions({
    webSources: [{
      path: 'apps/web/src/app/(sourcing-ai)/rejected.tsx',
      source: fixture('rejected-collection-effect.tsx'),
    }],
    sourcingServerSources: [],
  });

  assert.deepEqual(
    result.findings.map((finding) => finding.rule),
    ['collection_start_in_effect'],
  );
});

test('rejects retired direct helpers and product-tracking useQueries', () => {
  const result = analyzeSourcingLongRunningActions({
    webSources: [
      {
        path: 'apps/web/src/app/(sourcing-ai)/legacy.tsx',
        source: fixture('retired-extension-import.tsx'),
      },
      {
        path: 'apps/web/src/app/(sourcing-ai)/product-tracking.tsx',
        source: fixture('product-tracking-use-queries.tsx'),
      },
    ],
    sourcingServerSources: [],
  });

  assert.deepEqual(
    result.findings.map((finding) => finding.rule),
    [
      'retired_direct_extension_import',
      'retired_direct_extension_call',
      'product_tracking_use_queries',
    ],
  );
});

test('rejects direct 1688 HTTP execution and read-or-compute rising reads', () => {
  const result = analyzeSourcingLongRunningActions({
    webSources: [],
    sourcingServerSources: [
      {
        path: 'apps/server/src/sourcing/adapter/in/http/direct-1688.controller.ts',
        source: fixture('direct-1688-controller.ts'),
      },
      {
        path: 'apps/server/src/sourcing/application/service/legacy-rising.ts',
        source: fixture('latest-or-detect.ts'),
      },
      {
        path: 'apps/server/src/sourcing/adapter/in/http/rising.controller.ts',
        source: fixture('rising-detect-controller.ts'),
      },
    ],
  });

  assert.deepEqual(
    result.findings.map((finding) => finding.rule),
    [
      'direct_1688_service_execution_from_http_controller',
      'latest_or_detect',
      'legacy_rising_detect_post',
    ],
  );
});
