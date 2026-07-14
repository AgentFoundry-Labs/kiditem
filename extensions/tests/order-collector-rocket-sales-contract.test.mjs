import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workerPath = path.join(
  repoRoot,
  'extensions/order-collector/background/service-worker.js',
);
const backgroundRoot = path.dirname(workerPath);
const workerSource = readFileSync(workerPath, 'utf8');
const RUN_ID = '11111111-1111-4111-8111-111111111111';

function loadWorker(overrides = {}) {
  let externalMessageListener = null;
  let context;
  const storage = {};
  const sandbox = {
    URL,
    URLSearchParams,
    TextDecoder,
    Blob,
    FormData,
    atob,
    btoa,
    console,
    setTimeout,
    clearTimeout,
    structuredClone,
    crypto: { randomUUID: () => RUN_ID },
    chrome: {
      runtime: {
        onMessageExternal: {
          addListener(listener) {
            externalMessageListener = listener;
          },
        },
        getManifest: () => ({ version: 'test' }),
      },
      storage: {
        local: {
          async get(key) {
            return { [key]: structuredClone(storage[key]) };
          },
          async set(values) {
            Object.assign(storage, structuredClone(values));
          },
        },
      },
      tabs: {
        async query() { return []; },
        async remove() {},
        async update(tabId, properties) { return { id: tabId, windowId: 1, ...properties }; },
      },
      windows: { async update() {} },
      scripting: { async executeScript() {} },
    },
    ...overrides,
    importScripts(...relativePaths) {
      for (const relativePath of relativePaths) {
        const filename = path.join(backgroundRoot, relativePath);
        vm.runInContext(readFileSync(filename, 'utf8'), context, { filename });
      }
    },
  };
  context = vm.createContext(sandbox);
  vm.runInContext(workerSource, context, { filename: workerPath });
  return { context, externalMessageListener, storage };
}

test('collectRocketPoRows message forwards the requested status and date basis', async () => {
  const { context, externalMessageListener } = loadWorker();
  let received = null;
  let receivedCollection = null;
  context.collectRocketPoRows = async (input, collection) => {
    received = input;
    receivedCollection = collection;
    return { success: true, rows: [], poCount: 0 };
  };

  const response = await new Promise((resolve) => {
    const keepAlive = externalMessageListener(
      {
        action: 'collectRocketPoRows',
        from: '2026-07-01',
        to: '2026-07-07',
        status: 'PA',
        dateType: 'PURCHASE_ORDER_DATE',
        runId: RUN_ID,
      },
      {},
      resolve,
    );
    assert.equal(keepAlive, true);
  });

  assert.deepEqual({ ...received }, {
    from: '2026-07-01',
    to: '2026-07-07',
    status: 'PA',
    dateType: 'PURCHASE_ORDER_DATE',
  });
  assert.equal(receivedCollection.runId, RUN_ID);
  assert.equal(response.runId, RUN_ID);
  assert.equal(response.collectionSession.status, 'succeeded');
  assert.deepEqual(response.rows, []);
  assert.equal(response.poCount, 0);
});

test('Rocket page scraper uses the requested filters and labels returned rows', async () => {
  const requestedUrls = [];
  const listResponse = {
    body: {
      body: [
        {
          purchaseOrderSeq: 123,
          purchaseOrderStatus: 'PA',
          purchaseOrderStatusDescription: '발주확정',
          centerName: '센터',
          transportTypeDescription: '밀크런',
          vendorName: 'KidItem',
          expectedDeliveryDate: '2026-07-08T00:00:00.000Z',
          createdAt: '2026-07-02T00:00:00.000Z',
        },
      ],
      lastPageNumber: 1,
    },
  };
  const skuTable = {
    textContent: '상품 번호 발주금액',
    rows: [
      {
        cells: ['1', 'P-1', '12345678 상품명', '', '2', '', '1000', '900', '90', '990'].map(
          (textContent) => ({ textContent }),
        ),
      },
    ],
  };
  const returnTable = {
    textContent: '회송 담당자 회송지',
    rows: [
      { cells: [] },
      { cells: ['담당자', '010-0000-0000', '서울'].map((textContent) => ({ textContent })) },
    ],
  };
  const fetch = async (url) => {
    requestedUrls.push(String(url));
    if (String(url).startsWith('/po-web/app/purchase-order/list')) {
      return { ok: true, text: async () => JSON.stringify(listResponse) };
    }
    return { ok: true, text: async () => '<html></html>' };
  };
  class DOMParser {
    parseFromString() {
      return { querySelectorAll: () => [returnTable, skuTable] };
    }
  }
  const { context } = loadWorker({ fetch, DOMParser });

  const result = await context.scrapeRocketPoRows(
    '2026-07-01',
    '2026-07-07',
    'PA',
    'PURCHASE_ORDER_DATE',
  );

  const listUrl = new URL(requestedUrls[0], 'https://supplier.coupang.com');
  assert.equal(listUrl.searchParams.get('searchDateType'), 'PURCHASE_ORDER_DATE');
  assert.equal(listUrl.searchParams.get('purchaseOrderStatus'), 'PA');
  assert.equal(result.rows[0].businessDateBasis, 'ordered_at');
  assert.equal(result.rows[0].poStatusCode, 'PA');
});
