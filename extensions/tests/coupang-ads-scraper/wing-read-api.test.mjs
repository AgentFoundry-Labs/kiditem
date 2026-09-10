import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL("../../kiditem-os/content/coupang/wing-read-api.js", import.meta.url),
  "utf8",
);

const attemptId = "11111111-1111-4111-8111-111111111111";
const expectedAdvertiserId = "A0001";
const ownerControl = (startDate = "2026-09-05", endDate = "2026-09-06") => ({
  attemptId,
  plan: {
    expectedAdvertiserId,
    startDate,
    endDate,
    periodDays: 2,
  },
});

function metadata() {
  return {
    isSubscribed: false,
    dataFreshness: {
      metrics: {
        SALES_DAILY: { latestDataDate: Date.parse("2026-09-06T00:00:00Z") },
        TRAFFIC_DAILY: { latestDataDate: Date.parse("2026-09-06T00:00:00Z") },
      },
    },
    viewablePeriods: {
      sa: {
        startDate: "2025-09-08T15:00:00.000Z",
        endDate: "2026-09-08T14:59:59.000Z",
      },
    },
  };
}

function row(id, values = {}) {
  return {
    vendorItemDetails: {
      vendorId: expectedAdvertiserId,
      vendorItemId: id,
      inventoryId: 9000000000 + id,
      itemName: `옵션 ${id}`,
      productName: `상품 ${id}`,
      productId: 7000000000 + id,
    },
    businessInsightsMetricsResponse: {
      totalUniqueVisitor: 1,
      totalPageViews: 2,
      totalAddToCart: 3,
      totalOrders: 4,
      totalUnitsSold: 5,
      totalGmv: 600,
      pvToOrder: 0.5,
      uniqueVisitorVariance: -1,
      pageViewsVariance: 2,
      addToCartVariance: -3,
      ordersVariance: 4,
      unitsSoldVariance: -5,
      gmvVariance: 6,
      pvToOrderVariance: -0.5,
      ...values,
    },
  };
}

function summaryFor(rows) {
  const totals = rows.reduce((value, current) => {
    const metrics = current.businessInsightsMetricsResponse;
    value.totalUniqueVisitor += metrics.totalUniqueVisitor;
    value.totalPageViews += metrics.totalPageViews;
    value.totalAddToCart += metrics.totalAddToCart;
    value.totalOrders += metrics.totalOrders;
    value.totalUnitsSold += metrics.totalUnitsSold;
    value.totalGmv += metrics.totalGmv;
    return value;
  }, {
    totalUniqueVisitor: 0,
    totalPageViews: 0,
    totalAddToCart: 0,
    totalOrders: 0,
    totalUnitsSold: 0,
    totalGmv: 0,
  });
  return {
    summaryMetrics: {
      ...totals,
      pvToOrder: 0.25,
      uniqueVisitorVariance: -10,
      pageViewsVariance: 11,
      addToCartVariance: -12,
      ordersVariance: 13,
      unitsSoldVariance: -14,
      gmvVariance: 15,
      pvToOrderVariance: -16,
    },
  };
}

function response(body, { status = 200, contentType = "application/json", ok = status >= 200 && status < 300, type = "basic" } = {}) {
  return {
    status,
    ok,
    type,
    headers: { get: (name) => name.toLowerCase() === "content-type" ? contentType : null },
    text: async () => typeof body === "string" ? body : JSON.stringify(body),
  };
}

function createHarness({ responses, cookie = "locale=ko_KR; XSRF-TOKEN=wing%2Ftoken%3D", pageLocation } = {}) {
  const requests = [];
  class FakeAbortController {
    constructor() {
      this.signal = { aborted: false };
    }
    abort() {
      this.signal.aborted = true;
    }
  }
  const context = vm.createContext({
    AbortController: FakeAbortController,
    URL,
    URLSearchParams,
    document: { cookie },
    location: pageLocation || {
      href: "https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=2026-09-05&end_date=2026-09-06",
      search: "?start_date=2026-09-05&end_date=2026-09-06",
    },
    fetch: async (url, init) => {
      requests.push({ url, init });
      const next = responses.shift();
      if (next instanceof Error) throw next;
      if (!next) throw new Error("missing fixture response");
      return next;
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
  });
  vm.runInContext(source, context, { filename: "wing-read-api.js" });
  return { api: context.KidItemWingReadApi, requests };
}

function detailPage(pageNumber, rows, totalResults, totalPages) {
  return response({
    vendorItems: rows,
    soldVICount: 0,
    paginationDetails: {
      pageSize: 100,
      pageNumber,
      totalResults,
      totalPages,
    },
  });
}

function itemwinnerLocation(search = "") {
  return {
    href: `https://wing.coupang.com/tenants/seller-price-management${search}`,
    search,
  };
}

function itemwinnerRow(id, values = {}) {
  return {
    vendorItemId: id,
    productName: `상품 ${id}`,
    winnerStatus: true,
    suppressed: false,
    currentPrice: "1000",
    winnerPrice: "900",
    myViSales: "2",
    ...values,
  };
}

function itemwinnerPage(rows, overrides = {}) {
  const totalSize = overrides.totalSize ?? rows.length;
  return response({
    totalSize,
    page: 0,
    pageSize: totalSize === 0 ? 10 : 1000,
    totalPages: totalSize === 0 ? 0 : 1,
    vendorItemIds: null,
    result: rows,
    ...overrides,
  });
}

test("Wing itemwinner API uses the fixed all/on-sale page-0 request and preserves provider winner state", async () => {
  const rows = [
    itemwinnerRow("101", { productName: "상품 이름 ".repeat(20), myViSales: "" }),
    itemwinnerRow("102", { winnerStatus: true, suppressed: true, currentPrice: "0", winnerPrice: "900" }),
    itemwinnerRow("103", { winnerStatus: false, suppressed: false, myViSales: "0" }),
  ];
  const { api, requests } = createHarness({
    pageLocation: itemwinnerLocation("?rf=menu"),
    responses: [itemwinnerPage(rows)],
  });
  const result = await api.collectItemwinner();
  assert.equal(result.success, true);
  assert.equal(result.products.length, 3);
  assert.equal(result.products[0].vendorItemId, "101");
  assert.equal(result.products[0].productName.length, 80);
  assert.equal(result.products[0].salesQty, 0);
  assert.equal(result.products[1].isWinner, false);
  assert.equal(result.products[1].providerWinnerStatus, true);
  assert.equal(result.products[1].suppressed, true);
  assert.equal(result.products[1].myPrice, 0);
  assert.equal(result.products[1].winnerPrice, 900);
  assert.equal(result.products[2].isWinner, false);
  assert.deepEqual(JSON.parse(JSON.stringify(result.kpis)), {
    "아이템위너 상품": 1,
    "노출제한 상품": 1,
    "아이템위너 아닌 상품": 1,
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/tenants/seller-price-management/getProductList");
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    searchIds: "",
    sortType: "MY_VI_SALES_DESC",
    keywords: "",
    revamp: "B",
    displayCategoryIds: [],
    productName: "",
    brandName: "",
    alarmStatus: "ALL",
    autoPriceStatus: "ALL",
    vendorItemStatus: "ON_SALE",
    itemWinnerStatus: "ALL",
    rodBadge: "ALL",
    pageSize: 1000,
    page: 0,
    searchPresets: null,
    isTopGMV: null,
  });
  assert.equal(requests[0].init.credentials, "include");
  assert.equal(requests[0].init.redirect, "manual");
  assert.equal(requests[0].init.headers["X-XSRF-TOKEN"], "wing/token=");
});

test("Wing itemwinner API accepts only a complete single-page result and rejects duplicates/limits", async () => {
  const duplicateRows = [itemwinnerRow("101"), itemwinnerRow("101")];
  const duplicate = createHarness({
    pageLocation: itemwinnerLocation(),
    responses: [itemwinnerPage(duplicateRows)],
  });
  const duplicateResult = await duplicate.api.collectItemwinner();
  assert.equal(duplicateResult.success, false);
  assert.equal(duplicateResult.errorCode, "WING_ITEMWINNER_DUPLICATE_ROW");

  const partial = createHarness({
    pageLocation: itemwinnerLocation(),
    responses: [itemwinnerPage([itemwinnerRow("101")], { totalSize: 2 })],
  });
  const partialResult = await partial.api.collectItemwinner();
  assert.equal(partialResult.success, false);
  assert.equal(partialResult.errorCode, "WING_ITEMWINNER_PAGE_PARTIAL");

  const oversized = createHarness({
    pageLocation: itemwinnerLocation(),
    responses: [itemwinnerPage([], { totalSize: 1001, totalPages: 2, pageSize: 1000 })],
  });
  const oversizedResult = await oversized.api.collectItemwinner();
  assert.equal(oversizedResult.success, false);
  assert.equal(oversizedResult.errorCode, "WING_ITEMWINNER_PAGE_LIMIT");

  const numericObject = createHarness({
    pageLocation: itemwinnerLocation(),
    responses: [itemwinnerPage([itemwinnerRow("101")], {
      result: { 0: itemwinnerRow("101") },
    })],
  });
  const numericObjectResult = await numericObject.api.collectItemwinner();
  assert.equal(numericObjectResult.success, false);
  assert.equal(numericObjectResult.errorCode, "WING_ITEMWINNER_RESPONSE_INVALID");
});

test("Wing itemwinner API requires all observed numeric price and sales fields", async () => {
  for (const field of ["currentPrice", "winnerPrice", "myViSales"]) {
    const row = itemwinnerRow("101");
    delete row[field];
    const missing = createHarness({
      pageLocation: itemwinnerLocation(),
      responses: [itemwinnerPage([row])],
    });
    const missingResult = await missing.api.collectItemwinner();
    assert.equal(missingResult.success, false, field);
    assert.equal(missingResult.errorCode, "WING_ITEMWINNER_ROW_INVALID", field);

    const malformed = createHarness({
      pageLocation: itemwinnerLocation(),
      responses: [itemwinnerPage([itemwinnerRow("101", { [field]: null })])],
    });
    const malformedResult = await malformed.api.collectItemwinner();
    assert.equal(malformedResult.success, false, field);
    assert.equal(malformedResult.errorCode, "WING_ITEMWINNER_ROW_INVALID", field);
  }

  const whitespaceSales = createHarness({
    pageLocation: itemwinnerLocation(),
    responses: [itemwinnerPage([itemwinnerRow("101", { myViSales: " " })])],
  });
  const whitespaceSalesResult = await whitespaceSales.api.collectItemwinner();
  assert.equal(whitespaceSalesResult.success, false);
  assert.equal(whitespaceSalesResult.errorCode, "WING_ITEMWINNER_ROW_INVALID");
});

test("Wing itemwinner API accepts a validated empty page and rejects unsupported URL filters", async () => {
  const empty = createHarness({
    pageLocation: itemwinnerLocation("?rf=menu"),
    responses: [itemwinnerPage([])],
  });
  const emptyResult = await empty.api.collectItemwinner();
  assert.equal(emptyResult.success, true);
  assert.equal(emptyResult.products.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(emptyResult.kpis)), {
    "아이템위너 상품": 0,
    "노출제한 상품": 0,
    "아이템위너 아닌 상품": 0,
  });

  const unsupported = createHarness({
    pageLocation: itemwinnerLocation("?itemWinnerStatus=LOSE_NOT_SUPPRESSED"),
    responses: [],
  });
  const unsupportedResult = await unsupported.api.collectItemwinner();
  assert.equal(unsupportedResult.success, false);
  assert.equal(unsupportedResult.errorCode, "WING_ITEMWINNER_FILTER_UNSUPPORTED");
  assert.equal(unsupported.requests.length, 0);

  const unsupportedPath = createHarness({
    pageLocation: {
      href: "https://wing.coupang.com/tenants/seller-price-management/other",
      search: "",
    },
    responses: [],
  });
  const unsupportedPathResult = await unsupportedPath.api.collectItemwinner();
  assert.equal(unsupportedPathResult.success, false);
  assert.equal(unsupportedPathResult.errorCode, "WING_ITEMWINNER_URL_INVALID");
  assert.equal(unsupportedPath.requests.length, 0);
});

test("Wing traffic API uses fixed XSRF requests and preserves API row semantics", async () => {
  const rows = [
    row(1),
    row(2, {
      totalUniqueVisitor: 0,
      totalPageViews: 0,
      totalAddToCart: 0,
      totalOrders: 0,
      totalUnitsSold: 0,
      totalGmv: 0,
      pvToOrder: 0,
      uniqueVisitorVariance: -7,
    }),
  ];
  const { api, requests } = createHarness({
    responses: [
      response(metadata()),
      detailPage(0, rows, 2, 1),
      response(summaryFor(rows)),
    ],
  });

  const result = await api.collectTraffic({ control: ownerControl() });
  assert.equal(result.success, true);
  assert.equal(result.products.length, 2);
  assert.equal(result.products[0].productName, "옵션 1");
  assert.equal(result.products[0].productId, "9000000001");
  assert.equal(result.products[0].inventoryId, "9000000001");
  assert.equal(result.products[0].optionId, "1");
  assert.equal(result.products[0].sdpProductId, "7000000001");
  assert.equal(result.products[0].conversionRate, 50);
  assert.equal(result.products[0].changes.visitors, -1);
  assert.equal(result.products[1].visitors, 0);
  assert.equal(result.products[1].revenue, 0);
  assert.equal(result.products[1].changes.visitors, -7);
  assert.equal(result.summary.visitors, 1);
  assert.equal(result.summary.revenue, 600);
  assert.equal(result.summary.conversionRate, 25);
  assert.equal(result.kpis.visitor.numValue, 1);
  assert.equal(result.kpis.visitor.change, "-10%");
  assert.equal(result.kpis.conversion.value, "25%");
  assert.equal(result.pages[0].pageIndex, 1);
  assert.equal(result.pages[0].data.length, 2);

  assert.equal(requests.length, 3);
  assert.match(requests[0].url, /^\/tenants\/rfm-ss\/api\/metadata\/business-insights\?platform=WING&date=/);
  assert.equal(requests[1].url, "/tenants/rfm-ss/api/business-insight/vi-detail-search");
  assert.deepEqual(JSON.parse(requests[1].init.body), {
    startDate: "2026-09-05",
    endDate: "2026-09-06",
    registrationTypes: ["NORMAL", "RFM"],
    pageNumber: 0,
    pageSize: 100,
    sortBy: "GMV",
    sortOrder: "DESC",
    includeSoldVICount: true,
  });
  assert.equal(requests[2].url, "/tenants/rfm-ss/api/business-insight/vendor-summary");
  assert.deepEqual(JSON.parse(requests[2].init.body), {
    startDate: "2026-09-05",
    endDate: "2026-09-06",
    registrationTypes: ["NORMAL", "RFM"],
    searchIds: [],
  });
  for (const request of requests) {
    assert.equal(request.init.credentials, "include");
    assert.equal(request.init.redirect, "manual");
    assert.equal(request.init.headers["X-XSRF-TOKEN"], "wing/token=");
    assert.ok(request.init.signal);
  }
});

test("Wing traffic API validates all pages and rejects duplicate rows", async () => {
  const first = Array.from({ length: 100 }, (_, index) => row(index + 1));
  const second = [row(100)];
  const { api, requests } = createHarness({
    responses: [
      response(metadata()),
      detailPage(0, first, 101, 2),
      detailPage(1, second, 101, 2),
    ],
  });
  const result = await api.collectTraffic({ control: ownerControl() });
  assert.equal(result.success, false);
  assert.equal(result.errorCode, "WING_TRAFFIC_DUPLICATE_ROW");
  assert.equal(requests.length, 3);
});

test("Wing traffic API rejects a partial page before summary publication", async () => {
  const rows = [row(1)];
  const { api, requests } = createHarness({
    responses: [response(metadata()), detailPage(0, rows, 2, 1)],
  });
  const result = await api.collectTraffic({ control: ownerControl() });
  assert.equal(result.success, false);
  assert.equal(result.errorCode, "WING_TRAFFIC_PAGE_PARTIAL");
  assert.equal(requests.length, 2);
});

test("Wing traffic API accepts only a validated explicit empty result", async () => {
  const emptySummary = summaryFor([]);
  emptySummary.summaryMetrics.pvToOrder = 0;
  const { api } = createHarness({
    responses: [response(metadata()), detailPage(0, [], 0, 0), response(emptySummary)],
  });
  const result = await api.collectTraffic({ control: ownerControl() });
  assert.equal(result.success, true);
  assert.equal(result.products.length, 0);
  assert.equal(result.expectedPages, 1);
  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0].data.length, 0);
  assert.equal(result.summary.visitors, 0);
});

test("Wing traffic API rejects stale metadata, reversed ranges, and summary drift", async () => {
  const staleMetadata = metadata();
  staleMetadata.dataFreshness.metrics.TRAFFIC_DAILY.latestDataDate = Date.parse("2026-09-05T00:00:00Z");
  const stale = createHarness({ responses: [response(staleMetadata)] });
  const staleResult = await stale.api.collectTraffic({ control: ownerControl() });
  assert.equal(staleResult.success, false);
  assert.equal(staleResult.errorCode, "WING_TRAFFIC_DATA_NOT_READY");
  assert.equal(stale.requests.length, 1);

  const reversed = createHarness({
    responses: [],
    cookie: "XSRF-TOKEN=token",
  });
  const reversedResult = await reversed.api.collectTraffic({ control: ownerControl("2026-09-06", "2026-09-05") });
  assert.equal(reversedResult.success, false);
  assert.equal(reversedResult.errorCode, "TRAFFIC_DATE_RANGE_INVALID");

  const invalidDate = createHarness({ responses: [] });
  const invalidDateResult = await invalidDate.api.collectTraffic({
    control: ownerControl("2026-02-30", "2026-03-01"),
  });
  assert.equal(invalidDateResult.success, false);
  assert.equal(invalidDateResult.errorCode, "TRAFFIC_DATE_RANGE_INVALID");

  const rows = [row(1)];
  const mismatched = summaryFor(rows);
  mismatched.summaryMetrics.totalGmv += 1;
  const drift = createHarness({
    responses: [response(metadata()), detailPage(0, rows, 1, 1), response(mismatched)],
  });
  const driftResult = await drift.api.collectTraffic({ control: ownerControl() });
  assert.equal(driftResult.success, false);
  assert.equal(driftResult.errorCode, "WING_TRAFFIC_SUMMARY_MISMATCH");

  const originalRow = row(1);
  delete originalRow.vendorItemDetails.vendorId;
  const missingVendorHarness = createHarness({
    responses: [response(metadata()), detailPage(0, [originalRow], 1, 1), response(summaryFor([row(1)]))],
  });
  const missingVendorResult = await missingVendorHarness.api.collectTraffic({ control: ownerControl() });
  assert.equal(missingVendorResult.success, false);
  assert.equal(missingVendorResult.errorCode, "ADVERTISER_IDENTITY_MISMATCH");
});

test("Wing traffic API classifies missing token, redirects, and provider HTML explicitly", async () => {
  const missing = createHarness({ responses: [], cookie: "locale=ko_KR" });
  const missingResult = await missing.api.collectTraffic({ control: ownerControl() });
  assert.equal(missingResult.errorCode, "WING_XSRF_TOKEN_MISSING");
  assert.equal(missingResult.attentionRequired, true);
  assert.equal(missing.requests.length, 0);

  const redirect = createHarness({ responses: [response("", { status: 0, ok: false, type: "opaqueredirect" })] });
  const redirectResult = await redirect.api.collectTraffic({ control: ownerControl() });
  assert.equal(redirectResult.errorCode, "WING_LOGIN_REQUIRED");
  assert.equal(redirectResult.attentionRequired, true);

  const unavailable = createHarness({ responses: [response("<html>temporary outage</html>", { status: 503, ok: false, contentType: "text/html" })] });
  const unavailableResult = await unavailable.api.collectTraffic({ control: ownerControl() });
  assert.equal(unavailableResult.errorCode, "WING_PROVIDER_UNAVAILABLE");
  assert.equal(unavailableResult.attentionRequired, undefined);

  const malformedToken = createHarness({ responses: [], cookie: "XSRF-TOKEN=%E0%A4%A" });
  const malformedTokenResult = await malformedToken.api.collectTraffic({ control: ownerControl() });
  assert.equal(malformedTokenResult.errorCode, "WING_XSRF_TOKEN_MISSING");
});
