import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const collectorPath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/orders/sellpia-manual-match.js',
);
const workerPath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/orders/worker.js',
);
const entryPath = path.join(repoRoot, 'extensions/kiditem-os/background/service-worker.js');
const dispatchPath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/external-dispatch.js',
);
const pageUrl = 'https://kiditem.sellpia.com/product_manual_match.html';
const matchMd5 = 'a'.repeat(32);

function jsonResponse(value, pathname) {
  const text = JSON.stringify(value);
  return {
    ok: true,
    status: 200,
    redirected: false,
    url: `https://kiditem.sellpia.com${pathname}`,
    headers: { get: () => String(text.length) },
    async text() { return text; },
  };
}

function createRuntime({
  includeBlankAlias = false,
  itemCount = '12',
  resultCode = '634-1',
} = {}) {
  const [productCode, optionCode] = resultCode.split('-');
  const calls = [];
  const chrome = {
    tabs: {
      async query() { return [{ id: 7, windowId: 2, active: false, status: 'complete' }]; },
      async get() { return { id: 7, windowId: 2, active: false, status: 'complete' }; },
      async create() { throw new Error('existing inactive tab should be reused'); },
    },
    scripting: {
      async executeScript(details) {
        const pageContext = vm.createContext({
          AbortController,
          URL,
          URLSearchParams,
          clearTimeout,
          setTimeout,
          location: new URL(pageUrl),
          document: {
            querySelector(selector) {
              if (selector === '#makeshop_uid') return { value: 'shop-1' };
              return null;
            },
          },
          fetch: async (pathname, init) => {
            const body = new URLSearchParams(init.body);
            calls.push({ pathname, body: Object.fromEntries(body.entries()) });
            if (pathname === '/product_manual_match.html'
              && body.get('modekey') === 'get_product_search_matched') {
              return jsonResponse([...(includeBlankAlias ? [{
                product_code: productCode,
                option_code: optionCode,
                match_title: '',
                match_md5: 'b'.repeat(32),
              }] : []), {
                product_code: productCode,
                option_code: optionCode,
                match_title: '샤이니무지개칼라링(999개입)/매직스프링/완구',
                match_md5: matchMd5,
                item_count: itemCount,
              }], pathname);
            }
            if (pathname === '/product_manual_match.html'
              && body.get('modekey') === 'get_match_data') {
              return jsonResponse({ [matchMd5]: { matched_type: 'M' } }, pathname);
            }
            throw new Error(`Unexpected request: ${pathname}`);
          },
        });
        const result = await vm.runInContext(
          `(${details.func.toString()})(...${JSON.stringify(details.args)})`,
          pageContext,
        );
        return [{ result }];
      },
    },
  };
  const context = vm.createContext({ chrome, clearTimeout, console, setTimeout });
  vm.runInContext(readFileSync(collectorPath, 'utf8'), context, { filename: collectorPath });
  const collector = context.KidItemSellpiaManualMatch.create({
    chrome,
    tabReadyTimeoutMs: 1_000,
    requestTimeoutMs: 500,
  });
  return {
    calls,
    collector,
    collection: {
      async attachTab() {},
      async detachTab() {},
      async progress() {},
    },
  };
}

test('declares the read-only manual-match capability and fixed source page', () => {
  const source = readFileSync(collectorPath, 'utf8');
  const worker = readFileSync(workerPath, 'utf8');
  const entry = readFileSync(entryPath, 'utf8');
  const dispatch = readFileSync(dispatchPath, 'utf8');
  assert.match(entry, /["']orders\/sellpia-manual-match\.js["']/);
  assert.match(worker, /collectSellpiaManualMatchV1:\s*true/);
  assert.match(worker, /msg\?\.action === ["']collectSellpiaManualMatch["']/);
  assert.match(source, /product_manual_match\.html/);
  assert.match(source, /get_product_search_matched/);
  assert.match(source, /get_match_data/);
  assert.doesNotMatch(source, /SEARCH_MATCHED_LIST/);
  assert.doesNotMatch(source, /MATCHING_EDIT|p_matching_save|m_matching_save/);
  assert.doesNotMatch(source, /withTimeout\s*\(/);
  assert.match(worker, /collectSellpiaManualMatchPortV1:\s*true/);
  assert.match(worker, /kiditem-sellpia-manual-match-v1/);
  assert.match(
    worker,
    /externalPorts:[\s\S]*SELLPIA_MANUAL_MATCH_PORT_NAME[\s\S]*handleSellpiaManualMatchPort/,
  );
  assert.match(dispatch, /onConnectExternal\?\.addListener\(handlePort\)/);
});

test('uses the explicit Sellpia matching quantity instead of parsing title numbers', async () => {
  const runtime = createRuntime();
  const result = await runtime.collector.collect(runtime.collection, ['634-1']);

  assert.equal(result.success, true, JSON.stringify(result));
  assert.deepEqual(JSON.parse(JSON.stringify(result.snapshot)), {
    source: 'sellpia_product_manual_match',
    version: 1,
    targetCount: 1,
    targetCodes: ['634-1'],
    rowCount: 1,
    rows: [{
      productCode: '634-1',
      aliasTitle: '샤이니무지개칼라링(999개입)/매직스프링/완구',
      itemCount: 12,
      matchedType: 'M',
      evidenceCount: 1,
    }],
  });
  assert.equal(runtime.calls.length, 2);
});

test('ignores exact-code rows without a manual-match alias instead of inferring one', async () => {
  const runtime = createRuntime({ includeBlankAlias: true });
  const result = await runtime.collector.collect(runtime.collection, ['634-1']);

  assert.equal(result.success, true, JSON.stringify(result));
  assert.equal(result.snapshot.rowCount, 1);
  assert.equal(result.snapshot.rows[0].aliasTitle,
    '샤이니무지개칼라링(999개입)/매직스프링/완구');
  assert.equal(runtime.calls.length, 2);
});

test('rejects a search response that resolves to a different Sellpia SKU', async () => {
  const runtime = createRuntime({ resultCode: '635-1' });
  const result = await runtime.collector.collect(runtime.collection, ['634-1']);
  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'sellpia_manual_match_contract_drift');
});

test('rejects a non-positive configured matching quantity', async () => {
  const runtime = createRuntime({ itemCount: '0' });
  const result = await runtime.collector.collect(runtime.collection, ['634-1']);
  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'sellpia_manual_match_contract_drift');
});
