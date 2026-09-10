import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  ORDERS_WORKER_MODULES,
  installExternalDispatch,
} from './helpers/domain-worker-modules.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workerPath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/orders/worker.js',
);
const backgroundRoot = path.dirname(workerPath);
const workerSource = readFileSync(workerPath, 'utf8');
const rocketModulePath = path.join(backgroundRoot, 'rocket-po-collection.js');
const RUN_ID = '11111111-1111-4111-8111-111111111111';

function listPo(overrides = {}) {
  return {
    purchaseOrderSeq: 1,
    purchaseOrderStatus: 'RP',
    vendorId: 'A00123',
    expectedDeliveryDate: '2026-07-08T00:00:00.000Z',
    skuCount: 1,
    sumOfOrderQty: 2,
    sumOfOrderAmount: 990,
    ...overrides,
  };
}

function loadWorker(overrides = {}) {
  const externalMessageListeners = [];
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
    setInterval,
    clearInterval,
    structuredClone,
    crypto: { randomUUID: () => RUN_ID },
    fetch: async () => {
      throw new Error('Unexpected fetch in Rocket worker test');
    },
    chrome: {
      runtime: {
        onInstalled: { addListener() {} },
        onStartup: { addListener() {} },
        onMessageExternal: {
          addListener(listener) {
            externalMessageListeners.push(listener);
          },
        },
        getManifest: () => ({ version: 'test' }),
      },
      alarms: {
        create() {},
        onAlarm: { addListener() {} },
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
  // 도메인 워커는 더 이상 importScripts 를 호출하지 않는다. 통합 서비스워커와
  // 같은 순서로 의존 모듈을 먼저 싣는다.
  context.importScripts(...ORDERS_WORKER_MODULES);
  vm.runInContext(workerSource, context, { filename: workerPath });
  installExternalDispatch(context, sandbox.chrome);
  return { context, externalMessageListeners, storage };
}

test('Rocket collection implementation is extracted from the service worker', () => {
  const moduleSource = readFileSync(rocketModulePath, 'utf8');
  // 의존 모듈 로드는 통합 서비스워커가 소유한다.
  const entrySource = readFileSync(
    path.join(repoRoot, 'extensions/kiditem-os/background/service-worker.js'),
    'utf8',
  );
  assert.match(entrySource, /importScripts\([\s\S]*orders\/rocket-po-collection\.js/);
  assert.doesNotMatch(workerSource, /^importScripts\(/m);
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
          skuCount: 1,
          sumOfOrderQty: 2,
          sumOfOrderAmount: 990,
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
  assert.deepEqual(JSON.parse(JSON.stringify(result.rows[0].confirmation)), {
    center: '센터',
    inboundType: '밀크런',
    poStatus: '발주확정',
    returnManager: '담당자',
    returnContact: '010-0000-0000',
    returnAddress: '서울',
    purchasePrice: 1000,
    supplyPrice: 900,
    vat: 90,
    totalPurchase: 990,
    poRegisteredAt: '2026-07-02 00:00:00',
    xdock: 'N',
  });
  assert.equal(result.evidence.collectionRunId, RUN_ID);
  assert.equal(result.evidence.vendorId, 'A00123');
  assert.equal(result.evidence.listPagesRead, 1);
  assert.equal(result.evidence.totalListPages, 1);
  assert.equal(result.evidence.truncated, false);
  assert.equal(result.evidence.detailPoCount, 1);
  assert.deepEqual([...result.evidence.failedPoNumbers], []);
  assert.equal(result.rows[0].poLineId, '123:P-1:12345678:1');
  assert.deepEqual(JSON.parse(JSON.stringify(result.proof)), {
    from: '2026-07-01', to: '2026-07-07', status: 'PA',
    dateType: 'PURCHASE_ORDER_DATE', validatedList: true,
  });
});

test('Rocket detail parser preserves first-column rowspan ownership for SKU continuations', async () => {
  const cell = (textContent, rowSpan) => ({
    textContent,
    ...(rowSpan === undefined ? {} : { rowSpan }),
  });
  const values = (items) => items.map((textContent) => cell(textContent));
  const skuRow = (lineNumber, productNo, productText, quantity, totalPurchase, rowSpan) => ({
    cells: [
      cell(String(lineNumber), rowSpan),
      cell(productNo),
      cell(productText),
      cell(''),
      cell(String(quantity)),
      cell(''),
      cell(String(totalPurchase)),
      cell(String(totalPurchase - 90)),
      cell('90'),
      cell(String(totalPurchase)),
      cell(''),
      cell(''),
      cell(''),
    ],
  });
  const skuTable = {
    textContent: '상품 번호 발주금액',
    rows: [
      skuRow(1, 'P-1', '8801234567890 상품1', 2, 990, 2),
      { cells: values(['0', '', '0', '0', '0']) },
      skuRow(2, 'P-2', '8801234567891 상품2', 3, 500, 2),
      { cells: values(['1', '', '100', '90', '10']) },
      {
        cells: [
          cell('합계', 2),
          ...values(['', '', '', '5', '', '', '1490']),
        ],
      },
      { cells: values(['0', '', '0', '0']) },
    ],
  };
  class DOMParser {
    parseFromString() {
      return { querySelectorAll: () => [skuTable] };
    }
  }
  const { context } = loadWorker({
    DOMParser,
    fetch: async (url) => String(url).startsWith('/po-web/app/purchase-order/list')
      ? {
        ok: true,
        text: async () => JSON.stringify({
          body: {
            body: [listPo({ skuCount: 2, sumOfOrderQty: 5, sumOfOrderAmount: 1490 })],
            lastPageNumber: 1,
          },
        }),
      }
      : { ok: true, text: async () => '<html></html>' },
  });

  const result = await context.KidItemRocketPoCollection.scrapeRocketPoRows(
    '2026-07-01', '2026-07-07', 'RP', 'WAREHOUSING_PLAN_DATE', RUN_ID,
  );

  assert.equal(result.success, true, result.error);
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.rows.map((row) => row.productNo))),
    ['P-1', 'P-2'],
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.rows.map((row) => row.orderQty))),
    [2, 3],
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.rows.map((row) => row.confirmation.totalPurchase))),
    [990, 500],
  );
});

test('Rocket detail parser still rejects short or missing-field genuine numeric SKU anchors', async () => {
  const cases = [
    {
      name: 'short row',
      cells: ['1', 'P-1', '8801234567890 상품명'].map((textContent) => ({ textContent })),
      pattern: /short SKU row/,
    },
    {
      name: 'missing product number',
      cells: ['1', '', '8801234567890 상품명', '', '2', '', '1000', '900', '90', '990']
        .map((textContent) => ({ textContent })),
      pattern: /product number is missing/,
    },
    {
      name: 'missing ordered quantity',
      cells: ['1', 'P-1', '8801234567890 상품명', '', '', '', '1000', '900', '90', '990']
        .map((textContent) => ({ textContent })),
      pattern: /ordered quantity is missing/,
    },
  ];

  for (const testCase of cases) {
    const skuTable = { textContent: '상품 번호 발주금액', rows: [{ cells: testCase.cells }] };
    class DOMParser {
      parseFromString() {
        return { querySelectorAll: () => [skuTable] };
      }
    }
    const { context } = loadWorker({
      DOMParser,
      fetch: async (url) => String(url).startsWith('/po-web/app/purchase-order/list')
        ? {
          ok: true,
          text: async () => JSON.stringify({
            body: { body: [listPo()], lastPageNumber: 1 },
          }),
        }
        : { ok: true, text: async () => '<html></html>' },
    });
    const result = await context.KidItemRocketPoCollection.scrapeRocketPoRows(
      '2026-07-01', '2026-07-07', 'RP', 'WAREHOUSING_PLAN_DATE', RUN_ID,
    );
    assert.equal(result.success, false, testCase.name);
    assert.match(result.error, testCase.pattern, testCase.name);
    assert.equal(Object.hasOwn(result, 'rows'), false, testCase.name);
  }
});

test('Rocket empty proof accepts only a validated empty list array', async () => {
  for (const [body, success] of [[[], true], [null, false]]) {
    const { context } = loadWorker({
      fetch: async () => ({
        ok: true,
        text: async () => JSON.stringify({ body: { body, lastPageNumber: 1 } }),
      }),
    });
    const result = await context.KidItemRocketPoCollection.scrapeRocketPoRows(
      '2026-07-01', '2026-07-07', '', 'WAREHOUSING_PLAN_DATE', RUN_ID,
    );
    assert.equal(result.success, success);
    if (success) {
      assert.deepEqual([...result.rows], []);
      assert.equal(result.proof.validatedList, true);
      assert.equal(result.proof.status, '');
    } else {
      assert.equal(result.errorCode, 'rocket_po_collection_incomplete');
      assert.equal(Object.hasOwn(result, 'rows'), false);
    }
  }
});

test('Rocket collection fails without partial rows when a PO detail request fails', async () => {
  const listResponse = {
    body: {
      body: [
        listPo({ purchaseOrderSeq: 1001 }),
        listPo({ purchaseOrderSeq: 1002 }),
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

  const result = await context.KidItemRocketPoCollection.scrapeRocketPoRows(
    '2026-07-01', '2026-07-07', 'RP', 'WAREHOUSING_PLAN_DATE', RUN_ID,
  );

  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'rocket_po_collection_incomplete');
  assert.match(result.error, /1002/);
  assert.equal(Object.hasOwn(result, 'rows'), false);
});

test('Rocket collection rejects missing list totals before detail parsing', async () => {
  const { context } = loadWorker({
    fetch: async () => ({
      ok: true,
      text: async () => JSON.stringify({
        body: { body: [listPo({ sumOfOrderQty: undefined })], lastPageNumber: 1 },
      }),
    }),
  });
  const result = await context.KidItemRocketPoCollection.scrapeRocketPoRows(
    '2026-07-01', '2026-07-07', 'RP', 'WAREHOUSING_PLAN_DATE', RUN_ID,
  );
  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'rocket_po_collection_incomplete');
  assert.match(result.error, /ordered quantity/);
  assert.equal(Object.hasOwn(result, 'rows'), false);
});

test('Rocket collection rejects mixed vendor identities before detail parsing', async () => {
  const { context } = loadWorker({
    fetch: async () => ({
      ok: true,
      text: async () => JSON.stringify({
        body: {
          body: [listPo({ purchaseOrderSeq: 1 }), listPo({ purchaseOrderSeq: 2, vendorId: 'B00999' })],
          lastPageNumber: 1,
        },
      }),
    }),
  });
  const result = await context.KidItemRocketPoCollection.scrapeRocketPoRows(
    '2026-07-01', '2026-07-07', 'RP', 'WAREHOUSING_PLAN_DATE', RUN_ID,
  );
  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'rocket_po_collection_incomplete');
  assert.match(result.error, /missing or mixed/);
  assert.equal(Object.hasOwn(result, 'rows'), false);
});

test('Rocket collection rejects duplicate purchase-order identities across list pages', async () => {
  const { context } = loadWorker({
    fetch: async () => ({
      ok: true,
      text: async () => JSON.stringify({
        body: { body: [listPo({ purchaseOrderSeq: 1 }), listPo({ purchaseOrderSeq: 1 })], lastPageNumber: 1 },
      }),
    }),
  });
  const result = await context.KidItemRocketPoCollection.scrapeRocketPoRows(
    '2026-07-01', '2026-07-07', 'RP', 'WAREHOUSING_PLAN_DATE', RUN_ID,
  );
  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'rocket_po_collection_incomplete');
  assert.match(result.error, /duplicated/);
  assert.equal(Object.hasOwn(result, 'rows'), false);
});

test('Rocket collection validates malformed numeric detail rows before filtering', async () => {
  const skuTable = {
    textContent: '상품 번호 발주금액',
    rows: [{
      cells: ['1', 'P-1', '8801234567890 상품명'].map((textContent) => ({ textContent })),
    }],
  };
  class DOMParser {
    parseFromString() {
      return { querySelectorAll: () => [skuTable] };
    }
  }
  const { context } = loadWorker({
    DOMParser,
    fetch: async (url) => String(url).startsWith('/po-web/app/purchase-order/list')
      ? {
        ok: true,
        text: async () => JSON.stringify({
          body: { body: [listPo()], lastPageNumber: 1 },
        }),
      }
      : { ok: true, text: async () => '<html></html>' },
  });
  const result = await context.KidItemRocketPoCollection.scrapeRocketPoRows(
    '2026-07-01', '2026-07-07', 'RP', 'WAREHOUSING_PLAN_DATE', RUN_ID,
  );
  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'rocket_po_collection_incomplete');
  assert.match(result.error, /short SKU row/);
  assert.equal(Object.hasOwn(result, 'rows'), false);
});

test('Rocket collection rejects duplicate product lines instead of indexing them apart', async () => {
  const skuTable = {
    textContent: '상품 번호 발주금액',
    rows: [1, 2].map((lineNumber) => ({
      cells: [
        String(lineNumber), 'P-1', '8801234567890 상품명', '', '2', '', '1000', '900', '90', '990',
      ].map((textContent) => ({ textContent })),
    })),
  };
  class DOMParser {
    parseFromString() {
      return { querySelectorAll: () => [skuTable] };
    }
  }
  const { context } = loadWorker({
    DOMParser,
    fetch: async (url) => String(url).startsWith('/po-web/app/purchase-order/list')
      ? {
        ok: true,
        text: async () => JSON.stringify({
          body: {
            body: [listPo({ skuCount: 2, sumOfOrderQty: 4, sumOfOrderAmount: 1980 })],
            lastPageNumber: 1,
          },
        }),
      }
      : { ok: true, text: async () => '<html></html>' },
  });
  const result = await context.KidItemRocketPoCollection.scrapeRocketPoRows(
    '2026-07-01', '2026-07-07', 'RP', 'WAREHOUSING_PLAN_DATE', RUN_ID,
  );
  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'rocket_po_collection_incomplete');
  assert.match(result.error, /duplicate product line/);
  assert.equal(Object.hasOwn(result, 'rows'), false);
});

test('Rocket detail collection reports first-page auth responses as a retryable PO session error', async () => {
  const { context } = loadWorker({
    fetch: async () => ({
      ok: true,
      text: async () => '<html><body>login</body></html>',
    }),
  });

  const result = await context.KidItemRocketPoCollection.scrapeRocketPoRows(
    '2026-07-01',
    '2026-07-07',
    'RP',
    'WAREHOUSING_PLAN_DATE',
    RUN_ID,
  );

  assert.equal(result.success, false);
  assert.equal(result.pendingLogin, true);
  assert.equal(result.errorCode, 'coupang_po_session_required');
  assert.doesNotMatch(result.error, /Failed to fetch/);
});

test('Rocket page scraper remains self-contained when Chrome serializes it for injection', async () => {
  const { context } = loadWorker();
  const emptyListFetch = async () => ({
    ok: true,
    text: async () => JSON.stringify({ body: { body: [], lastPageNumber: 1 } }),
  });
  const isolatedContext = vm.createContext({ fetch: emptyListFetch });
  const isolatedRows = vm.runInContext(
    `(${context.KidItemRocketPoCollection.scrapeRocketPoRows.toString()})`,
    isolatedContext,
  );

  const rowsResult = await isolatedRows(
    '2026-07-01',
    '2026-07-07',
    'RP',
    'WAREHOUSING_PLAN_DATE',
    RUN_ID,
  );

  assert.equal(rowsResult.success, true);
  assert.deepEqual([...rowsResult.rows], []);
});

test('isolated Rocket page scraper keeps auth failures structured without module helpers', async () => {
  const { context } = loadWorker();
  const htmlFetch = async () => ({
    ok: true,
    text: async () => '<html><body>login</body></html>',
  });
  const isolatedContext = vm.createContext({ fetch: htmlFetch });
  const isolated = vm.runInContext(
    `(${context.KidItemRocketPoCollection.scrapeRocketPoRows.toString()})`,
    isolatedContext,
  );
  const result = await isolated(
      '2026-07-01',
      '2026-07-07',
      'RP',
      'WAREHOUSING_PLAN_DATE',
      RUN_ID,
  );
  assert.equal(result.success, false);
  assert.equal(result.pendingLogin, true);
  assert.equal(result.errorCode, 'coupang_po_session_required');
});

test('Coupang direct-order list maps its first auth response to the shared retry signal', async () => {
  const { context } = loadWorker({
    fetch: async () => ({
      ok: true,
      text: async () => '<html><body>login</body></html>',
    }),
  });

  const result = await context.scrapeCoupangPaList();

  assert.equal(result.success, false);
  assert.equal(result.pendingLogin, true);
  assert.equal(result.errorCode, 'coupang_po_session_required');
});

test('Rocket collection reads every provider page and PO detail beyond the former limits', async () => {
  const listRows = Array.from({ length: 3 }, (_, index) => ({
    ...listPo({
      purchaseOrderSeq: index + 1,
    }),
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
            lastPageNumber: 21,
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

  assert.equal(result.evidence.listPagesRead, 21);
  assert.equal(result.evidence.totalListPages, 21);
  assert.equal(result.poCount, 63);
  assert.equal(result.evidence.detailPoCount, 63);
  assert.equal(result.rows.length, 63);
  assert.equal(result.evidence.truncated, false);
});
