import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const source = fs.readFileSync(
  path.join(repoRoot, "extensions/kiditem-os/content/coupang/profitability-report.js"),
  "utf8",
);

function loadContract(overrides = {}) {
  class TestMouseEvent {
    constructor(type, init = {}) {
      this.type = type;
      Object.assign(this, init);
    }
  }
  const context = vm.createContext({
    chrome: {
      runtime: {
        lastError: null,
        sendMessage(_message, callback) { callback?.(); },
      },
    },
    console,
    document: overrides.document || {
      querySelector() { return null; },
      querySelectorAll() { return []; },
    },
    MouseEvent: TestMouseEvent,
    fetch: overrides.fetch,
    Date: overrides.Date || Date,
    setTimeout,
    TextEncoder,
    URL,
    window: {
      location: {
        href: "https://advertising.coupang.com/marketing-reporting/billboard/reports/pa",
      },
    },
  });
  context.globalThis = context;
  vm.runInContext(source, context, { filename: "profitability-report.js" });
  return context.KidItemProfitabilityReport;
}

test("recognizes only the official Coupang product-report route and exact report contract", () => {
  const contract = loadContract();
  assert.equal(contract.isOfficialProfitabilityReportUrl(), true);
  assert.equal(
    contract.isOfficialProfitabilityReportUrl(
      "https://advertising.coupang.com/marketing/dashboard/sales",
    ),
    false,
  );
  assert.equal(
    contract.isOfficialProfitabilityReportUrl(
      "https://advertising.coupang.com/marketing-reporting/billboard/reports/pa/",
    ),
    true,
  );
  assert.equal(contract.reportRowMatches(
    "2026-08-02 2026-07-01 ~ 2026-07-31 [일별] 캠페인 > 광고그룹 > 상품 생성 완료",
    { startDate: "2026-07-01", endDate: "2026-07-31" },
  ), true);
});

test("waits for the custom report date inputs to become enabled", () => {
  const contract = loadContract();
  const disabledStart = { disabled: true };
  const enabledStart = { disabled: false };
  const enabledEnd = { disabled: false };
  const root = (start) => ({
    querySelector(selector) {
      return selector.includes("시작일") ? start : enabledEnd;
    },
  });

  assert.equal(contract.enabledReportDateInputs(root(disabledStart)), null);
  assert.deepEqual(
    { ...contract.enabledReportDateInputs(root(enabledStart)) },
    { startInput: enabledStart, endInput: enabledEnd },
  );
});

test("opens the Ant Design date picker with the same mouse sequence as Chrome", () => {
  const contract = loadContract();
  const events = [];
  const input = {
    dispatchEvent(event) {
      events.push(event.type);
    },
    focus() {
      events.push("focus");
    },
    click() {
      events.push("click");
    },
  };

  assert.equal(contract.activateReportDateInput(input), true);
  assert.deepEqual(events, ["mousedown", "focus", "mouseup", "click"]);
});

test("does not apply dialog animation layout checks to ordinary report controls", () => {
  const contract = loadContract();
  const element = {
    isConnected: true,
    getClientRects() {
      return [];
    },
  };

  assert.equal(contract.isVisible(element), true);
});

test("finds the direct campaign-picker button used by the current report form", () => {
  const picker = {
    innerText: "캠페인을 선택하세요",
    isConnected: true,
    matches(selector) { return selector === "button"; },
  };
  const heading = {
    innerText: "캠페인 선택",
    isConnected: true,
    nextElementSibling: picker,
  };
  const contract = loadContract({
    document: {
      querySelector() { return null; },
      querySelectorAll(selector) {
        if (selector === "h1,h2,h3,h4,h5,h6") return [heading];
        if (selector === "button") return [picker];
        return [];
      },
    },
  });

  assert.equal(contract.campaignPickerButton(), picker);
});

test("waits for the old campaign selection to reset before opening the picker", async () => {
  let pickerPolls = 0;
  let pickerClicks = 0;
  let pickerLabelAtClick = null;
  let confirmClicks = 0;
  let checkboxReads = 0;
  const picker = {
    innerText: "모든 캠페인",
    isConnected: true,
    disabled: false,
    matches(selector) { return selector === "button"; },
    click() {
      pickerClicks += 1;
      pickerLabelAtClick = picker.innerText;
    },
  };
  const heading = {
    innerText: "캠페인 선택",
    isConnected: true,
    nextElementSibling: picker,
  };
  const createButton = {
    innerText: "보고서 만들기",
    isConnected: true,
    disabled: false,
  };
  const allCheckbox = {
    checked: false,
    isConnected: true,
    disabled: false,
    closest() { return { innerText: "전체선택" }; },
    click() { allCheckbox.checked = true; },
  };
  const campaignCheckbox = {
    checked: false,
    isConnected: true,
    disabled: false,
    closest() { return { innerText: "캠페인 A" }; },
  };
  const confirm = {
    innerText: "확인",
    isConnected: true,
    click() { confirmClicks += 1; },
  };
  const contract = loadContract({
    document: {
      querySelector() { return null; },
      querySelectorAll(selector) {
        if (selector === "h1,h2,h3,h4,h5,h6") {
          pickerPolls += 1;
          if (pickerPolls === 3) {
            picker.innerText = "캠페인을 선택하세요";
            picker.disabled = true;
            createButton.disabled = true;
          } else if (pickerPolls >= 5) {
            picker.disabled = false;
          }
          return [heading];
        }
        if (selector === "button") return [picker, createButton, confirm];
        if (selector === 'input[type="checkbox"]') {
          checkboxReads += 1;
          return pickerClicks > 0 ? [allCheckbox, campaignCheckbox] : [];
        }
        return [];
      },
    },
  });

  assert.equal(await contract.selectAllCampaigns(), 1);
  assert.ok(pickerPolls >= 5);
  assert.equal(pickerLabelAtClick, "캠페인을 선택하세요");
  assert.equal(confirmClicks, 1);
  assert.ok(checkboxReads > 0);
});

test("fails campaign selection readiness without opening an unreset picker", async () => {
  let now = 0;
  let pickerClicks = 0;
  let checkboxReads = 0;
  const picker = {
    innerText: "모든 캠페인",
    isConnected: true,
    disabled: false,
    matches(selector) { return selector === "button"; },
    click() { pickerClicks += 1; },
  };
  const heading = {
    innerText: "캠페인 선택",
    isConnected: true,
    nextElementSibling: picker,
  };
  const createButton = {
    innerText: "보고서 만들기",
    isConnected: true,
    disabled: false,
  };
  const contract = loadContract({
    Date: { now() { now += 1_000; return now; } },
    document: {
      querySelector() { return null; },
      querySelectorAll(selector) {
        if (selector === "h1,h2,h3,h4,h5,h6") return [heading];
        if (selector === "button") return [picker, createButton];
        if (selector === 'input[type="checkbox"]') {
          checkboxReads += 1;
          return [];
        }
        return [];
      },
    },
  });

  await assert.rejects(
    contract.selectAllCampaigns(),
    /profitability_report_campaign_selection_not_ready/,
  );
  assert.equal(pickerClicks, 0);
  assert.equal(checkboxReads, 0);
});

test("waits for the requested-report list before deciding a matching report is absent", async () => {
  const slice = {
    startDate: "2025-06-28",
    endDate: "2025-06-30",
  };
  const row = {
    getAttribute(name) { return name === "row-id" ? "14601033" : null; },
    innerText: "2025-06-28 ~ 2025-06-30 [일별] 캠페인 > 광고그룹 > 상품 생성 완료",
    isConnected: true,
    closest() { return null; },
  };
  let reads = 0;
  const contract = loadContract({
    document: {
      querySelector() { return null; },
      querySelectorAll(selector) {
        if (selector !== '[role="row"]') return [];
        reads += 1;
        return reads <= 3 ? [] : [row];
      },
    },
  });

  assert.equal(await contract.waitForExistingReport(slice), row);
  assert.ok(reads >= 4);
});

test("waits for an already-generating matching report without requesting a duplicate", async () => {
  const slice = {
    startDate: "2025-09-01",
    endDate: "2025-09-30",
  };
  const row = {
    innerText: "2025-09-01 ~ 2025-09-30 [일별] 캠페인 > 광고그룹 > 상품 생성 중",
    isConnected: true,
    closest() { return null; },
  };
  let createClicks = 0;
  const createButton = {
    innerText: "보고서 만들기",
    isConnected: true,
    click() {
      createClicks += 1;
      row.innerText =
        "2025-09-01 ~ 2025-09-30 [일별] 캠페인 > 광고그룹 > 상품 생성 완료";
    },
  };
  let refreshClicks = 0;
  const refreshButton = {
    innerText: "목록 새로 고침",
    isConnected: true,
    click() {
      refreshClicks += 1;
      row.innerText =
        "2025-09-01 ~ 2025-09-30 [일별] 캠페인 > 광고그룹 > 상품 생성 완료";
    },
  };
  const contract = loadContract({
    document: {
      querySelector() { return null; },
      querySelectorAll(selector) {
        if (selector === '[role="row"]') return [row];
        if (selector === "button") return [createButton, refreshButton];
        return [];
      },
    },
  });

  assert.equal(await contract.waitForReport(slice, true), row);
  assert.equal(createClicks, 0);
  assert.equal(refreshClicks, 1);
});

test("creates a report only when no matching completed or pending report exists", async () => {
  const slice = {
    startDate: "2025-09-01",
    endDate: "2025-09-30",
  };
  const rows = [];
  let createClicks = 0;
  const createButton = {
    innerText: "보고서 만들기",
    isConnected: true,
    click() {
      createClicks += 1;
      rows.push({
        innerText: "2025-09-01 ~ 2025-09-30 [일별] 캠페인 > 광고그룹 > 상품 생성 완료",
        isConnected: true,
        closest() { return null; },
      });
    },
  };
  const contract = loadContract({
    document: {
      querySelector() { return null; },
      querySelectorAll(selector) {
        if (selector === '[role="row"]') return rows;
        if (selector === "button") return [createButton];
        return [];
      },
    },
  });

  assert.equal(await contract.waitForReport(slice, true), rows[0]);
  assert.equal(createClicks, 1);
});

test("waits for the report Create control to enable after campaign selection settles", async () => {
  const slice = {
    startDate: "2025-09-01",
    endDate: "2025-09-30",
  };
  const rows = [];
  let createClicks = 0;
  let buttonReads = 0;
  const createButton = {
    innerText: "보고서 만들기",
    isConnected: true,
    disabled: true,
    click() {
      createClicks += 1;
      rows.push({
        innerText: "2025-09-01 ~ 2025-09-30 [일별] 캠페인 > 광고그룹 > 상품 생성 완료",
        isConnected: true,
        closest() { return null; },
      });
    },
  };
  const refreshButton = {
    innerText: "목록 새로 고침",
    isConnected: true,
    click() { throw new Error("refresh must not run before Create"); },
  };
  let now = 0;
  const contract = loadContract({
    Date: { now() { now += 1_000; return now; } },
    document: {
      querySelector() { return null; },
      querySelectorAll(selector) {
        if (selector === '[role="row"]') return rows;
        if (selector === "button") {
          buttonReads += 1;
          if (buttonReads >= 3) createButton.disabled = false;
          return [createButton, refreshButton];
        }
        return [];
      },
    },
  });

  assert.equal(await contract.waitForReport(slice, true), rows[0]);
  assert.equal(createClicks, 1);
  assert.ok(buttonReads >= 3);
});

test("fails boundedly without clicking disabled Create or polling generation", async () => {
  const slice = {
    startDate: "2025-09-01",
    endDate: "2025-09-30",
  };
  let createClicks = 0;
  let refreshClicks = 0;
  const createButton = {
    innerText: "보고서 만들기",
    isConnected: true,
    disabled: true,
    click() { createClicks += 1; },
  };
  const refreshButton = {
    innerText: "목록 새로 고침",
    isConnected: true,
    disabled: true,
    click() { refreshClicks += 1; },
  };
  let now = 0;
  const contract = loadContract({
    Date: { now() { now += 1_000; return now; } },
    document: {
      querySelector() { return null; },
      querySelectorAll(selector) {
        if (selector === '[role="row"]') return [];
        if (selector === "button") return [createButton, refreshButton];
        return [];
      },
    },
  });

  await assert.rejects(
    contract.waitForReport(slice, true),
    /profitability_report_create_button_not_ready/,
  );
  assert.equal(createClicks, 0);
  assert.equal(refreshClicks, 0);
});

test("reads the generated report id and parses the chart API NDJSON body", () => {
  const contract = loadContract();
  const row = {
    getAttribute(name) {
      return name === "row-id" ? "14606979" : null;
    },
  };

  assert.equal(contract.reportIdFromRow(row), "14606979");
  assert.deepEqual(
    JSON.parse(JSON.stringify(contract.parseChartReportText([
      JSON.stringify({ reportday: "2025-09-01", adviid: "100", adcost: 1200 }),
      JSON.stringify({ reportday: "2025-09-01", adviid: "200", adcost: 300 }),
      "",
    ].join("\n")))),
    [
      { reportday: "2025-09-01", adviid: "100", adcost: 1200 },
      { reportday: "2025-09-01", adviid: "200", adcost: 300 },
    ],
  );
  assert.throws(
    () => contract.parseChartReportText('{"reportday":"2025-09-01"}\nnot-json'),
    /profitability_report_response_invalid:2/,
  );
});

test("normalizes the compact chart-report date field", () => {
  const contract = loadContract();

  assert.equal(contract.normalizeBusinessDate("20251001"), "2025-10-01");
});

test("downloads the generated report body directly instead of reading the chart grid", async () => {
  const requests = [];
  const body = [
    JSON.stringify({ reportday: "2025-09-01", adviid: "100", adcost: 1200 }),
    JSON.stringify({ reportday: "2025-09-02", adviid: "100", adcost: 300 }),
  ].join("\n");
  const contract = loadContract({
    fetch: async (url, init) => {
      requests.push({ url, init });
      return {
        ok: true,
        status: 200,
        async text() { return body; },
      };
    },
  });
  const row = {
    getAttribute(name) {
      return name === "row-id" ? "14606979" : null;
    },
  };

  const result = await contract.fetchChartReportRows(row);

  assert.deepEqual(JSON.parse(JSON.stringify(requests)), [{
    url: "/marketing-reporting/v2/api/chart-report?id=14606979",
    init: {
      credentials: "same-origin",
      headers: { accept: "text/plain, application/x-ndjson, application/json" },
      method: "GET",
    },
  }]);
  assert.equal(result.reportId, "14606979");
  assert.equal(result.rows.length, 2);
  assert.equal(result.responseBytes, new TextEncoder().encode(body).length);
});

test("aggregates duplicate ad-group rows into one day and advertised option fact", () => {
  const contract = loadContract();
  const rows = contract.aggregateProductRows([
    {
      reportday: "2026년 07월 01일",
      adviid: "100",
      adcost: "1,200원",
      impressioncount: "30",
      clickcount: "2",
      to1dclk: "1",
      tu1dclk: "2",
      ts1dclk: "5,000원",
    },
    {
      reportday: "2026-07-01",
      adviid: "100",
      adcost: "300원",
      impressioncount: "10",
      clickcount: "1",
      to1dclk: "0",
      tu1dclk: "0",
      ts1dclk: "0원",
    },
  ]);

  assert.deepEqual({ ...rows[0] }, {
    businessDate: "2026-07-01",
    externalOptionId: "100",
    adSpend: 1500,
    impressions: 40,
    clicks: 3,
    orders: 1,
    conversions: 2,
    adRevenue: 5000,
  });
});

test("prefers the provider vendor-item id over its advertising-item id", () => {
  const contract = loadContract();

  assert.equal(contract.externalOptionIdFromReportRow({
    adviid: "advertising-item-100",
    vendoritemid: "vendor-item-200",
  }), "vendor-item-200");
  assert.equal(contract.externalOptionIdFromReportRow({
    vendor_item_id: "sold-item-300",
    advertised_vendor_item_id: "advertised-item-400",
  }), "advertised-item-400");
});

test("aggregates the current chart-report snake_case schema", () => {
  const contract = loadContract();
  const rows = contract.aggregateProductRows([{
    dt: "2026-07-01",
    advertised_vendor_item_id: "1234567890",
    ad_cost_sum: "1,200원",
    impressions_count: "30",
    clicks_count: "2",
    direct_order_14_days_by_cli_count: "1",
    halo_order_14_days_by_cli_count: "2",
    direct_unit_14_days_by_cli_count: "3",
    halo_unit_14_days_by_cli_count: "4",
    direct_sale_14_days_by_cli_price: "5,000원",
    halo_sale_14_days_by_cli_price: "6,000원",
  }]);

  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [{
    businessDate: "2026-07-01",
    externalOptionId: "1234567890",
    adSpend: 1200,
    impressions: 30,
    clicks: 2,
    orders: 3,
    conversions: 7,
    adRevenue: 11000,
  }]);
});

test("excludes campaign and ad-group aggregate rows while retaining product identity fallbacks", () => {
  const contract = loadContract();
  const rows = contract.aggregateProductRows([
    {
      reportday: "2026-07-01",
      campaignname: "여름 문구",
      adgroupname: "필기구",
      adcost: "9,999원",
    },
    {
      reportday: "2026-07-01",
      vendorItemId: "200",
      adcost: "300원",
    },
  ]);

  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [{
    businessDate: "2026-07-01",
    externalOptionId: "200",
    adSpend: 300,
    impressions: 0,
    clicks: 0,
    orders: 0,
    conversions: 0,
    adRevenue: 0,
  }]);
});

test("reports only field names when a nonempty hierarchy has no product identity", () => {
  const contract = loadContract();

  assert.deepEqual(JSON.parse(JSON.stringify(contract.reportFieldNames([
    { reportday: "2026-07-01", campaignname: "여름 문구", adcost: "9,999원" },
    { reportday: "2026-07-02", campaignname: "여름 교구", clickcount: "3" },
  ]))), ["adcost", "campaignname", "clickcount", "reportday"]);
});

test("reports identifier and date population without exposing report values", () => {
  const contract = loadContract();

  assert.equal(contract.reportIdentityDiagnostics([
    { dt: "2026-07-01", advertised_vendor_item_id: "123", ad_cost_sum: "100" },
    { dt: "2026-07-02", advertised_vendor_item_id: "", vendor_item_id: "456" },
    { dt: "2026-07-03", advertised_vendor_item_id: 0, vendor_item_id: null },
  ]), [
    "rows=3",
    "date=dt:3/3,reportday:0/0,reportDay:0/0",
    "identifier=advertised_vendor_item_id:1,advertisedVendorItemId:0,vendor_item_id:1,vendoritemid:0,vendorItemId:0,externaloptionid:0,externalOptionId:0,adviid:0",
  ].join(";"));
});

test("switches to the server-planned account and proves the visible advertiser before collection", async () => {
  let visibleAdvertiserId = "wrong-advertiser";
  let clicks = 0;
  const switchControl = {
    isConnected: true,
    getAttribute(name) {
      return name === "data-advertiser-id" ? "advertiser-a" : null;
    },
    click() {
      clicks += 1;
      visibleAdvertiserId = "advertiser-a";
    },
  };
  const accountCode = {
    textContent: "업체코드",
    nextElementSibling: {
      get textContent() { return visibleAdvertiserId; },
    },
  };
  const contract = loadContract({
    document: {
      querySelector() { return null; },
      querySelectorAll(selector) {
        if (selector === "dt") return [accountCode];
        if (selector.includes("data-advertiser-id")) return [switchControl];
        return [];
      },
    },
  });

  const visible = await contract.switchProfitabilityAccount({
    externalAccountId: "coupang-account-a",
    expectedAdvertiserId: "advertiser-a",
  });

  assert.equal(visible, "advertiser-a");
  assert.equal(clicks, 1);
  assert.doesNotMatch(source, /syncProfitabilityReportToServer/);
});

test("direct receipt proof counts only canonical product rows", () => {
  assert.match(
    source,
    /expectedRowCount: rows\.length,\s*collectedRowCount: rows\.length,/,
  );
  assert.doesNotMatch(source, /expectedRowCount: detail\.expectedRowCount/);
});
