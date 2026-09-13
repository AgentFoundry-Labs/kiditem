import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const collectorSource = readFileSync(
  new URL('../kiditem-os/background/orders/sellpia-product-profit-collector.js', import.meta.url),
  'utf8',
);

function createProductProfitHarness({
  responseBody,
  now = '2026-07-01T03:00:00.000Z',
  executeError = null,
  executeResult,
  existingTab = null,
  activeSequence = null,
} = {}) {
  const requests = [];
  const removedTabs = [];
  const attachedTabs = [];
  const detachedTabs = [];
  let activeChecks = 0;
  let requestCount = 0;
  let nextTabId = 8;
  const NativeDate = Date;
  class FixedDate extends NativeDate {
    constructor(...args) {
      super(args.length === 0 ? now : args[0]);
    }

    static now() {
      return new NativeDate(now).getTime();
    }
  }

  const pageExecuteScript = async ({ func, args }) => {
    if (executeError) throw executeError;
    if (executeResult !== undefined) return [{ result: executeResult }];
    const pageContext = vm.createContext({
      Date: FixedDate,
      JSON,
      Number,
      Object,
      Promise,
      String,
      URLSearchParams,
      setTimeout,
      clearTimeout,
      fetch: async (_url, init) => {
        requestCount += 1;
        const body = new URLSearchParams(String(init?.body ?? ''));
        requests.push(body);
        const response = typeof responseBody === 'function'
          ? await responseBody(body, requestCount)
          : responseBody;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify(response),
        };
      },
    });
    const result = await vm.runInContext(
      `(${func.toString()})(...args)`,
      vm.createContext({ ...pageContext, args }),
    );
    return [{ result }];
  };

  const tab = existingTab || { id: nextTabId, windowId: 7, status: 'complete' };
  const chrome = {
    tabs: {
      query: async () => (existingTab ? [existingTab] : []),
      create: async (properties) => {
        const created = { id: nextTabId++, windowId: 7, status: 'complete', ...properties };
        return created;
      },
      remove: async (tabId) => removedTabs.push(tabId),
    },
    scripting: { executeScript: pageExecuteScript },
  };
  const context = vm.createContext({
    Date,
    Error,
    Promise,
    String,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(collectorSource, context, { filename: 'sellpia-product-profit-collector.js' });
  const collection = {
    attachTab: async (value) => {
      attachedTabs.push(value);
      return { attemptId: '11111111-1111-4111-8111-111111111111' };
    },
    assertActive: async () => {
      if (!activeSequence) return true;
      const index = Math.min(activeChecks++, activeSequence.length - 1);
      return activeSequence[index];
    },
    detachTab: async (value) => {
      detachedTabs.push(value);
      await chrome.tabs.remove(value.id);
    },
  };
  const collector = context.KidItemSellpiaProductProfitCollector.create({
    chrome,
    waitForTabReady: async () => undefined,
    withTimeout: async (operation) => operation,
    isMallAccessError: (error) => String(error?.message || error).includes('Cannot access contents'),
    mallAccessErrorResult: (mallName) => ({
      success: false,
      pendingLogin: true,
      error: `${mallName} login is required.`,
    }),
    mallGenericErrorResult: (mallName, error) => ({
      success: false,
      error: `${mallName} collection failed: ${String(error?.message || error)}`,
    }),
  });

  return {
    collector,
    collection,
    requests,
    removedTabs,
    attachedTabs,
    detachedTabs,
    tab,
    get activeChecks() { return activeChecks; },
  };
}

async function runProductProfitCollector(executeError, options = {}) {
  const harness = createProductProfitHarness({
    executeError,
    existingTab: {
      id: 7,
      windowId: 7,
      url: 'https://kiditem.sellpia.com/stat_prd_profit.html',
      status: 'complete',
    },
  });
  const result = await harness.collector.collect({
    startDate: options.startDate ?? null,
    endDate: options.endDate ?? null,
    collection: harness.collection,
  });
  return { result: JSON.parse(JSON.stringify(result)), removedTabs: harness.removedTabs };
}

test('keeps a product-profit execution error generic instead of inferring login', async () => {
  const { result, removedTabs } = await runProductProfitCollector(
    new Error('Cannot access contents of the page'),
  );

  assert.deepEqual(result, {
    success: false,
    pendingLogin: true,
    error: '셀피아 login is required.',
  });
  assert.deepEqual(removedTabs, []);
});

test('passes through explicit page login evidence unchanged', async () => {
  const pageResult = {
    success: false,
    pendingLogin: true,
    error: '셀피아 로그인이 필요합니다.',
  };
  const harness = createProductProfitHarness({
    executeResult: pageResult,
    existingTab: {
      id: 7,
      windowId: 7,
      url: 'https://kiditem.sellpia.com/stat_prd_profit.html',
      status: 'complete',
    },
  });
  const result = await harness.collector.collect({ collection: harness.collection });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), pageResult);
});

test('cancels before provider execution when the owner fence is lost after tab readiness', async () => {
  const harness = createProductProfitHarness({
    responseBody: [],
    activeSequence: [true, false],
  });
  const result = await harness.collector.collect({ collection: harness.collection });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: false,
    errorCode: 'COLLECTION_CANCELLED',
    error: 'Sellpia profitability collection is no longer active.',
  });
  assert.equal(harness.activeChecks, 2);
  assert.deepEqual(harness.removedTabs, [8]);
  assert.equal(harness.requests.length, 0);
});

async function scrape(
  responseBody,
  startDate = null,
  endDate = null,
  now = '2026-07-01T03:00:00.000Z',
) {
  const harness = createProductProfitHarness({ responseBody, now });
  const result = await harness.collector.collect({
    startDate,
    endDate,
    collection: harness.collection,
  });
  return {
    result: JSON.parse(JSON.stringify(result)),
    body: harness.requests[0],
    bodies: harness.requests,
    requestCount: harness.requests.length,
    attachedTabs: harness.attachedTabs,
    detachedTabs: harness.detachedTabs,
    removedTabs: harness.removedTabs,
  };
}
test('keeps the 401-day sales window while reconciling each purchase month', async () => {
  const responseFor = (inAmount, inQty) => [{
    product_code: 'SKU-1',
    option_code: 'OPTION-1',
    product_name: '상품',
    total_order_amount: 2500,
    total_order_qty: 5,
    total_in_amount: inAmount,
    total_in_qty: inQty,
    graph: {
      '2026-04': '400,1000,2',
      '2026-06': '600,1500,3',
    },
  }];
  const {
    result,
    body,
    bodies,
    requestCount,
    attachedTabs,
    detachedTabs,
    removedTabs,
  } = await scrape((request, index) => {
    if (index === 1) return responseFor(1000, 5);
    const month = request.get('in_s_date').slice(0, 7);
    return responseFor(month === '2026-04' ? 400 : month === '2026-06' ? 600 : 0,
      month === '2026-04' ? 2 : month === '2026-06' ? 3 : 0);
  }, null, null, '2026-07-01T03:00:00.000Z');

  assert.equal(requestCount, 15);
  assert.equal(body.get('mode'), 'stat_prd_profit');
  assert.equal(body.get('s_date'), '2025-05-26');
  assert.equal(body.get('e_date'), '2026-06-30');
  assert.equal(body.get('in_s_date'), '2025-05-26');
  assert.equal(body.get('in_e_date'), '2026-06-30');
  assert.equal(body.get('buy_point'), 'R');
  assert.equal(body.get('vat_tp'), '1');
  assert.equal(bodies[1].get('s_date'), '2025-05-26');
  assert.equal(bodies[1].get('e_date'), '2026-06-30');
  assert.equal(bodies[1].get('in_s_date'), '2025-05-26');
  assert.equal(bodies[1].get('in_e_date'), '2025-05-31');
  assert.equal(bodies.at(-1).get('in_s_date'), '2026-06-01');
  assert.equal(bodies.at(-1).get('in_e_date'), '2026-06-30');
  assert.equal(result.success, true);
  assert.deepEqual(attachedTabs.map((tab) => tab.id), [8]);
  assert.deepEqual(detachedTabs.map((tab) => tab.id), [8]);
  assert.deepEqual(removedTabs, [8]);
  assert.equal(result.payload.parserVersion, 'sellpia-profitability-v2');
  assert.deepEqual(result.payload.provenance, {
    source: 'sellpia_stat_prd_profit',
    costBasis: 'ORDER_TIME_SUPPLY_COST',
    vatIncluded: true,
  });
  assert.deepEqual(result.payload.range, { from: '2025-05-26', to: '2026-06-30' });
  assert.equal(result.payload.products[0].totalOrderAmount, 2500);
  assert.equal(result.payload.products[0].totalOrderQty, 5);
  assert.equal(result.payload.products[0].totalInAmount, 1000);
  assert.equal(result.payload.products[0].totalInQty, 5);
  assert.deepEqual(result.payload.products[0].months, [
    { yearMonth: '2026-04', inAmount: 400, orderAmount: 1000, orderQty: 2, inQty: 2 },
    { yearMonth: '2026-06', inAmount: 600, orderAmount: 1500, orderQty: 3, inQty: 3 },
  ]);
});

test('aggregates native daily graph keys only when the date year is unambiguous', async () => {
  const daily = [{
    product_code: 'SKU-DAILY',
    option_code: '',
    product_name: '일별 상품',
    total_order_amount: 300,
    total_order_qty: 3,
    total_in_amount: 250,
    total_in_qty: 2,
    graph: {
      '9/1': '0,100,1',
      '09/02': '0,200,2',
    },
  }];
  const { result } = await scrape(daily, '2026-09-01', '2026-09-06');

  assert.equal(result.success, true);
  assert.deepEqual(result.payload.products[0].months, [{
    yearMonth: '2026-09',
    inAmount: 250,
    orderAmount: 300,
    orderQty: 3,
    inQty: 2,
  }]);
});

test('rejects a yearless graph date when the selected range contains that date twice', async () => {
  const { result } = await scrape([productRow({
    graph: { '9/1': '0,1000,2' },
    total_order_amount: 1000,
    total_order_qty: 2,
  })], '2025-09-01', '2026-09-06');

  assert.equal(result.success, false);
  assert.equal(result.payload, undefined);
});

test('fails the entire collection for malformed, partial, or oversized provider rows', async () => {
  const invalidResponses = [
    [{ product_code: '', graph: { '2026-06': '1,2,3' } }],
    [{ product_code: 'SKU-1', graph: { '2026-06': '1,not-a-number,3' } }],
    [{ product_code: 'SKU-1', graph: { '2026-13': '1,2,3' } }],
    [{ product_code: 'SKU-1', graph: { '2026-06': '1,2' } }],
    [productRow({ total_order_amount: true })],
    [productRow({ total_order_amount: {} })],
    [productRow({ total_order_qty: null })],
    [{ product_code: 'SKU-1', graph: { '2026-06': '1,2,3', '6/01': '0,0,0' } }],
    [{ product_code: 'SKU-1', graph: [] }],
    Array.from({ length: 20_001 }, (_, index) => ({
      product_code: `SKU-${index}`,
      graph: { '2026-06': '1,2,3' },
    })),
  ];

  for (const response of invalidResponses) {
    const { result } = await scrape(response);
    assert.equal(result.success, false, JSON.stringify(response).slice(0, 200));
    assert.equal(result.payload, undefined);
  }
});

function productRow(overrides = {}) {
  return {
    product_code: 'SKU-1',
    option_code: 'OPTION-1',
    product_name: '상품',
    total_order_amount: 1000,
    total_order_qty: 2,
    total_in_amount: 400,
    total_in_qty: 1,
    graph: { '2026-06': '0,1000,2' },
    ...overrides,
  };
}

test('rejects a missing product instead of manufacturing a zero purchase row', async () => {
  const { result } = await scrape((_body, index) => index === 1
    ? [productRow()]
    : [], '2026-06-01', '2026-06-30');

  assert.equal(result.success, false);
  assert.match(result.error, /구매기간 응답/);
  assert.equal(result.payload, undefined);
});

test('rejects mixed sales snapshots even when the purchase totals reconcile', async () => {
  const { result } = await scrape((_body, index) => index === 1
    ? [productRow()]
    : [productRow({
      total_order_amount: 1100,
      graph: { '2026-06': '0,1100,2' },
    })], '2026-06-01', '2026-06-30');

  assert.equal(result.success, false);
  assert.match(result.error, /구매기간 응답/);
  assert.equal(result.payload, undefined);
});

test('rejects period cost or quantity mismatches without partial output', async () => {
  const { result } = await scrape((_body, index) => index === 1
    ? [productRow()]
    : [productRow({ total_in_amount: 399, total_in_qty: 1 })], '2026-06-01', '2026-06-30');

  assert.equal(result.success, false);
  assert.match(result.error, /구매기간 응답/);
  assert.equal(result.payload, undefined);
});

test('ignores pure Sellpia financial adjustment rows without discarding product evidence', async () => {
  const { result } = await scrape([
    {
      product_code: 'SKU-1',
      option_code: 'OPTION-1',
      product_name: '정상 상품',
      sale_price: 12_000,
      buy_price: 7_000,
      dp_code: '8800000000001',
      total_order_amount: 12_000,
      total_order_qty: 1,
      total_in_amount: 7_000,
      total_in_qty: 1,
      graph: { '2026-06': '7000,12000,1' },
    },
    {
      product_code: '7382',
      option_code: '1',
      product_name: '할인',
      sale_price: 0,
      buy_price: 0,
      dp_code: '',
      graph: { '2026-06': '0,-27225,1' },
    },
  ], '2026-06-01', '2026-06-30');

  assert.equal(result.success, true);
  assert.equal(result.productCount, 1);
  assert.equal(result.skippedAdjustmentCount, 1);
  assert.deepEqual(
    result.payload.products.map((product) => product.productCode),
    ['SKU-1'],
  );
});

test('does not silently drop negative revenue from an inventory-bearing product', async () => {
  const { result } = await scrape([{
    product_code: 'SKU-RETURN',
    option_code: 'OPTION-1',
    product_name: '반품 발생 상품',
    sale_price: 12_000,
    buy_price: 7_000,
    dp_code: '8800000000002',
    graph: { '2026-06': '0,-12000,1' },
  }]);

  assert.equal(result.success, false);
  assert.equal(result.payload, undefined);
});
