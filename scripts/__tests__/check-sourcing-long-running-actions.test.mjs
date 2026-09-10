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

test('allows an expression-body persisted-snapshot read effect', () => {
  const result = analyzeSourcingLongRunningActions({
    webSources: [{
      path: 'apps/web/src/app/(sourcing-ai)/safe-expression-read.tsx',
      source: fixture('allowed-expression-read-effect.tsx'),
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

test('rejects an expression-body operation start inside a sourcing effect', () => {
  const result = analyzeSourcingLongRunningActions({
    webSources: [{
      path: 'apps/web/src/app/(sourcing-ai)/rejected-expression.tsx',
      source: fixture('rejected-expression-collection-effect.tsx'),
    }],
    sourcingServerSources: [],
  });

  assert.deepEqual(
    result.findings.map((finding) => finding.rule),
    ['collection_start_in_effect'],
  );
});

test('rejects direct and indirect destructured operation-start aliases inside sourcing effects', () => {
  const result = analyzeSourcingLongRunningActions({
    webSources: [
      {
        path: 'apps/web/src/app/(sourcing-ai)/destructured-block.tsx',
        source: fixture('rejected-destructured-collection-effect.tsx'),
      },
      {
        path: 'apps/web/src/app/(sourcing-ai)/destructured-expression.tsx',
        source: fixture('rejected-destructured-expression-collection-effect.tsx'),
      },
      {
        path: 'apps/web/src/app/(sourcing-ai)/indirect-destructured-expression.tsx',
        source: fixture('rejected-indirect-destructured-expression-collection-effect.tsx'),
      },
    ],
    sourcingServerSources: [],
  });

  assert.deepEqual(
    result.findings.map((finding) => finding.rule),
    [
      'collection_start_in_effect',
      'collection_start_in_effect',
      'collection_start_in_effect',
    ],
  );
});

test('rejects a function-expression operation start inside a sourcing effect', () => {
  const result = analyzeSourcingLongRunningActions({
    webSources: [{
      path: 'apps/web/src/app/(sourcing-ai)/function-expression.tsx',
      source: fixture('rejected-function-expression-collection-effect.tsx'),
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

test('rejects retired sourcing browser bridge imports and calls', () => {
  const result = analyzeSourcingLongRunningActions({
    webSources: [{
      path: 'apps/web/src/app/(sourcing-ai)/legacy-browser-bridge.tsx',
      source: fixture('retired-sourcing-browser-bridge.tsx'),
    }],
    sourcingServerSources: [],
  });

  assert.deepEqual(
    result.findings.map((finding) => finding.rule),
    [
      'retired_direct_extension_import',
      'retired_direct_extension_call',
    ],
  );
});

test('rejects retired sourcing browser action bridges', () => {
  const result = analyzeSourcingLongRunningActions({
    webSources: [{
      path: 'apps/web/src/app/(sourcing-ai)/legacy-browser-action.tsx',
      source: fixture('retired-sourcing-browser-action-bridge.tsx'),
    }],
    sourcingServerSources: [],
  });

  assert.deepEqual(
    result.findings.map((finding) => finding.rule),
    ['retired_direct_extension_call'],
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

test('rejects legacy direct collection POST endpoints while allowing typed snapshot reads', () => {
  const result = analyzeSourcingLongRunningActions({
    webSources: [],
    sourcingServerSources: [{
      path: 'apps/server/src/sourcing/adapter/in/http/live-commerce.controller.ts',
      source: fixture('legacy-direct-collection-post.controller.ts'),
    }],
  });

  assert.deepEqual(
    result.findings.map((finding) => finding.rule),
    ['legacy_direct_collection_post'],
  );
});

test('allows Shadow entrypoints to invoke the source owner directly', () => {
  const result = analyzeSourcingLongRunningActions({
    webSources: [],
    sourcingServerSources: [{
      path: 'apps/server/src/sourcing/adapter/in/http/direct-shadow-signal.controller.ts',
      source: fixture('direct-shadow-signal.controller.ts'),
    }],
  });

  assert.deepEqual(
    result.findings.map((finding) => finding.rule),
    [],
  );
});

test('rejects retired Shadow Operation admission from HTTP and Agent entrypoints', () => {
  for (const entry of ['http/shadow.controller.ts', 'agent/shadow.adapter.ts']) {
    const result = analyzeSourcingLongRunningActions({
      webSources: [],
      sourcingServerSources: [{
        path: `apps/server/src/sourcing/adapter/in/${entry}`,
        source: 'return this.operations.startShadowCollection(input);',
      }],
    });
    assert.deepEqual(result.findings.map((finding) => finding.rule), ['retired_shadow_operation_entrypoint']);
  }
});

test('rejects an approved-origin Coupang external source-collection bridge', () => {
  const result = analyzeSourcingLongRunningActions({
    webSources: [],
    sourcingServerSources: [],
    extensionSources: [{
      path: 'extensions/kiditem-os/background/coupang/worker.js',
      source: fixture('retired-coupang-external-source-bridge.js'),
    }],
  });

  assert.deepEqual(
    result.findings.map((finding) => finding.rule),
    ['retired_external_source_collection_bridge'],
  );
});

test('rejects the retired approved-origin Coupang competitor catalog action while retaining exact handlers', () => {
  const result = analyzeSourcingLongRunningActions({
    webSources: [],
    sourcingServerSources: [],
    extensionSources: [{
      path: 'extensions/kiditem-os/background/coupang/worker.js',
      source: fixture('retired-coupang-competitor-external-bridge.js'),
    }],
  });

  assert.deepEqual(
    result.findings.map((finding) => finding.rule),
    ['retired_external_source_collection_bridge'],
  );
});

test('rejects an extension registration or dispatch of the retired 1688 keyword operation', () => {
  const result = analyzeSourcingLongRunningActions({
    webSources: [],
    sourcingServerSources: [],
    extensionSources: [{
      path: 'extensions/kiditem-os/background/sourcing/worker.js',
      source: fixture('retired-1688-keyword-operation.worker.js'),
    }],
  });

  assert.deepEqual(
    result.findings.map((finding) => finding.rule),
    ['retired_extension_1688_keyword_operation'],
  );
});

test('rejects a mounted Naver provider POST instead of a persisted snapshot read', () => {
  const result = analyzeSourcingLongRunningActions({
    webSources: [{
      path: 'apps/web/src/app/(sourcing-ai)/market/components/NaverPanel.tsx',
      source: fixture('mounted-naver-provider-query.tsx'),
    }],
    sourcingServerSources: [],
  });

  assert.deepEqual(
    result.findings.map((finding) => finding.rule),
    ['mounted_naver_provider_collection'],
  );
});

test('rejects a market Naver provider facade even when its query lives in another module', () => {
  const result = analyzeSourcingLongRunningActions({
    webSources: [{
      path: 'apps/web/src/app/(sourcing-ai)/sourcing-ai/market/lib/live-naver-market.ts',
      source: fixture('direct-naver-provider-market-lib.ts'),
    }],
    sourcingServerSources: [],
  });

  assert.deepEqual(
    result.findings.map((finding) => finding.rule),
    ['mounted_naver_provider_collection'],
  );
});

test('rejects an indirect keywords-to-recommendations Naver provider helper bridge', () => {
  const result = analyzeSourcingLongRunningActions({
    webSources: [{
      path: 'apps/web/src/app/(sourcing-ai)/sourcing-ai/keywords/lib/legacy-helper.tsx',
      source: fixture('indirect-keywords-recommendations-provider-bridge.tsx'),
    }],
    sourcingServerSources: [],
  });

  assert.deepEqual(
    result.findings.map((finding) => finding.rule),
    ['indirect_keyword_provider_bridge'],
  );
});

test('does not require an Operation handler for explicit owner recommendation refresh', () => {
  const result = analyzeSourcingLongRunningActions({
    webSources: [],
    sourcingServerSources: [{
      path: 'apps/server/src/sourcing/adapter/in/http/sourcing-workspace.controller.ts',
      source: fixture('direct-recommendation-refresh.controller.ts'),
    }],
  });

  assert.deepEqual(result.findings, []);
});

test('allows the Taobao helper that starts a server source-owner attempt', () => {
  const result = analyzeSourcingLongRunningActions({
    webSources: [{
      path: 'apps/web/src/app/(sourcing-ai)/sourcing-ai/market/lib/live-commerce-api.ts',
      source: `export function collectTaobaoLive(input, idempotencyKey) {
        return apiClient.post('/api/sourcing/live-commerce/taobao/attempts', input,
          { headers: { 'Idempotency-Key': idempotencyKey } });
      }`,
    }],
    sourcingServerSources: [],
  });
  assert.deepEqual(result.findings, []);
});
