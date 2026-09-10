import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(
  new URL('../../kiditem-os/background/coupang/worker.js', import.meta.url),
  'utf8',
);
function trackedWingKeywordCollectionSource() {
  const helperStart = source.indexOf('function wingSearchHasIncompleteProof');
  const start = source.indexOf('async function collectAdvertisingTrackedWingProductsKeyword');
  const end = source.indexOf('function parseAdvertisingTrackedWingProductsStart', start);
  assert.ok(helperStart >= 0, 'tracked Wing proof helper must exist');
  assert.ok(start >= 0, 'tracked Wing keyword collection must exist');
  assert.ok(end > start, 'tracked Wing keyword collection must end before request parsing');
  return source.slice(helperStart, end);
}

function createTrackedWingKeywordHarness(rows, options = {}) {
  const context = vm.createContext({
    Array,
    Error,
    Number,
    Set,
    String,
    ADVERTISING_TRACKED_WING_PRODUCTS_PRODUCER: 'advertising.wing_tracked_products',
    ADVERTISING_TRACKED_WING_PRODUCTS_MAX_ITEMS: 300,
    SOURCING_WING_CATALOG_MAX_ITEMS: 100,
    WING_CATALOG_MAX_PAGES: 5,
    INCOMPLETE_WING_SEARCH_STOP_REASONS: new Set(['authentication_token_missing', 'non_json_response']),
    collectionSessions: {
      async getOwned() {
        return { producer: 'advertising.wing_tracked_products' };
      },
    },
    wingSearchCollector: {
      async collect() {
        if (options.search) return options.search();
        return { success: true, rows };
      },
    },
    toAdvertisingTrackedWingSnapshot(row, sourceKeyword) {
      return { productId: String(row.productId), sourceKeyword };
    },
  });
  context.globalThis = context;
  vm.runInContext(
    `${trackedWingKeywordCollectionSource()}\nglobalThis.collectTrackedWingKeyword = collectAdvertisingTrackedWingProductsKeyword;`,
    context,
  );
  return context;
}

test('filters tracked Wing rows to the frozen plan before applying the 300-item owner bound', async () => {
  const targetId = 'frozen-target-after-search-row-100';
  const rows = [
    ...Array.from({ length: 101 }, (_value, index) => ({
      productId: `unplanned-${index}`,
    })),
    { productId: targetId },
  ];
  const context = createTrackedWingKeywordHarness(rows);

  const result = await context.collectTrackedWingKeyword({
    environmentId: 'office',
    attemptId: 'attempt-1',
    keyword: '블록',
    plannedProducts: [targetId],
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result.items)), [
    { productId: targetId, sourceKeyword: '블록' },
  ]);
});

test('does not publish tracked products when Wing transport stops without complete proof', async () => {
  const context = createTrackedWingKeywordHarness([], {
    search: async () => ({
      success: true,
      stopReason: 'non_json_response',
      maxPages: 5,
      pages: [{ searchPage: 0, resultArrayObserved: true }],
      rows: [{ productId: 'frozen-target' }],
    }),
  });

  const result = await context.collectTrackedWingKeyword({
    environmentId: 'office',
    attemptId: 'attempt-1',
    keyword: '블록',
    plannedProducts: ['frozen-target'],
  });

  assert.equal(result.success, false);
  assert.equal(result.stopReason, 'non_json_response');
  assert.equal(result.items, undefined);
});

test('uses one focused keyword contract helper loaded before the Coupang worker', async () => {
  const [contractSource, serviceWorkerSource, sharedContractSource] = await Promise.all([
    readFile(new URL('../../kiditem-os/background/coupang/wing-keyword-contract.js', import.meta.url), 'utf8'),
    readFile(new URL('../../kiditem-os/background/service-worker.js', import.meta.url), 'utf8'),
    readFile(new URL('../../../packages/shared/src/sourcing/browser-operations.ts', import.meta.url), 'utf8'),
  ]);
  const extensionVersion = contractSource.match(/CONTRACT_VERSION\s*=\s*"([^"]+)"/)?.[1];
  const sharedVersion = sharedContractSource.match(
    /SOURCING_WING_CATALOG_KEYWORD_CONTRACT_VERSION\s*=\s*\n?\s*'([^']+)'/,
  )?.[1];

  assert.equal(extensionVersion, sharedVersion);
  assert.ok(
    serviceWorkerSource.indexOf('coupang/wing-keyword-contract.js')
      < serviceWorkerSource.indexOf('coupang/worker.js'),
  );
  assert.doesNotMatch(source, /function normalizedWingOperationKeyword/);
});
