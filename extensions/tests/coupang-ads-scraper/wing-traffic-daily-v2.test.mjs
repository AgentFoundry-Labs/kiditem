import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../../kiditem-os/content/coupang/wing-read-api.js", import.meta.url), "utf8");
const expectedAdvertiserId = "A0001";
const dates = ["2026-09-05", "2026-09-06"];

function response(body, { status = 200, contentType = "application/json", ok = true } = {}) {
  return {
    status,
    ok,
    type: "basic",
    headers: { get: name => name.toLowerCase() === "content-type" ? contentType : null },
    text: async () => typeof body === "string" ? body : JSON.stringify(body),
  };
}

function metadata() {
  return {
    dataFreshness: {
      metrics: {
        SALES_DAILY: { latestDataDate: Date.parse("2026-09-06T00:00:00Z") },
        TRAFFIC_DAILY: { latestDataDate: Date.parse("2026-09-06T00:00:00Z") },
      },
    },
    viewablePeriods: { sa: { startDate: "2025-01-01T00:00:00.000Z", endDate: "2027-01-01T00:00:00.000Z" } },
  };
}

function row(id, values = {}) {
  return {
    vendorItemDetails: {
      vendorId: expectedAdvertiserId,
      vendorItemId: id,
      inventoryId: `9${id}`,
      itemName: `옵션 ${id}`,
      productId: `7${id}`,
    },
    businessInsightsMetricsResponse: {
      totalUniqueVisitor: 1,
      totalPageViews: 2,
      totalAddToCart: 3,
      totalOrders: 4,
      totalUnitsSold: 5,
      totalGmv: 600,
      pvToOrder: 0.5,
      uniqueVisitorVariance: 0,
      pageViewsVariance: 0,
      addToCartVariance: 0,
      ordersVariance: 0,
      unitsSoldVariance: 0,
      gmvVariance: 0,
      pvToOrderVariance: 0,
      ...values,
    },
  };
}

function detail(rows, pageNumber = 0, totalResults = rows.length) {
  return response({
    vendorItems: rows,
    paginationDetails: {
      pageSize: 100,
      pageNumber,
      totalResults,
      totalPages: totalResults === 0 ? 0 : Math.ceil(totalResults / 100),
    },
  });
}

function summary(values = {}) {
  return response({ summaryMetrics: {
    totalUniqueVisitor: 1,
    totalPageViews: 2,
    totalAddToCart: 3,
    totalOrders: 4,
    totalUnitsSold: 5,
    totalGmv: 600,
    pvToOrder: 0.25,
    uniqueVisitorVariance: 0,
    pageViewsVariance: 0,
    addToCartVariance: 0,
    ordersVariance: 0,
    unitsSoldVariance: 0,
    gmvVariance: 0,
    pvToOrderVariance: 0,
    ...values,
  } });
}

function harness(responses) {
  const requests = [];
  const queue = [...responses];
  const context = vm.createContext({
    AbortController: class {
      constructor() { this.signal = { aborted: false }; }
      abort() { this.signal.aborted = true; }
    },
    URL,
    URLSearchParams,
    TextEncoder,
    document: { cookie: "XSRF-TOKEN=wing%2Ftoken" },
    location: {
      href: "https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=2026-09-05&end_date=2026-09-06",
      search: "?start_date=2026-09-05&end_date=2026-09-06",
    },
    fetch: async (url, init) => {
      requests.push({ url, init });
      const next = queue.shift();
      if (!next) throw new Error(`missing fixture for ${url}`);
      return next;
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
  });
  vm.runInContext(source, context, { filename: "wing-read-api.js" });
  return { api: context.KidItemWingReadApi, requests };
}

function control(overrides = {}, receipts = []) {
  return {
    attemptId: "11111111-1111-4111-8111-111111111111",
    plan: {
      sourceType: "coupang_wing_traffic",
      parserVersion: "wing-traffic-daily-v2",
      channelAccountId: "33333333-3333-4333-8333-333333333333",
      expectedAdvertiserId,
      providerVendorId: expectedAdvertiserId,
      startDate: dates[0],
      endDate: dates[1],
      businessDate: dates[1],
      periodDays: 2,
      expectedDates: dates,
      filterScope: "ALL_NORMAL_RFM",
      targetUrl: "https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=2026-09-05&end_date=2026-09-06",
      ...overrides,
    },
    receipts,
  };
}

test("Wing traffic daily v2 reads each explicit day, preserves account summaries, and captures one exact period summary", async () => {
  const h = harness([
    response(metadata()),
    detail([row("101")]),
    summary({ totalUniqueVisitor: 155, totalPageViews: 211, totalAddToCart: 20, totalOrders: 6, totalUnitsSold: 19, totalGmv: 21790, pvToOrder: 6 / 211 }),
    detail([row("102", { totalUniqueVisitor: 2, totalPageViews: 3 })]),
    summary({ totalUniqueVisitor: 162, totalPageViews: 205, totalAddToCart: 26, totalOrders: 3, totalUnitsSold: 4, totalGmv: 13970, pvToOrder: 3 / 205 }),
    summary({ totalUniqueVisitor: 1065, totalPageViews: 1391, totalAddToCart: 170, totalOrders: 58, totalUnitsSold: 173, totalGmv: 363200, pvToOrder: 58 / 1391 }),
  ]);
  const result = await h.api.collectTraffic({ control: control() });
  assert.equal(result.success, true);
  assert.deepEqual([...result.expectedDates], dates);
  assert.equal(result.dailyPages.length, 2);
  assert.equal(result.dailyPages[0].accountSummary.visitors, 155);
  assert.equal(result.dailyPages[0].pages[0].accountSummary.providerConversionRate, (6 / 211) * 100);
  assert.equal(result.dailyPages[0].pages[1], undefined);
  assert.equal(result.periodSummary.kind, "period_summary");
  assert.equal(result.periodSummary.accountSummary.revenue, 363200);
  const detailBodies = h.requests.filter(({ url }) => url.includes("vi-detail-search")).map(({ init }) => JSON.parse(init.body));
  assert.deepEqual(detailBodies.map(body => [body.startDate, body.endDate]), [[dates[0], dates[0]], [dates[1], dates[1]]]);
  const summaryBodies = h.requests.filter(({ url }) => url.includes("vendor-summary")).map(({ init }) => JSON.parse(init.body));
  assert.deepEqual(summaryBodies.map(body => [body.startDate, body.endDate]), [[dates[0], dates[0]], [dates[1], dates[1]], dates]);
});

test("Wing traffic daily v2 preserves unavailable provider ratios and variances as null", async () => {
  const h = harness([
    response(metadata()),
    detail([row("101", { pvToOrder: null, uniqueVisitorVariance: undefined })]),
    summary({ pvToOrder: null, uniqueVisitorVariance: undefined }),
    detail([row("102")]),
    summary(),
    summary({ pvToOrder: null, uniqueVisitorVariance: undefined }),
  ]);
  const result = await h.api.collectTraffic({ control: control() });
  assert.equal(result.success, true);
  assert.equal(result.products[0].conversionRate, null);
  assert.equal(result.products[0].changes.visitors, null);
  assert.equal(result.dailyPages[0].accountSummary.providerConversionRate, null);
  assert.equal(result.periodSummary.accountSummary.providerConversionRate, null);
});

test("Wing traffic daily v2 rejects a non-contiguous owner date vector before provider IO", async () => {
  const h = harness([]);
  const result = await h.api.collectTraffic({ control: control({ expectedDates: [dates[1], dates[1]] }) });
  assert.equal(result.success, false);
  assert.equal(result.errorCode, "TRAFFIC_DATE_RANGE_INVALID");
  assert.equal(h.requests.length, 0);
});

test("Wing traffic daily v2 keeps an explicit zero day as a captured page", async () => {
  const h = harness([
    response(metadata()),
    detail([], 0, 0),
    summary({ totalUniqueVisitor: 0, totalPageViews: 0, totalAddToCart: 0, totalOrders: 0, totalUnitsSold: 0, totalGmv: 0, pvToOrder: 0 }),
    detail([row("102")]),
    summary(),
    summary(),
  ]);
  const result = await h.api.collectTraffic({ control: control() });
  assert.equal(result.success, true);
  assert.equal(result.dailyPages[0].pages[0].explicitEmpty, true);
  assert.equal(result.dailyPages[0].accountSummary.visitors, 0);
});

test("Wing traffic daily v2 resumes only missing pages and never re-sends accepted dates", async () => {
  const accepted = [
    {
      sequence: 0,
      kind: "daily_page",
      providerVendorId: expectedAdvertiserId,
      filterScope: "ALL_NORMAL_RFM",
      businessDate: dates[0],
      pageIndex: 1,
      expectedPages: 1,
      terminalPageObserved: true,
    },
    {
      sequence: 100,
      kind: "daily_page",
      providerVendorId: expectedAdvertiserId,
      filterScope: "ALL_NORMAL_RFM",
      businessDate: dates[1],
      pageIndex: 1,
      expectedPages: 2,
      terminalPageObserved: false,
    },
  ];
  const h = harness([
    response(metadata()),
    detail([row("102")], 1, 101),
    summary({ totalUniqueVisitor: 1065, totalPageViews: 1391, totalAddToCart: 170, totalOrders: 58, totalUnitsSold: 173, totalGmv: 363200, pvToOrder: 58 / 1391 }),
  ]);
  const result = await h.api.collectTraffic({ control: control({}, accepted) });
  assert.equal(result.success, true);
  assert.equal(result.dailyPages[0].accepted, true);
  assert.deepEqual([...result.dailyPages[0].pages], []);
  assert.deepEqual([...result.dailyPages[1].pages].map(page => page.pageIndex), [2]);
  const detailBodies = h.requests.filter(({ url }) => url.includes("vi-detail-search")).map(({ init }) => JSON.parse(init.body));
  assert.deepEqual(detailBodies.map(body => [body.startDate, body.endDate, body.pageNumber]), [[dates[1], dates[1], 1]]);
  const summaryBodies = h.requests.filter(({ url }) => url.includes("vendor-summary")).map(({ init }) => JSON.parse(init.body));
  assert.deepEqual(summaryBodies.map(body => [body.startDate, body.endDate]), [dates]);
});

test("Wing traffic daily v2 fails closed when the provider changes accepted pagination", async () => {
  const accepted = [{
    sequence: 0,
    kind: "daily_page",
    providerVendorId: expectedAdvertiserId,
    filterScope: "ALL_NORMAL_RFM",
    businessDate: dates[0],
    pageIndex: 1,
    expectedPages: 1,
    terminalPageObserved: true,
  }, {
    sequence: 100,
    kind: "daily_page",
    providerVendorId: expectedAdvertiserId,
    filterScope: "ALL_NORMAL_RFM",
    businessDate: dates[1],
    pageIndex: 1,
    expectedPages: 2,
    terminalPageObserved: false,
  }];
  const h = harness([
    response(metadata()),
    detail([row("102")], 1, 201),
  ]);
  const result = await h.api.collectTraffic({ control: control({}, accepted) });
  assert.equal(result.success, false);
  assert.equal(result.errorCode, "WING_TRAFFIC_PAGE_CONFLICT");
  assert.deepEqual(
    h.requests.filter(({ url }) => url.includes("vi-detail-search")).map(({ init }) => JSON.parse(init.body).pageNumber),
    [1],
  );
});

test("Wing traffic daily v2 performs no provider IO when every date and the period are already accepted", async () => {
  const accepted = [
    {
      sequence: 0,
      kind: "daily_page",
      providerVendorId: expectedAdvertiserId,
      filterScope: "ALL_NORMAL_RFM",
      businessDate: dates[0],
      pageIndex: 1,
      expectedPages: 1,
      terminalPageObserved: true,
    },
    {
      sequence: 100,
      kind: "daily_page",
      providerVendorId: expectedAdvertiserId,
      filterScope: "ALL_NORMAL_RFM",
      businessDate: dates[1],
      pageIndex: 1,
      expectedPages: 1,
      terminalPageObserved: true,
    },
    {
      sequence: 200,
      kind: "period_summary",
      providerVendorId: expectedAdvertiserId,
      filterScope: "ALL_NORMAL_RFM",
      startDate: dates[0],
      endDate: dates[1],
      period: 2,
    },
  ];
  const h = harness([]);
  const result = await h.api.collectTraffic({ control: control({}, accepted) });
  assert.equal(result.success, true);
  assert.equal(result.periodSummary, null);
  assert.equal(result.periodSummaryAccepted, true);
  assert.equal(result.dailyPages.every((day) => day.accepted === true), true);
  assert.equal(h.requests.length, 0);
});

test("Wing traffic daily v2 collects the days the provider published and declares that window", async () => {
  // Traffic published through the 5th, sales through the 6th. The window asked
  // for both days; the second is not there yet. Collecting the first is the
  // point — discarding it for the sake of the second is what made traffic
  // effectively uncollectable.
  const stale = metadata();
  stale.dataFreshness.metrics.TRAFFIC_DAILY.latestDataDate = Date.parse("2026-09-05T00:00:00Z");
  const h = harness([
    response(stale),
    detail([row("101")]),
    summary({ totalUniqueVisitor: 155, totalPageViews: 211, totalAddToCart: 20, totalOrders: 6, totalUnitsSold: 19, totalGmv: 21790, pvToOrder: 6 / 211 }),
    summary({ totalUniqueVisitor: 155, totalPageViews: 211, totalAddToCart: 20, totalOrders: 6, totalUnitsSold: 19, totalGmv: 21790, pvToOrder: 6 / 211 }),
  ]);

  const result = await h.api.collectTraffic({ control: control() });

  assert.equal(result.success, true);
  // Only the confirmed day is collected, and only it is claimed.
  assert.deepEqual([...result.confirmedDates], [dates[0]]);
  assert.equal(result.dailyPages.length, 1);
  assert.equal(result.dailyPages[0].businessDate, dates[0]);
  // The plan's date vector is untouched: receipt sequences are numbered off it,
  // so narrowing it would renumber the days that remain.
  assert.deepEqual([...result.expectedDates], dates);
  // The period summary declares the confirmed window — the owner reads that
  // declaration as the run's coverage.
  assert.equal(result.periodSummary.startDate, dates[0]);
  assert.equal(result.periodSummary.endDate, dates[0]);
  assert.equal(result.periodSummary.period, 1);
  const detailBodies = h.requests.filter(({ url }) => url.includes("vi-detail-search")).map(({ init }) => JSON.parse(init.body));
  assert.deepEqual(detailBodies.map((body) => [body.startDate, body.endDate]), [[dates[0], dates[0]]]);
  const summaryBodies = h.requests.filter(({ url }) => url.includes("vendor-summary")).map(({ init }) => JSON.parse(init.body));
  assert.deepEqual(summaryBodies.map((body) => [body.startDate, body.endDate]), [[dates[0], dates[0]], [dates[0], dates[0]]]);
});

test("Wing traffic daily v2 refuses only when the provider published nothing in the window", async () => {
  const before = metadata();
  before.dataFreshness.metrics.TRAFFIC_DAILY.latestDataDate = Date.parse("2026-09-04T00:00:00Z");
  const h = harness([response(before)]);

  const result = await h.api.collectTraffic({ control: control() });

  assert.equal(result.success, false);
  assert.equal(result.errorCode, "WING_TRAFFIC_DATA_NOT_READY");
  assert.equal(h.requests.length, 1);
  assert.ok(!/[A-Z]{3,}_[A-Z_]+/.test(result.error), result.error);
});
