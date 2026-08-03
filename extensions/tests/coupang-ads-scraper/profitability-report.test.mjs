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
    setTimeout,
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

test("treats a report dialog removed from the DOM as closed", async () => {
  const contract = loadContract();
  const dialog = {
    isConnected: true,
    querySelector() {
      return {
        dispatchEvent() {},
        focus() {},
        click() {
          dialog.isConnected = false;
        },
      };
    },
  };

  await contract.closeReportDialog(dialog);
  assert.equal(dialog.isConnected, false);
});

test("treats an animated report dialog with no layout box as closed", async () => {
  const contract = loadContract();
  const dialog = {
    isConnected: true,
    getClientRects() {
      return [];
    },
    querySelector() {
      return {
        dispatchEvent() {},
        focus() {},
        click() {},
      };
    },
  };

  await contract.closeReportDialog(dialog);
  assert.equal(dialog.isConnected, true);
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

test("waits for the chart button that appears after report completion", async () => {
  let buttonReads = 0;
  let dialogReady = false;
  const dialog = { isConnected: true };
  const button = {
    innerText: "차트 보기",
    isConnected: true,
    click() {
      dialogReady = true;
    },
  };
  const row = {
    isConnected: true,
    querySelectorAll(selector) {
      if (selector !== "button") return [];
      buttonReads += 1;
      return buttonReads >= 2 ? [button] : [];
    },
  };
  const contract = loadContract({
    document: {
      querySelector() { return null; },
      querySelectorAll(selector) {
        return selector === '[role="dialog"]' && dialogReady ? [dialog] : [];
      },
    },
  });

  assert.equal(await contract.openReportDialog(row), dialog);
  assert.equal(buttonReads, 2);
});

test("creates a fresh report when the only matching row is still incomplete", async () => {
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
  const contract = loadContract({
    document: {
      querySelector() { return null; },
      querySelectorAll(selector) {
        if (selector === '[role="row"]') return [row];
        if (selector === "button") return [createButton];
        return [];
      },
    },
  });

  assert.equal(await contract.waitForReport(slice, true), row);
  assert.equal(createClicks, 1);
});

test("joins pinned and center AG Grid fragments by row id without duplicate rows", () => {
  const contract = loadContract();
  const rows = contract.mergeGridRowFragments([
    { rowId: "0", cells: { reportday: "2026-07-01" } },
    { rowId: "0", cells: { adviid: "100", adcost: "1,200원" } },
    { rowId: "0", cells: { adviid: "100", clickcount: "2" } },
    { rowId: "1", cells: { reportday: "2026-07-01", adviid: "200" } },
  ]);

  assert.equal(rows.size, 2);
  assert.deepEqual(
    { ...rows.get("0") },
    { reportday: "2026-07-01", adviid: "100", adcost: "1,200원", clickcount: "2" },
  );
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

test("requires product-row daily spend to equal the provider daily summary", () => {
  const contract = loadContract();
  const summary = [
    { reportday: "2026-07-01", adcost: "1,500원" },
    { reportday: "2026-07-02", adcost: "0원" },
  ];
  const products = [
    { reportday: "2026-07-01", adcost: "1,200원" },
    { reportday: "2026-07-01", adcost: "300원" },
  ];

  assert.equal(
    contract.assertDailySpendMatches(summary, products, ["2026-07-01", "2026-07-02"]),
    true,
  );
  assert.throws(
    () => contract.assertDailySpendMatches(summary, [
      { reportday: "2026-07-01", adcost: "1,499원" },
    ], ["2026-07-01"]),
    /profitability_report_daily_spend_mismatch/,
  );
});
