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
const rocketModulePath = path.join(backgroundRoot, 'rocket-po-collection.js');
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

test('Rocket collection implementation is extracted from the service worker', () => {
  const moduleSource = readFileSync(rocketModulePath, 'utf8');
  assert.match(workerSource, /importScripts\([\s\S]*rocket-po-collection\.js/);
  assert.match(moduleSource, /KidItemRocketPoCollection/);
  assert.match(moduleSource, /listPagesRead/);
  assert.match(moduleSource, /failedPoNumbers/);
  assert.doesNotMatch(workerSource, /async function scrapeRocketPoRows/);
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
          vendorId: 'A00123',
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

  const result = await context.KidItemRocketPoCollection.scrapeRocketPoRows(
    '2026-07-01',
    '2026-07-07',
    'PA',
    'PURCHASE_ORDER_DATE',
    RUN_ID,
  );

  const listUrl = new URL(requestedUrls[0], 'https://supplier.coupang.com');
  assert.equal(listUrl.searchParams.get('searchDateType'), 'PURCHASE_ORDER_DATE');
  assert.equal(listUrl.searchParams.get('purchaseOrderStatus'), 'PA');
  assert.equal(result.rows[0].businessDateBasis, 'ordered_at');
  assert.equal(result.rows[0].poStatusCode, 'PA');
  assert.equal(result.rows[0].vendorId, 'A00123');
  assert.equal(result.evidence.collectionRunId, RUN_ID);
  assert.equal(result.evidence.vendorId, 'A00123');
  assert.equal(result.evidence.listPagesRead, 1);
  assert.equal(result.evidence.totalListPages, 1);
  assert.equal(result.evidence.truncated, false);
  assert.equal(result.evidence.detailPoCount, 1);
  assert.deepEqual([...result.evidence.failedPoNumbers], []);
  assert.equal(result.rows[0].poLineId, '123:P-1:12345678:1');
});

test('Rocket collection reports failed details, missing vendor identity, and stable line IDs', async () => {
  const listResponse = {
    body: {
      body: [
        {
          purchaseOrderSeq: 1001,
          vendorId: '',
          expectedDeliveryDate: '2026-07-08T00:00:00.000Z',
        },
        {
          purchaseOrderSeq: 1002,
          vendorId: 'A00123',
          expectedDeliveryDate: '2026-07-08T00:00:00.000Z',
        },
      ],
      lastPageNumber: 1,
    },
  };
  const skuTable = {
    textContent: '상품 번호 발주금액',
    rows: [{
      cells: ['1', 'P-1', '8801234567890 상품명', '', '2', '', '1000', '900', '90', '990']
        .map((textContent) => ({ textContent })),
    }],
  };
  const fetch = async (url) => {
    if (String(url).startsWith('/po-web/app/purchase-order/list')) {
      return { ok: true, text: async () => JSON.stringify(listResponse) };
    }
    if (String(url).endsWith('/1002')) {
      return { ok: false, text: async () => 'failed' };
    }
    return { ok: true, text: async () => '<html></html>' };
  };
  class DOMParser {
    parseFromString() {
      return { querySelectorAll: () => [skuTable] };
    }
  }
  const { context } = loadWorker({ fetch, DOMParser });

  const first = await context.KidItemRocketPoCollection.scrapeRocketPoRows(
    '2026-07-01', '2026-07-07', 'RP', 'WAREHOUSING_PLAN_DATE', RUN_ID,
  );
  const second = await context.KidItemRocketPoCollection.scrapeRocketPoRows(
    '2026-07-01', '2026-07-07', 'RP', 'WAREHOUSING_PLAN_DATE', RUN_ID,
  );

  assert.equal(first.evidence.vendorId, '');
  assert.deepEqual([...first.evidence.failedPoNumbers], ['1002']);
  assert.equal(first.evidence.detailPoCount, 1);
  assert.equal(first.rows[0].poLineId, second.rows[0].poLineId);
});

test('Rocket collection marks the 20-list-page and 40-detail limits incomplete', async () => {
  const listRows = Array.from({ length: 3 }, (_, index) => ({
    purchaseOrderSeq: index + 1,
    vendorId: 'A00123',
  }));
  let listCalls = 0;
  const fetch = async (url) => {
    if (String(url).startsWith('/po-web/app/purchase-order/list')) {
      listCalls += 1;
      return {
        ok: true,
        text: async () => JSON.stringify({
          body: {
            body: listRows.map((row) => ({
              ...row,
              purchaseOrderSeq: row.purchaseOrderSeq + ((listCalls - 1) * 3),
            })),
            lastPageNumber: 20,
          },
        }),
      };
    }
    return { ok: true, text: async () => '<html></html>' };
  };
  const skuTable = {
    textContent: '상품 번호 발주금액',
    rows: [{
      cells: ['1', 'P-1', '8801234567890 상품명', '', '2', '', '1000', '900', '90', '990']
        .map((textContent) => ({ textContent })),
    }],
  };
  class DOMParser {
    parseFromString() {
      return { querySelectorAll: () => [skuTable] };
    }
  }
  const { context } = loadWorker({ fetch, DOMParser });
  const result = await context.KidItemRocketPoCollection.scrapeRocketPoRows(
    '2026-07-01', '2026-07-07', 'RP', 'WAREHOUSING_PLAN_DATE', RUN_ID,
  );

  assert.equal(result.evidence.listPagesRead, 20);
  assert.equal(result.evidence.detailPoCount, 40);
  assert.equal(result.evidence.truncated, true);
});
