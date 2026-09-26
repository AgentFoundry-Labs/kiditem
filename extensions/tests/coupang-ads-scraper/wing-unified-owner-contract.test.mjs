import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(
  new URL('../../kiditem-os/content/coupang/wing-unified.js', import.meta.url),
  'utf8',
);

const attemptId = '11111111-1111-4111-8111-111111111111';
const control = (plan) => ({ attemptId, plan });

function baseContext({ href, pageType, onMessage, querySelector, querySelectorAll }) {
  let listener = null;
  const location = { href, pathname: new URL(href).pathname, search: new URL(href).search, hash: '' };
  class FakeMutationObserver { observe() {} disconnect() {} }
  const context = vm.createContext({
    chrome: {
      runtime: {
        lastError: null,
        onMessage: { addListener(next) { listener = next; } },
        sendMessage(message, callback) {
          onMessage(message, callback);
        },
      },
      storage: { local: { set() {} } },
    },
    console,
    document: {
      addEventListener() {},
      body: {},
      title: pageType,
      visibilityState: 'visible',
      querySelector: querySelector || (() => null),
      querySelectorAll: querySelectorAll || (() => []),
    },
    location,
    MutationObserver: FakeMutationObserver,
    URL,
    URLSearchParams,
    setTimeout(callback, delay) {
      if (delay !== 4000) callback();
      return 0;
    },
    clearTimeout() {},
    showBadge() {},
  });
  context.window = context;
  context.window.location = location;
  vm.runInContext('globalThis.KidItemWingAccountIdentity = { verifyExpectedVendorId: value => ({ ok: true, vendorId: value, source: "test:observed" }) };', context);
  vm.runInContext(source, context, { filename: 'wing-unified.js' });
  return {
    context,
    manual(message) {
      return new Promise(resolve => {
        assert.equal(listener(message, {}, resolve), true);
      });
    },
  };
}

test('Wing traffic owner mode sends a receipt with observed pagination proof and no legacy sync', async () => {
  const sent = [];
  const context = baseContext({
    href: 'https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=2026-09-05&end_date=2026-09-06',
    pageType: 'sales-analysis',
    onMessage(message, callback) {
      sent.push(message);
      if (message.action === 'wingTrafficSourceStep') callback({ success: true, trafficReceipt: { sequence: 0, pageIndex: 1 } });
      else callback({ success: false, error: 'legacy path should not be used' });
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  });
  const apiRow = {
    vendorItemId: '11',
    optionId: '11',
    inventoryId: '22',
    productId: '22',
    productName: 'API 상품 옵션',
    visitors: 1,
    views: 2,
    cartAdds: 3,
    orders: 4,
    salesQty: 5,
    revenue: 600,
    conversionRate: 50,
    changes: { visitors: -1, views: 2, cartAdds: -3, orders: 4, unitSold: -5, revenue: 6, conversion: -0.5 },
  };
  let apiCalls = 0;
  context.context.KidItemWingReadApi = {
    async collectTraffic({ control: observedControl }) {
      apiCalls += 1;
      assert.equal(observedControl.plan.expectedAdvertiserId, 'A0001');
      return {
        success: true,
        products: [apiRow],
        pages: [{ pageIndex: 1, data: [apiRow], url: 'https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=2026-09-05&end_date=2026-09-06' }],
        expectedPages: 1,
        terminalPageObserved: true,
        complete: true,
        gridReady: true,
        kpis: {
          visitor: { value: '1', numValue: 1, change: '-1' },
          pageView: { value: '2', numValue: 2, change: '2' },
          addToCart: { value: '3', numValue: 3, change: '-3' },
          order: { value: '4', numValue: 4, change: '4' },
          conversion: { value: '50', numValue: 50, change: '-0.5' },
          unitSold: { value: '5', numValue: 5, change: '-5' },
          sales: { value: '600', numValue: 600, change: '6' },
        },
        summary: { visitors: 1, views: 2, cartAdds: 3, orders: 4, salesQty: 5, revenue: 600, conversionRate: 25 },
      };
    },
  };
  const result = await context.manual({
    action: 'manualSync',
    syncMode: 'wing_traffic',
    wingTrafficControl: control({
      expectedAdvertiserId: 'A0001',
      startDate: '2026-09-05',
      endDate: '2026-09-06',
      periodDays: 2,
    }),
  });
  assert.equal(result.success, true);
  assert.equal(apiCalls, 1);
  assert.equal(sent.filter(message => message.action === 'syncToServer').length, 0);
  const receipts = sent.filter(message => message.action === 'wingTrafficSourceStep');
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].body.data[0].productName, 'API 상품 옵션');
  assert.equal(receipts[0].body.summary.revenue, 600);
  assert.deepEqual(JSON.parse(JSON.stringify(receipts[0].body.proof)), {
    expectedPages: 1,
    visitedPages: [1],
    terminalPageObserved: true,
    verified: true,
    complete: true,
  });
});

test('Wing traffic resume replays accepted pages and stops on an owner checksum conflict', async () => {
  const sent = [];
  let phase = 'initial';
  let apiCalls = 0;
  let firstPayload = null;
  let firstCapturedAt = null;
  const pageUrl = 'https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=2026-09-05&end_date=2026-09-06';
  const originalRow = {
    vendorItemId: '11',
    optionId: '11',
    inventoryId: '22',
    productId: '22',
    productName: '원본 상품 옵션',
    visitors: 1,
    views: 2,
    cartAdds: 3,
    orders: 4,
    salesQty: 5,
    revenue: 600,
    conversionRate: 50,
    changes: { visitors: -1, views: 2, cartAdds: -3, orders: 4, unitSold: -5, revenue: 6, conversion: -0.5 },
  };
  const changedRow = { ...originalRow, productName: '변경된 상품 옵션' };
  const secondRow = { ...originalRow, vendorItemId: '12', optionId: '12', productName: '두 번째 상품 옵션' };
  const kpis = {
    visitor: { value: '1', numValue: 1, change: '-1' },
    pageView: { value: '2', numValue: 2, change: '2' },
    addToCart: { value: '3', numValue: 3, change: '-3' },
    order: { value: '4', numValue: 4, change: '4' },
    conversion: { value: '50', numValue: 50, change: '-0.5' },
    unitSold: { value: '5', numValue: 5, change: '-5' },
    sales: { value: '600', numValue: 600, change: '6' },
  };
  const summary = { visitors: 1, views: 2, cartAdds: 3, orders: 4, salesQty: 5, revenue: 600, conversionRate: 25 };
  const capture = (rows) => ({
    success: true,
    products: rows,
    pages: rows.map((row, index) => ({ pageIndex: index + 1, data: [row], url: pageUrl })),
    expectedPages: rows.length,
    terminalPageObserved: true,
    complete: true,
    gridReady: true,
    kpis,
    summary,
  });
  const context = baseContext({
    href: pageUrl,
    pageType: 'sales-analysis',
    onMessage(message, callback) {
      if (message.action !== 'wingTrafficSourceStep') {
        callback({ success: false, error: 'legacy path should not be used' });
        return;
      }
      sent.push(message);
      const payload = JSON.stringify(message.body);
      if (phase === 'initial') {
        firstPayload = payload;
        firstCapturedAt = message.body.capturedAt;
        callback({ success: true, trafficReceipt: { sequence: 0, pageIndex: 1, capturedAt: firstCapturedAt } });
        return;
      }
      if (phase === 'same-replay') {
        assert.equal(payload, firstPayload, 'an accepted page must replay the exact body');
        callback({ success: true, trafficReceipt: { sequence: 0, pageIndex: 1, capturedAt: firstCapturedAt } });
        return;
      }
      assert.equal(message.body.pageIndex, 1, 'the changed accepted page must be checked first');
      assert.notEqual(payload, firstPayload, 'changed page data must not be skipped');
      callback({ success: false, errorCode: 'SOURCE_OWNER_UNAVAILABLE', error: 'owner checksum conflict' });
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  });
  context.context.KidItemWingReadApi = {
    async collectTraffic() {
      apiCalls += 1;
      return apiCalls < 3 ? capture([originalRow]) : capture([changedRow, secondRow]);
    },
  };
  const plan = {
    expectedAdvertiserId: 'A0001',
    startDate: '2026-09-05',
    endDate: '2026-09-06',
    periodDays: 2,
  };
  const manual = (receipts = []) => context.manual({
    action: 'manualSync',
    syncMode: 'wing_traffic',
    wingTrafficControl: { ...control(plan), receipts },
  });

  const first = await manual();
  assert.equal(first.success, true);
  assert.equal(firstPayload !== null, true);

  phase = 'same-replay';
  const sameReplay = await manual([{ sequence: 0, pageIndex: 1, capturedAt: firstCapturedAt }]);
  assert.equal(sameReplay.success, true);
  assert.equal(sent.map((message) => message.body.pageIndex).join(','), '1,1');

  phase = 'changed-replay';
  const changedReplay = await manual([{ sequence: 0, pageIndex: 1, capturedAt: firstCapturedAt }]);
  assert.equal(changedReplay.success, false);
  assert.equal(changedReplay.errorCode, 'SOURCE_OWNER_UNAVAILABLE');
  assert.equal(sent.slice(2).every((message) => message.body.pageIndex === 1), true, 'retries must keep checking the conflicting page');
  assert.equal(sent.some((message) => message.body.pageIndex === 2), false, 'page 2 must not be published after page 1 conflict');
});

test('Wing traffic daily v2 skips accepted dates and timestamps only newly captured pages', async () => {
  const sent = [];
  const date = '2026-09-06';
  const pageUrl = `https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=${date}&end_date=${date}`;
  const accountSummary = {
    visitors: 10,
    views: 20,
    cartAdds: 3,
    orders: 2,
    salesQty: 2,
    revenue: 300,
    providerConversionRate: 10,
  };
  const row = { vendorItemId: '11', externalOptionId: '11', visitors: 10, views: 20, orders: 2, revenue: 300 };
  const plan = {
    sourceType: 'coupang_wing_traffic',
    parserVersion: 'wing-traffic-daily-v2',
    channelAccountId: '33333333-3333-4333-8333-333333333333',
    expectedAdvertiserId: 'A0001',
    providerVendorId: 'A0001',
    startDate: date,
    endDate: date,
    businessDate: date,
    periodDays: 1,
    expectedDates: [date],
    filterScope: 'ALL_NORMAL_RFM',
    targetUrl: pageUrl,
  };
  const dailyPage = (pageIndex, expectedPages, acceptedPageCount, includeSummary) => ({
    businessDate: date,
    pages: [{ pageIndex, data: [row], url: pageUrl }],
    expectedPages,
    acceptedPageCount,
    terminalPageObserved: true,
    complete: true,
    ...(includeSummary ? { accountSummary, accountSummaryRaw: { raw: true } } : {}),
  });
  const fullCapture = {
    success: true,
    parserVersion: 'wing-traffic-daily-v2',
    filterScope: 'ALL_NORMAL_RFM',
    expectedDates: [date],
    confirmedDates: [date],
    products: [row],
    pages: [{ pageIndex: 1, data: [row], url: pageUrl }],
    dailyPages: [{
      ...dailyPage(1, 1, 0, true),
      pages: [{ pageIndex: 1, data: [row], url: pageUrl }],
    }],
    periodSummary: {
      kind: 'period_summary', startDate: date, endDate: date, period: 1,
      providerVendorId: 'A0001', filterScope: 'ALL_NORMAL_RFM', url: pageUrl,
      accountSummary, accountSummaryRaw: { raw: true },
    },
    periodSummaryAccepted: false,
    gridReady: true,
  };
  const acceptedCapture = {
    ...fullCapture,
    products: [],
    pages: [],
    dailyPages: [{ businessDate: date, pages: [], expectedPages: 1, acceptedPageCount: 1, terminalPageObserved: true, complete: true }],
    periodSummary: null,
    periodSummaryAccepted: true,
  };
  const partialCapture = {
    ...fullCapture,
    products: [row],
    pages: [{ pageIndex: 2, data: [row], url: pageUrl }],
    dailyPages: [dailyPage(2, 2, 1, false)],
    periodSummary: fullCapture.periodSummary,
    periodSummaryAccepted: false,
  };
  const captures = [fullCapture, acceptedCapture, partialCapture];
  const context = baseContext({
    href: pageUrl,
    pageType: 'sales-analysis',
    onMessage(message, callback) {
      assert.equal(message.action, 'wingTrafficSourceStepV2');
      sent.push(message);
      callback({ success: true, trafficReceipt: { sequence: message.body.kind === 'period_summary' ? 100 : message.body.pageIndex - 1, capturedAt: message.body.capturedAt } });
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  });
  let apiCalls = 0;
  context.context.KidItemWingReadApi = {
    async collectTraffic() {
      return captures[apiCalls++];
    },
  };
  const manual = (receipts = []) => context.manual({
    action: 'manualSync',
    syncMode: 'wing_traffic',
    wingTrafficControl: { ...control(plan), receipts },
  });
  const first = await manual();
  assert.equal(first.success, true);
  assert.equal(sent.length, 2);
  const firstCapturedAt = sent[0].body.capturedAt;
  const replay = await manual([
    { sequence: 0, kind: 'daily_page', pageIndex: 1, expectedPages: 1, terminalPageObserved: true, businessDate: date, capturedAt: firstCapturedAt },
    { sequence: 100, kind: 'period_summary', startDate: date, endDate: date, period: 1, capturedAt: firstCapturedAt },
  ]);
  assert.equal(replay.success, true);
  assert.equal(sent.length, 2, 'a complete accepted daily/period capture emits no duplicate receipts');
  const partial = await manual([
    { sequence: 0, kind: 'daily_page', pageIndex: 1, expectedPages: 2, terminalPageObserved: false, businessDate: date, capturedAt: firstCapturedAt },
  ]);
  assert.equal(partial.success, true);
  assert.equal(sent.length, 4);
  assert.equal(sent[2].body.pageIndex, 2);
  assert.equal(sent[2].body.accountSummary, undefined);
  assert.notEqual(sent[2].body.capturedAt, firstCapturedAt, 'newly captured page must not reuse an accepted timestamp');
  assert.equal(sent[3].body.kind, 'period_summary');
});

/**
 * Coupang publishes traffic a day behind its sales, so the last day of a
 * "through yesterday" window is routinely unpublished. The capture narrows to
 * what the provider confirmed and declares that window; this hand-off used to
 * count the days it received against the days *requested* and refuse the whole
 * window — `Wing 트래픽 일별 날짜가 일부 누락되었습니다.` for a day nobody claimed.
 * It then re-stated the plan's window on the period summary, which the owner
 * reads as the run's coverage, so passing the count would have claimed coverage
 * for that same unpublished day. Opposite errors, one cause: the declaration
 * was ignored in both directions.
 */
test('Wing traffic daily v2 hands over the confirmed window, not the requested one', async () => {
  const confirmed = ['2026-09-09', '2026-09-10'];
  const requested = [...confirmed, '2026-09-11'];
  const pageUrl = 'https://wing.coupang.com/tenants/business-insight/sales-analysis'
    + '?start_date=2026-09-09&end_date=2026-09-11';
  const row = { vendorItemId: '11', externalOptionId: '11', visitors: 10, views: 20, orders: 2, revenue: 300 };
  const accountSummary = { visitors: 10, views: 20, cartAdds: 3, orders: 2, salesQty: 2, revenue: 300, providerConversionRate: 10 };
  const plan = {
    sourceType: 'coupang_wing_traffic',
    parserVersion: 'wing-traffic-daily-v2',
    channelAccountId: '33333333-3333-4333-8333-333333333333',
    expectedAdvertiserId: 'A0001',
    providerVendorId: 'A0001',
    startDate: '2026-09-09',
    endDate: '2026-09-11',
    businessDate: '2026-09-11',
    periodDays: 3,
    // Deliberately the full requested vector: receipt sequences are numbered
    // off it, so narrowing it would renumber days an earlier attempt accepted.
    expectedDates: requested,
    filterScope: 'ALL_NORMAL_RFM',
    targetUrl: pageUrl,
  };
  const capture = {
    success: true,
    parserVersion: 'wing-traffic-daily-v2',
    filterScope: 'ALL_NORMAL_RFM',
    expectedDates: requested,
    confirmedDates: confirmed,
    products: [row],
    pages: confirmed.map(() => ({ pageIndex: 1, data: [row], url: pageUrl })),
    dailyPages: confirmed.map((businessDate, index) => ({
      businessDate,
      pages: [{ pageIndex: 1, data: [row], url: pageUrl }],
      expectedPages: 1,
      acceptedPageCount: 0,
      terminalPageObserved: true,
      complete: true,
      ...(index === 0 ? { accountSummary, accountSummaryRaw: { raw: true } } : {}),
    })),
    periodSummary: {
      kind: 'period_summary',
      startDate: confirmed[0],
      endDate: confirmed.at(-1),
      period: confirmed.length,
      providerVendorId: 'A0001',
      filterScope: 'ALL_NORMAL_RFM',
      url: pageUrl,
      accountSummary,
      accountSummaryRaw: { raw: true },
    },
    periodSummaryAccepted: false,
    gridReady: true,
  };
  const sent = [];
  const context = baseContext({
    href: pageUrl,
    pageType: 'sales-analysis',
    onMessage(message, callback) {
      sent.push(message);
      callback({ success: true, trafficReceipt: { sequence: sent.length, capturedAt: message.body.capturedAt } });
    },
  });
  context.context.KidItemWingReadApi = { async collectTraffic() { return capture; } };

  const result = await context.manual({
    action: 'manualSync',
    syncMode: 'wing_traffic',
    wingTrafficControl: { ...control(plan), receipts: [] },
  });

  assert.equal(result.success, true, 'an unpublished later day is not a missing day');
  assert.deepEqual(
    sent.filter((m) => m.body.kind === 'daily_page').map((m) => m.body.businessDate),
    confirmed,
    'every confirmed day is handed over, and no day outside the confirmed window is',
  );
  const period = sent.find((m) => m.body.kind === 'period_summary');
  assert.deepEqual(
    { startDate: period.body.startDate, endDate: period.body.endDate, period: period.body.period },
    { startDate: confirmed[0], endDate: confirmed.at(-1), period: confirmed.length },
    'the summary declares the confirmed window, which the owner records as coverage',
  );
  assert.ok(
    period.body.key.endsWith(`${confirmed[0]}:${confirmed.at(-1)}`),
    'the receipt key is keyed on the declared window too, or a later wider run collides with it',
  );
});

test('Wing traffic daily v2 still refuses a confirmed day it did not collect', async () => {
  const pageUrl = 'https://wing.coupang.com/tenants/business-insight/sales-analysis'
    + '?start_date=2026-09-09&end_date=2026-09-10';
  const row = { vendorItemId: '11', externalOptionId: '11', visitors: 10, views: 20, orders: 2, revenue: 300 };
  const plan = {
    sourceType: 'coupang_wing_traffic',
    parserVersion: 'wing-traffic-daily-v2',
    channelAccountId: '33333333-3333-4333-8333-333333333333',
    expectedAdvertiserId: 'A0001',
    providerVendorId: 'A0001',
    startDate: '2026-09-09',
    endDate: '2026-09-10',
    businessDate: '2026-09-10',
    periodDays: 2,
    expectedDates: ['2026-09-09', '2026-09-10'],
    filterScope: 'ALL_NORMAL_RFM',
    targetUrl: pageUrl,
  };
  const capture = {
    success: true,
    parserVersion: 'wing-traffic-daily-v2',
    filterScope: 'ALL_NORMAL_RFM',
    expectedDates: ['2026-09-09', '2026-09-10'],
    // Claims both days, delivers one. That is an incomplete collection, which
    // narrowing must never be allowed to disguise.
    confirmedDates: ['2026-09-09', '2026-09-10'],
    products: [row],
    pages: [{ pageIndex: 1, data: [row], url: pageUrl }],
    dailyPages: [{
      businessDate: '2026-09-09',
      pages: [{ pageIndex: 1, data: [row], url: pageUrl }],
      expectedPages: 1,
      acceptedPageCount: 0,
      terminalPageObserved: true,
      complete: true,
    }],
    periodSummary: {
      kind: 'period_summary', startDate: '2026-09-09', endDate: '2026-09-10', period: 2,
      providerVendorId: 'A0001', filterScope: 'ALL_NORMAL_RFM', url: pageUrl,
      accountSummary: {}, accountSummaryRaw: {},
    },
    periodSummaryAccepted: false,
    gridReady: true,
  };
  const context = baseContext({
    href: pageUrl,
    pageType: 'sales-analysis',
    onMessage(message, callback) { callback({ success: true, trafficReceipt: { sequence: 1, capturedAt: message.body.capturedAt } }); },
  });
  context.context.KidItemWingReadApi = { async collectTraffic() { return capture; } };

  const result = await context.manual({
    action: 'manualSync',
    syncMode: 'wing_traffic',
    wingTrafficControl: { ...control(plan), receipts: [] },
  });

  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'INCOMPLETE_TRAFFIC_COVERAGE');
});
