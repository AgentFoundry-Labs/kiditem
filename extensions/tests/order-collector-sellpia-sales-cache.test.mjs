import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const worker = readFileSync(
  new URL('../kiditem-os/background/orders/worker.js', import.meta.url),
  'utf8',
);
const collectorSource = readFileSync(
  new URL('../kiditem-os/background/orders/sellpia-sales-collector.js', import.meta.url),
  'utf8',
);

function createSalesHarness({
  responseBody,
  providerNames = {},
  now = '2026-07-18T03:00:00.000Z',
  activeSequence = null,
} = {}) {
  const requests = [];
  const attachedTabs = [];
  const detachedTabs = [];
  const removedTabs = [];
  let activeChecks = 0;
  const NativeDate = Date;
  class FixedDate extends NativeDate {
    constructor(...args) {
      super(args.length === 0 ? now : args[0]);
    }

    static now() {
      return new NativeDate(now).getTime();
    }
  }

  const chrome = {
    tabs: {
      query: async () => [],
      create: async (properties) => ({
        id: 19,
        windowId: 4,
        status: 'complete',
        ...properties,
      }),
      remove: async (tabId) => removedTabs.push(tabId),
    },
    scripting: {
      executeScript: async ({ func, args }) => {
        const pageContext = vm.createContext({
          Date: FixedDate,
          JSON,
          Number,
          Object,
          Promise,
          String,
          URLSearchParams,
          provider_list_all: providerNames,
          setTimeout,
          clearTimeout,
          fetch: async (_url, init) => {
            const body = new URLSearchParams(String(init?.body ?? ''));
            requests.push(body);
            return {
              ok: true,
              status: 200,
              text: async () => JSON.stringify(responseBody),
            };
          },
        });
        const result = await vm.runInContext(
          `(${func.toString()})(...args)`,
          vm.createContext({ ...pageContext, args }),
        );
        return [{ result }];
      },
    },
  };
  const context = vm.createContext({
    Date,
    Error,
    Promise,
    String,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(collectorSource, context, { filename: 'sellpia-sales-collector.js' });
  const collection = {
    attachTab: async (tab) => {
      attachedTabs.push(tab);
      return { attemptId: '11111111-1111-4111-8111-111111111111' };
    },
    assertActive: async () => {
      if (!activeSequence) return true;
      const index = Math.min(activeChecks++, activeSequence.length - 1);
      return activeSequence[index];
    },
    detachTab: async (tab) => {
      detachedTabs.push(tab);
      await chrome.tabs.remove(tab.id);
    },
  };
  const collector = context.KidItemSellpiaSalesCollector.create({
    chrome,
    waitForTabReady: async () => undefined,
    withTimeout: async (operation) => operation,
    isMallAccessError: () => false,
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
    attachedTabs,
    detachedTabs,
    removedTabs,
    get activeChecks() { return activeChecks; },
  };
}

async function scrape(responseBody, providerNames = {}) {
  const harness = createSalesHarness({ responseBody, providerNames });
  const result = await harness.collector.collect({
    startDate: '2026-07-17',
    endDate: '2026-07-18',
    collection: harness.collection,
  });
  return {
    result: JSON.parse(JSON.stringify(result)),
    requests: harness.requests,
    attachedTabs: harness.attachedTabs,
    detachedTabs: harness.detachedTabs,
    removedTabs: harness.removedTabs,
  };
}

test('Sellpia sales uses the source owner and collector and has no automatic cache or alarm path', () => {
  assert.match(worker, /collectSellpiaSaleSummary:\s*\{\s*validate: KidItemSellpiaSalesSourceOwner\.parseAction/s);
  assert.match(worker, /const sellpiaSalesCollector = KidItemSellpiaSalesCollector\.create/);
  assert.match(worker, /sellpiaSalesCollector\.collect/);
  assert.match(worker, /collectSellpiaSaleSummaryAuthoritativeV1:\s*true/);
  assert.doesNotMatch(worker, /SELLPIA_SALES_(CACHE|ALARM|ORGANIZATION)/);
  assert.doesNotMatch(worker, /chrome\.alarms\.onAlarm/);
});

test('Sellpia sales fences provider execution after the owner is cancelled', async () => {
  const harness = createSalesHarness({
    responseBody: {},
    activeSequence: [true, false],
  });
  const result = await harness.collector.collect({ collection: harness.collection });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: false,
    errorCode: 'COLLECTION_CANCELLED',
    error: 'Sellpia sales collection is no longer active.',
  });
  assert.equal(harness.activeChecks, 2);
  assert.deepEqual(harness.removedTabs, [19]);
  assert.equal(harness.requests.length, 0);
});

test('sale_summary parser accepts complete seller rows and keeps numeric zeroes', async () => {
  const { result, attachedTabs, detachedTabs, removedTabs } = await scrape(
    {
      118: {
        '2026-07-17': {
          price: '1,200',
          amount: '0',
          buy_price: 700,
          extra_metric: 'allowed',
        },
      },
    },
    { 118: '스마트스토어' },
  );

  assert.equal(result.success, true);
  assert.deepEqual(attachedTabs.map((tab) => tab.id), [19]);
  assert.deepEqual(detachedTabs.map((tab) => tab.id), [19]);
  assert.deepEqual(removedTabs, [19]);
  assert.equal(result.payload.sellers.length, 1);
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.payload.sellers[0])),
    {
      sellerId: '118',
      sellerName: '스마트스토어',
      days: [{ date: '2026-07-17', price: 1200, amount: 0, buyPrice: 700 }],
    },
  );
  assert.equal(result.payload.provenance, undefined);
});

test('only a structurally empty seller object produces explicit-empty provenance', async () => {
  const { result } = await scrape({});

  assert.equal(result.success, true);
  assert.deepEqual(JSON.parse(JSON.stringify(result.payload)), {
    range: { from: '2026-07-17', to: '2026-07-18' },
    sellers: [],
    provenance: {
      source: 'sellpia_sale_summary',
      mode: 'selldate',
      sellerScope: 'all',
      responseShape: 'empty_object',
      explicitEmpty: true,
    },
  });
});

test('error envelopes, arrays, null, and unknown seller keys fail closed', async () => {
  for (const responseBody of [
    null,
    [],
    { success: false, error: 'login required' },
    { filtered: {} },
    { constructor: { '2026-07-17': { price: 1, amount: 1, buy_price: 1 } } },
    { 999: { '2026-07-17': { price: 1, amount: 1, buy_price: 1 } } },
  ]) {
    const { result } = await scrape(responseBody, { 118: '스마트스토어' });
    assert.equal(result.success, false, JSON.stringify(responseBody));
    assert.equal(result.payload, undefined, JSON.stringify(responseBody));
  }
});

test('partial seller/day responses fail as a whole instead of being silently skipped', async () => {
  const partialResponses = [
    { 118: {} },
    { 118: { summary: { price: 1, amount: 1, buy_price: 1 } } },
    { 118: { '2026-07-16': { price: 1, amount: 1, buy_price: 1 } } },
    { 118: { '2026-07-17': { price: 1, amount: 1 } } },
    { 118: { '2026-07-17': { price: 'N/A', amount: 1, buy_price: 1 } } },
    {
      118: {
        '2026-07-17': { price: 1, amount: 1, buy_price: 1 },
        '2026-02-30': { price: 1, amount: 1, buy_price: 1 },
      },
    },
  ];

  for (const responseBody of partialResponses) {
    const { result } = await scrape(responseBody, { 118: '스마트스토어' });
    assert.equal(result.success, false, JSON.stringify(responseBody));
    assert.equal(result.payload, undefined, JSON.stringify(responseBody));
  }
});
