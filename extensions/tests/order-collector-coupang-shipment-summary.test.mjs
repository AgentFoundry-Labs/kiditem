import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { JSDOM } from "jsdom";

const workerPath = new URL(
  "../kiditem-os/background/orders/worker.js",
  import.meta.url,
);
const workerSource = readFileSync(workerPath, "utf8");
const functionStart = workerSource.indexOf(
  "async function scrapeCoupangShipmentDateSummary",
);
const functionEnd = workerSource.indexOf(
  "\n// ── 원클릭 자동 수집:",
  functionStart,
);
assert.ok(
  functionStart >= 0 && functionEnd > functionStart,
  "shipment summary scraper source must exist",
);
const scraperSource = workerSource.slice(functionStart, functionEnd);
const { DOMParser } = new JSDOM("").window;

function makeResponse({
  html = "",
  ok = true,
  status = 200,
  redirected = false,
  url = "https://supplier.coupang.com/ibs/shipment/parcel/list?pageNumber=1",
} = {}) {
  return {
    ok,
    status,
    redirected,
    url,
    async text() {
      return html;
    },
  };
}

async function runScraper(response, maxPages = 1) {
  const context = vm.createContext({
    DOMParser,
    fetch: typeof response === "function" ? response : async () => response,
  });
  const scraper = vm.runInContext(`(${scraperSource})`, context, {
    filename: "scrapeCoupangShipmentDateSummary.js",
  });
  return JSON.parse(JSON.stringify(await scraper(maxPages)));
}

function parcelTable(rows = "") {
  return `<!doctype html><html><body>
    <table id="parcel-tab">
      <thead><tr>
        <th>쉽먼트 번호</th><th>쉽먼트 상태</th><th>발주서</th><th>송장 번호</th>
        <th>발송일</th><th>입고예정일</th><th>센터</th><th>박스수</th><th>총 납품 수량</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </body></html>`;
}

test("shipment summary scraper groups a validated parcel table", async () => {
  const html = parcelTable(`
    <tr><td>48835181</td><td>발송 완료</td><td>137710750</td><td>576997172825</td><td>2026-07-24 15:02</td><td>2026-07-25</td><td>MINC34</td><td>1 박스</td><td>8 개</td></tr>
    <tr><td>48813091</td><td>발송 가능</td><td>136053848</td><td>699270964102</td><td>2026-07-27 14:34</td><td>2026-07-28</td><td>동탄1</td><td>3 박스</td><td>36 개</td></tr>
  `);

  assert.deepEqual(await runScraper(makeResponse({ html })), {
    success: true,
    scannedPages: 1,
    totalRows: 2,
    proof: {
      maxPages: 1,
      validatedTable: true,
      stopReason: "short_page",
      lastPageRowCount: 2,
      pageRowCounts: [2],
    },
    dates: [
      { date: "2026-07-27", count: 1, boxes: 3 },
      { date: "2026-07-24", count: 1, boxes: 1 },
    ],
  });
});

test("shipment summary scraper reports a 200 login page as session-required", async () => {
  const result = await runScraper(
    makeResponse({
      html: "<!doctype html><html><body><form>Supplier Hub 로그인</form></body></html>",
    }),
  );

  assert.equal(result.success, false);
  assert.equal(result.errorCode, "coupang_shipment_session_required");
  assert.match(result.error, /로그인 세션/);
});

test("shipment summary scraper reports 401 and 403 as session-required", async () => {
  for (const status of [401, 403]) {
    const result = await runScraper(makeResponse({ ok: false, status }));
    assert.equal(result.success, false);
    assert.equal(result.errorCode, "coupang_shipment_session_required");
  }
});

test("shipment summary scraper rejects an unexpected table contract instead of returning empty", async () => {
  const result = await runScraper(
    makeResponse({
      html: '<table id="parcel-tab"><thead><tr><th>알 수 없는 열</th></tr></thead><tbody></tbody></table>',
    }),
  );

  assert.equal(result.success, false);
  assert.equal(result.errorCode, "coupang_shipment_response_invalid");
  assert.match(result.error, /응답 형식/);
});

test("shipment summary scraper accepts a validated table with no rows", async () => {
  assert.deepEqual(await runScraper(makeResponse({ html: parcelTable() })), {
    success: true,
    scannedPages: 1,
    totalRows: 0,
    proof: {
      maxPages: 1,
      validatedTable: true,
      stopReason: "empty_page",
      lastPageRowCount: 0,
      pageRowCounts: [0],
    },
    dates: [],
  });
});

test("shipment summary preserves six-page prefetch, first shipment identity, and processed cutoff", async () => {
  const requested = [];
  const row = (seq, date, boxes) =>
    `<tr><td>${seq}</td><td>x</td><td>x</td><td>x</td><td>${date}</td><td>x</td><td>x</td><td>${boxes}</td><td>x</td></tr>`;
  const result = await runScraper(async (url) => {
    const page = Number(
      new URL(url, "https://supplier.coupang.com").searchParams.get(
        "pageNumber",
      ),
    );
    requested.push(page);
    const rows =
      page === 1
        ? Array.from({ length: 10 }, (_, i) =>
            row(String(i), "2026-09-01 10:00", "2 boxes"),
          ).join("")
        : page === 2
          ? row("0", "2026-09-02", "99") + row("new", "2026-09-02", "none")
          : "";
    return makeResponse({ html: parcelTable(rows) });
  }, 40);
  assert.deepEqual(requested, [1, 2, 3, 4, 5, 6]);
  assert.equal(result.scannedPages, 2);
  assert.equal(result.totalRows, 11);
  assert.deepEqual(result.dates, [
    { date: "2026-09-02", count: 1, boxes: 0 },
    { date: "2026-09-01", count: 10, boxes: 20 },
  ]);
});

test("shipment summary includes observed empty-table proof for the owner", async () => {
  const result = await runScraper(makeResponse({ html: parcelTable() }), 40);
  assert.deepEqual(result.proof, {
    maxPages: 40,
    validatedTable: true,
    stopReason: "empty_page",
    lastPageRowCount: 0,
    pageRowCounts: [0],
  });
});
