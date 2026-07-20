import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const source = fs.readFileSync(
  path.join(repoRoot, "extensions/coupang-ads-scraper/content/ads-report.js"),
  "utf8",
);

function loadContract(options = {}) {
  const location = options.location || {
    href: "https://advertising.coupang.com/marketing/dashboard/sales",
    pathname: "/marketing/dashboard/sales",
    search: "",
    hash: "",
  };
  const document = options.document || {
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    title: "광고센터",
  };
  const context = vm.createContext({
    chrome: {
      runtime: {
        lastError: null,
        onMessage: { addListener() {} },
        sendMessage() {},
      },
      storage: { local: { set() {} } },
    },
    console,
    document,
    history: { back() {} },
    location,
    sessionStorage: {
      getItem() {
        return null;
      },
      removeItem() {},
      setItem() {},
    },
    setTimeout() {
      return 0;
    },
    clearTimeout() {},
    showBadge() {},
    URL,
  });
  context.window = context;
  context.window.location = location;
  vm.runInContext(source, context, { filename: "ads-report.js" });
  return context.KidItemAdsReportContract;
}

function reportSnapshot(page, totalPages, rowIds = [], surfaceKind = "rows") {
  const rawRows = rowIds.map((id) => ({ "상품ID": id }));
  const normalizedRows = rowIds.map((id) => ({
    externalId: id,
    pageType: "product",
  }));
  return {
    ok: true,
    parsed: {
      rawRows,
      normalizedRows,
      headers: ["상품ID"],
      pageType: "product",
    },
    pagination: {
      currentPage: page,
      totalPages,
      verified: true,
      source: "fixture",
    },
    surface: {
      kind: surfaceKind,
      explicitEmpty: surfaceKind === "empty",
    },
    signature: rowIds.join("|"),
  };
}

test("conversion-count fixture never selects advertising conversion revenue", () => {
  const contract = loadContract();
  const headers = [
    "노출수",
    "광고 전환 매출",
    "광고 전환 주문수",
    "광고 전환 판매수",
  ];

  assert.equal(contract.findConversionCountHeaderIndex(headers), 3);
  assert.equal(
    contract.findConversionCountHeaderIndex(["광고 전환 매출", "광고 전환 주문수"]),
    -1,
  );

  const daily = contract.buildCoupangAdsDailyRow(
    "2026-07-17",
    [
      {
        runningAdSpend: 40215,
        revenue: 216470,
        impressions: 178536,
        clicks: 295,
        conversions: 21,
        orders: 21,
      },
    ],
    {},
  );
  assert.equal(daily.adRevenue, 216470);
  assert.equal(daily.conversions, 21);
});

test("daily conversion-rate fallback uses orders, not sales quantity", () => {
  const contract = loadContract();
  const daily = contract.buildCoupangAdsDailyRow(
    "2026-07-17",
    [
      {
        impressions: 2_000,
        clicks: 40,
        conversions: 4,
        orders: 3,
        _observedMetrics: {
          adSpend: true,
          adRevenue: true,
          impressions: true,
          clicks: true,
          conversions: true,
          orders: true,
        },
      },
    ],
    {},
  );

  assert.equal(daily.conversions, 4);
  assert.equal(daily.orders, 3);
  assert.equal(daily.conversionRate, 7.5);
});

test("target-date fixture accepts only the requested displayed range", () => {
  const contract = loadContract();

  assert.equal(
    contract.displayedRangeMatchesTarget("2026.07.17 ~ 2026.07.17", "2026-07-17"),
    true,
  );
  assert.equal(
    contract.displayedRangeMatchesTarget("2026.07.11 ~ 2026.07.17", "2026-07-17"),
    false,
  );
});

test("empty target date builds an explicit all-zero daily fact", () => {
  const contract = loadContract();
  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.buildCoupangAdsDailyRow("2026-07-01", [], {}))),
    {
      date: "2026-07-01",
      adSpend: 0,
      adRevenue: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      orders: 0,
      roas: 0,
      ctr: 0,
      conversionRate: 0,
      rowCount: 0,
    },
  );
});

test("observed zero row metrics do not fall back to stale KPI widgets", () => {
  const contract = loadContract();
  const staleKpis = {
    "집행 광고비": { value: "1.2", unit: "만" },
    "광고 전환 매출": { value: "3.4", unit: "만" },
    "노출수": { value: "120", unit: "" },
    "클릭수": { value: "12", unit: "" },
    "전환 판매수": { value: "4", unit: "" },
    "전환 주문수": { value: "3", unit: "" },
  };
  const observedZero = contract.buildCoupangAdsDailyRow(
    "2026-07-17",
    [{ spend: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0, orders: 0 }],
    staleKpis,
  );
  const unobserved = contract.buildCoupangAdsDailyRow(
    "2026-07-17",
    [{ productName: "metric fields absent" }],
    staleKpis,
  );

  assert.equal(observedZero.adSpend, 0);
  assert.equal(observedZero.adRevenue, 0);
  assert.equal(observedZero.impressions, 0);
  assert.equal(observedZero.clicks, 0);
  assert.equal(observedZero.conversions, 0);
  assert.equal(observedZero.orders, 0);
  assert.equal(unobserved.adSpend, 12_000);
  assert.equal(unobserved.adRevenue, 34_000);
  assert.equal(unobserved.impressions, 120);
  assert.equal(unobserved.clicks, 12);
  assert.equal(unobserved.conversions, 4);
  assert.equal(unobserved.orders, 3);
});

test("Korean abbreviated KPI numbers preserve their magnitude", () => {
  const contract = loadContract();

  assert.equal(contract.parseNumber("1.2만"), 12_000);
  assert.equal(contract.parseNumber("3.4억원"), 340_000_000);
  assert.equal(contract.parseNumber("7.5천회"), 7_500);
  assert.equal(contract.parseNumber("₩ 12,345"), 12_345);
  assert.equal(contract.parseNumber(contract.kpiRawValue({ value: "1.2", unit: "만" })), 12_000);
  assert.equal(
    contract.parseNumber(contract.kpiRawValue({ value: "3.4", unit: "억원" })),
    340_000_000,
  );
});

test("zero rows are complete only with an explicit visible empty-state", async () => {
  const contract = loadContract();
  const visibleElement = {
    getAttribute() {
      return null;
    },
    getClientRects() {
      return [{}];
    },
    hidden: false,
    parentElement: null,
    style: {},
  };
  const hiddenParent = {
    getAttribute() {
      return null;
    },
    hidden: true,
    parentElement: null,
    style: {},
  };

  assert.equal(contract.isElementVisible(visibleElement), true);
  assert.equal(
    contract.isElementVisible({ ...visibleElement, parentElement: hiddenParent }),
    false,
  );
  assert.equal(
    contract.isElementVisible({ ...visibleElement, getClientRects: () => [] }),
    false,
  );

  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.classifyReportSurfaceEvidence({
      rowCount: 0,
      loadingVisible: true,
      emptyText: "데이터가 없습니다.",
    }))),
    { kind: "loading", explicitEmpty: false },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.classifyReportSurfaceEvidence({
      rowCount: 0,
      loadingVisible: false,
      emptyText: "조회된 데이터가 없습니다.",
    }))),
    {
      kind: "empty",
      explicitEmpty: true,
      emptyText: "조회된 데이터가 없습니다.",
    },
  );

  const unknown = await contract.collectPaginatedReport({
    maxPages: 1,
    readPage: async () => reportSnapshot(1, 1, [], "unknown"),
  });
  assert.equal(unknown.complete, false);
  assert.equal(unknown.explicitEmpty, false);
  assert.equal(unknown.error, "report_surface_unverified");

  const explicitEmpty = await contract.collectPaginatedReport({
    maxPages: 1,
    readPage: async () => reportSnapshot(1, 1, [], "empty"),
  });
  assert.equal(explicitEmpty.complete, true);
  assert.equal(explicitEmpty.explicitEmpty, true);
  assert.deepEqual([...explicitEmpty.visitedPages], [1]);
  assert.match(source, /targetDate\s*&&\s*collection\.explicitEmpty/);
});

test("empty/loading evidence is scoped to the selected report container", () => {
  const externalEmpty = {
    getAttribute() {
      return null;
    },
    getClientRects() {
      return [{}];
    },
    hidden: false,
    innerText: "데이터가 없습니다.",
    parentElement: null,
    style: {},
  };
  const document = {
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      return selector === ".ant-empty" ? [externalEmpty] : [];
    },
    title: "광고센터",
  };
  const contract = loadContract({ document });
  const unrelatedReportRoot = {
    matches() {
      return false;
    },
    querySelectorAll() {
      return [];
    },
  };
  const actualReportRoot = {
    matches() {
      return false;
    },
    querySelectorAll(selector) {
      return selector === ".ant-empty" ? [externalEmpty] : [];
    },
  };

  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.readReportSurfaceState({
      rawRows: [],
      surfaceRoots: [unrelatedReportRoot],
    }))),
    { kind: "unknown", explicitEmpty: false },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.readReportSurfaceState({
      rawRows: [],
      surfaceRoots: [actualReportRoot],
    }))),
    {
      kind: "empty",
      explicitEmpty: true,
      emptyText: "데이터가 없습니다.",
    },
  );
});

test("explicit empty daily result rejects stale additive KPI and accepts clean zero", () => {
  const contract = loadContract();
  const stale = contract.evaluateExplicitEmptyDailyKpis({
    "집행 광고비": { value: "1.2", unit: "만" },
    "광고 전환 매출": { value: "0", unit: "원" },
  });
  const clean = contract.evaluateExplicitEmptyDailyKpis({
    "집행 광고비": { value: "0", unit: "원" },
    "광고 전환 매출": { value: "0", unit: "원" },
    "광고 수익률": { value: "125", unit: "%" },
  });

  assert.equal(stale.consistent, false);
  assert.deepEqual([...stale.nonZeroMetrics], ["adSpend"]);
  assert.equal(stale.additive.adSpend, 12_000);
  assert.equal(clean.consistent, true);
  assert.deepEqual([...clean.nonZeroMetrics], []);
  assert.ok(
    source.indexOf("if (targetDate && collection.explicitEmpty)") <
      source.indexOf("const kpiCount = Object.keys(kpis).length"),
    "explicit empty must be resolved before any KPI/ad_campaign save branch",
  );
});

test("paginated report succeeds only after every expected page is visited", async () => {
  const contract = loadContract();
  const pages = [
    reportSnapshot(1, 2, ["product-1"]),
    reportSnapshot(2, 2, ["product-2"]),
  ];
  let nextIndex = 0;
  const result = await contract.collectPaginatedReport({
    maxPages: 8,
    readPage: async () => pages[0],
    advancePage: async () => ({ ok: true, snapshot: pages[++nextIndex] }),
  });

  assert.equal(result.complete, true);
  assert.equal(result.error, null);
  assert.equal(result.expectedPages, 2);
  assert.deepEqual([...result.visitedPages], [1, 2]);
  assert.deepEqual(
    [...result.normalizedRows].map((row) => row.externalId),
    ["product-1", "product-2"],
  );
});

test("rows wait for a late paginator instead of assuming one page", async () => {
  const contract = loadContract();
  const unverified = reportSnapshot(1, 1, ["product-1"]);
  unverified.pagination.verified = false;
  unverified.pagination.source = "fallback";
  const verified = reportSnapshot(1, 2, ["product-1"]);
  let clock = 0;
  let reads = 0;

  const settled = await contract.readSettledReportPage(1_000, {
    now: () => clock,
    readSnapshot: () => (reads++ < 2 ? unverified : verified),
    wait: async (milliseconds) => {
      clock += milliseconds;
    },
  });

  assert.equal(settled.ok, true);
  assert.equal(settled.pagination.verified, true);
  assert.equal(settled.pagination.totalPages, 2);

  clock = 0;
  const timedOut = await contract.readSettledReportPage(500, {
    now: () => clock,
    readSnapshot: () => unverified,
    wait: async (milliseconds) => {
      clock += milliseconds;
    },
  });
  assert.equal(timedOut.ok, false);
  assert.equal(timedOut.error, "pagination_unverified");
});

test("same-page duplicate external ids are preserved", async () => {
  const contract = loadContract();
  const result = await contract.collectPaginatedReport({
    maxPages: 1,
    readPage: async () => reportSnapshot(1, 1, ["degraded-id", "degraded-id"]),
  });

  assert.equal(result.complete, true);
  assert.equal(result.rawRows.length, 2);
  assert.equal(result.normalizedRows.length, 2);
});

test("pagination navigation, page limit, and non-increasing page failures are not complete", async (t) => {
  const contract = loadContract();

  await t.test("navigation failure", async () => {
    const result = await contract.collectPaginatedReport({
      maxPages: 8,
      readPage: async () => reportSnapshot(1, 2, ["product-1"]),
      advancePage: async () => ({ ok: false, error: "page_navigation_failed" }),
    });
    assert.equal(result.complete, false);
    assert.equal(result.error, "page_navigation_failed");
    assert.deepEqual([...result.visitedPages], [1]);
  });

  await t.test("page limit", async () => {
    const result = await contract.collectPaginatedReport({
      maxPages: 8,
      readPage: async () => reportSnapshot(1, 9, ["product-1"]),
    });
    assert.equal(result.complete, false);
    assert.equal(result.error, "pagination_limit_exceeded");
    assert.equal(result.expectedPages, 9);
  });

  await t.test("page number did not increase", async () => {
    const first = reportSnapshot(1, 2, ["product-1"]);
    const result = await contract.collectPaginatedReport({
      maxPages: 8,
      readPage: async () => first,
      advancePage: async () => ({ ok: true, snapshot: first }),
    });
    assert.equal(result.complete, false);
    assert.equal(result.error, "page_number_not_increased");
  });
});

test("campaign identity is anchored to href/id so duplicate names remain distinct", () => {
  const contract = loadContract();
  const firstHref = "https://advertising.coupang.com/marketing/campaign/100/product";
  const secondHref = "https://advertising.coupang.com/marketing/campaign/200/product";

  assert.equal(contract.campaignIdFromHref(firstHref), "100");
  assert.equal(contract.campaignIdentityFromHref(firstHref), "campaign:100");
  assert.equal(contract.campaignIdentityFromHref(secondHref), "campaign:200");
  assert.notEqual(
    contract.campaignIdentityFromHref(firstHref),
    contract.campaignIdentityFromHref(secondHref),
  );

  const firstRows = contract.attachCampaignIdentityToRows(
    {
      campaignId: "100",
      identity: "campaign:100",
      href: firstHref,
      name: "동일 캠페인명",
    },
    [{ "상품ID": "product-1" }],
    [{ externalId: "product-1", campaignName: "stale-name" }],
  );
  const secondRows = contract.attachCampaignIdentityToRows(
    {
      campaignId: "200",
      identity: "campaign:200",
      href: secondHref,
      name: "동일 캠페인명",
    },
    [{ "상품ID": "product-1" }],
    [{ externalId: "product-1", campaignName: "stale-name" }],
  );

  assert.equal(firstRows.normalizedRows[0].campaignName, "동일 캠페인명");
  assert.equal(firstRows.normalizedRows[0].campaignId, "100");
  assert.equal(firstRows.normalizedRows[0].campaignIdentity, "campaign:100");
  assert.equal(firstRows.rawRows[0].campaignId, "100");
  assert.equal(firstRows.rawRows[0].campaignIdentity, "campaign:100");
  assert.equal(secondRows.normalizedRows[0].campaignId, "200");
  assert.notEqual(
    firstRows.normalizedRows[0].campaignId,
    secondRows.normalizedRows[0].campaignId,
  );
});

test("duplicate campaign names are both listed and clicked by href identity", () => {
  const clicked = [];
  const makeRow = (campaignId) => {
    const anchor = {
      href: `https://advertising.coupang.com/marketing/campaign/${campaignId}/product`,
      click() {
        clicked.push(campaignId);
      },
    };
    const title = {
      closest(selector) {
        return selector === "a[href]" ? anchor : null;
      },
      innerText: "동일 캠페인명",
      querySelector() {
        return null;
      },
    };
    const cells = ["동일 캠페인명", "ON", "운영중"].map((innerText) => ({
      innerText,
      querySelector() {
        return null;
      },
    }));
    return {
      querySelector(selector) {
        if (selector === ".dashboard-title") return title;
        if (selector.includes("a[href")) return anchor;
        return null;
      },
      querySelectorAll(selector) {
        return selector === "[role='gridcell']" ? cells : [];
      },
    };
  };
  const rows = [makeRow("100"), makeRow("200")];
  const grid = {
    querySelectorAll(selector) {
      return selector === ".rt-tbody .rt-tr-group" ? rows : [];
    },
  };
  const contract = loadContract({
    document: {
      querySelector(selector) {
        return selector.includes(".rt-table") ? grid : null;
      },
      querySelectorAll() {
        return [];
      },
      title: "광고센터",
    },
  });

  const inspection = contract.inspectCampaignsFromDashboard();
  assert.equal(inspection.titledRowCount, 2);
  assert.equal(inspection.missingIdentityNames.length, 0);
  assert.deepEqual(
    [...inspection.campaigns].map((campaign) => campaign.identity),
    ["campaign:100", "campaign:200"],
  );
  assert.equal(contract.clickCampaignAnchor(inspection.campaigns[0]), true);
  assert.equal(contract.clickCampaignAnchor(inspection.campaigns[1]), true);
  assert.deepEqual(clicked, ["100", "200"]);
});

test("campaign detail requires matching identity and rows or explicit empty-state", () => {
  const contract = loadContract();
  const ready = {
    onDashboardList: false,
    identityMatches: true,
    hasDashboardCampaignRows: false,
    surfaceKind: "rows",
  };

  assert.equal(contract.campaignDetailReady(ready), true);
  assert.equal(contract.campaignDetailReady({ ...ready, surfaceKind: "empty" }), true);
  assert.equal(contract.campaignDetailReady({ ...ready, surfaceKind: "loading" }), false);
  assert.equal(contract.campaignDetailReady({ ...ready, identityMatches: false }), false);
  assert.equal(contract.campaignDetailReady({ ...ready, hasDashboardCampaignRows: true }), false);
});

test("dashboard campaign rows fail closed when a titled row has no href identity", () => {
  const contract = loadContract();

  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.campaignIdentityCoverage({
      campaigns: [{ identity: "campaign:100" }],
      titledRowCount: 2,
      missingIdentityNames: ["href 없는 캠페인"],
    }))),
    { complete: false, error: "campaign_identity_missing", missingCount: 1 },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.campaignIdentityCoverage({
      campaigns: [
        { identity: "campaign:100", name: "동일 캠페인명" },
        { identity: "campaign:200", name: "동일 캠페인명" },
      ],
      titledRowCount: 2,
      missingIdentityNames: [],
    }))),
    { complete: true, error: null, missingCount: 0 },
  );
});

test("campaign is completed only after save and failed in-flight work retries after reload", () => {
  const contract = loadContract();
  const campaigns = [
    { identity: "campaign:100" },
    { identity: "campaign:200" },
  ];
  const completedSeen = new Set();
  const attemptedThisRun = new Set(["campaign:100"]);

  assert.deepEqual(
    [...contract.filterPendingCampaigns(campaigns, completedSeen, attemptedThisRun)]
      .map((campaign) => campaign.identity),
    ["campaign:200"],
  );
  assert.deepEqual(
    [...contract.filterPendingCampaigns(campaigns, completedSeen, new Set())]
      .map((campaign) => campaign.identity),
    ["campaign:100", "campaign:200"],
    "reload clears only in-flight attempts, so an unsaved campaign is retried",
  );
  completedSeen.add("campaign:100");
  assert.deepEqual(
    [...contract.filterPendingCampaigns(campaigns, completedSeen, new Set())]
      .map((campaign) => campaign.identity),
    ["campaign:200"],
    "a server-saved campaign stays completed across reload",
  );
  const saveIndex = source.lastIndexOf("if (json?.success)");
  assert.ok(source.indexOf("seen.add(camp.identity)", saveIndex) > saveIndex);
  assert.ok(source.indexOf("saveSeen(seen)", saveIndex) > saveIndex);
});

test("successful resume clears the prior campaign error and recalculates failed", () => {
  const contract = loadContract();
  const campaign = { identity: "campaign:100", name: "재시도 캠페인" };
  const loadedErrors = contract.normalizeSweepErrors([
    { identity: "campaign:100", name: campaign.name, error: "first timeout" },
    { identity: "campaign:100", name: campaign.name, error: "latest timeout" },
  ]);

  assert.equal(loadedErrors.length, 1, "the resumed campaign has one unresolved failure");
  assert.equal(loadedErrors[0].error, "latest timeout");

  const resumedSuccess = contract.reconcileCampaignFailureState(
    loadedErrors,
    campaign,
  );
  assert.deepEqual(JSON.parse(JSON.stringify(resumedSuccess)), {
    errors: [],
    failed: 0,
  });
  assert.equal(resumedSuccess.failed === 0, true, "the final sweep can return success");

  const saveIndex = source.lastIndexOf("if (json?.success)");
  const reconciliationIndex = source.indexOf(
    "reconcileCampaignFailureState(errors, camp)",
    saveIndex,
  );
  const syncedIndex = source.indexOf("synced++;", saveIndex);
  assert.ok(reconciliationIndex > saveIndex && reconciliationIndex < syncedIndex);
  assert.match(source, /let failed = errors\.length;/);
});

test("OFF campaign envelope is metadata-only", () => {
  const contract = loadContract();
  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.buildCampaignReportAuthorityEnvelope(
      { name: "Paused", onOff: "OFF" },
      "2026-07-17",
    ))),
    { campaignReportScope: "single_campaign_metadata_raw" },
  );
});

test("ON campaign envelope is authoritative for one exact day", () => {
  const contract = loadContract();
  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.buildCampaignReportAuthorityEnvelope(
      { name: "Running", onOff: "ON" },
      "2026-07-17",
    ))),
    {
      campaignReportScope: "single_campaign_authoritative",
      period: "1d",
      periodLabel: "어제",
      startDate: "2026-07-17",
      endDate: "2026-07-17",
      dateFrom: "2026-07-17",
      dateTo: "2026-07-17",
    },
  );
});

test("OFF campaign descriptor preserves identity and state without invented metrics", () => {
  const contract = loadContract();
  const descriptor = contract.buildCampaignOnlyRows({
    identity: "campaign:200",
    campaignId: "200",
    href: "https://advertising.coupang.com/marketing/campaign/200/product",
    name: "동일 캠페인명",
    onOff: "OFF",
    status: "일시정지",
  });
  const normalized = descriptor.normalizedRows[0];

  assert.equal(contract.campaignUsesDetailReport({ onOff: "OFF" }), false);
  assert.equal(contract.campaignUsesDetailReport({ onOff: "ON" }), true);
  assert.equal(descriptor.rawRows[0]._campaignOnly, true);
  assert.equal(descriptor.rawRows[0].campaignIdentity, "campaign:200");
  assert.equal(normalized._campaignOnly, true);
  assert.equal(normalized.campaignIdentity, "campaign:200");
  assert.equal(normalized.onOff, "OFF");
  for (const key of ["spend", "revenue", "impressions", "clicks", "conversions", "orders"]) {
    assert.equal(Object.hasOwn(normalized, key), false);
  }
});

test("daily dashboard and campaign sweep publish disjoint server projection scopes", () => {
  assert.match(
    source,
    /campaignReportScope:\s*targetDate\s*\?\s*"multi_campaign_raw"\s*:\s*undefined/,
  );
  assert.match(
    source,
    /campaignReportScope:\s*"single_campaign_authoritative"/,
  );
  assert.match(
    source,
    /campaignReportScope:\s*"single_campaign_metadata_raw"/,
  );
});

test("campaign sweep progress total never decreases and current never exceeds total", () => {
  const contract = loadContract();
  const firstTotal = contract.estimateSweepProgressTotal({
    current: 1,
    pageRemainingIncludingCurrent: 11,
    explicitTotal: null,
    previousTotal: 0,
  });
  const secondTotal = contract.estimateSweepProgressTotal({
    current: 2,
    pageRemainingIncludingCurrent: 9,
    explicitTotal: null,
    previousTotal: firstTotal,
  });
  const normalized = contract.normalizeSweepProgress(
    { current: 12, total: 10 },
    { current: 2, total: secondTotal },
  );

  assert.equal(firstTotal, 11);
  assert.equal(secondTotal, 11);
  assert.equal(normalized.current, 12);
  assert.equal(normalized.total, 12);
  assert.ok(normalized.current <= normalized.total);
});

// Regression: 상세 페이지가 없는 캠페인(AI스마트광고 등)의 anchor 는 대시보드
// 목록 URL 로 resolve 된다. 그 URL 을 identity 로 쓰면 그런 캠페인들이 전부
// 하나의 identity 로 붕괴해 서버에서 같은 target_key 를 덮어쓴다.
// 실측(2026-07-19): 캠페인 팩트가 `campaign:href:.../dashboard/sales` 1행만
// 남고 전부 0원이었다.
test("dashboard list url never becomes a campaign identity", () => {
  const contract = loadContract();
  const listHref = "https://advertising.coupang.com/marketing/dashboard/sales";

  const smartWing = contract.campaignIdentityFromHref(listHref, "AI스마트광고(wing)");
  const smartHub = contract.campaignIdentityFromHref(listHref, "AI스마트광고(HUB)");

  assert.notEqual(smartWing, "href:https://advertising.coupang.com/marketing/dashboard/sales");
  assert.notEqual(smartHub, "href:https://advertising.coupang.com/marketing/dashboard/sales");
  // 목록 URL 을 공유해도 캠페인끼리는 서로 구분되어야 한다.
  assert.notEqual(smartWing, smartHub);
  assert.equal(smartWing, "name:AI스마트광고(wing)");

  // 이름조차 없으면 identity 를 만들지 않는다(=수집 큐에서 제외).
  assert.equal(contract.campaignIdentityFromHref(listHref, ""), null);
});

// Regression: 상세 URL 이 없는 캠페인을 상세 리포트 대상으로 잡으면 sweep 이
// 도달할 수 없는 화면을 계속 기다린다. 사용자가 본 "처리 0.0개/분 /
// 완료 예상 1437시간 6분" 증상.
test("campaigns without a detail url never enter the detail-report path", () => {
  const contract = loadContract();

  assert.equal(
    contract.campaignUsesDetailReport({ onOff: "ON", hasDetailHref: false }),
    false,
  );
  assert.equal(
    contract.campaignUsesDetailReport({ onOff: "ON", hasDetailHref: true }),
    true,
  );
  // hasDetailHref 를 모르는 기존 호출부는 onOff 판정을 그대로 유지한다.
  assert.equal(contract.campaignUsesDetailReport({ onOff: "ON" }), true);
  assert.equal(contract.campaignUsesDetailReport({ onOff: "OFF" }), false);
});
