import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(
  new URL("../kiditem-os/background/orders/worker.js", import.meta.url),
  "utf8",
);

function extractFunction(name) {
  const asyncStart = source.indexOf(`async function ${name}(`);
  const syncStart = source.indexOf(`function ${name}(`);
  const start = asyncStart >= 0 ? asyncStart : syncStart;
  assert.notEqual(start, -1, `${name} not found`);
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${name} closing brace not found`);
}

function loadFunction(name, globals) {
  return vm.runInNewContext(`(${extractFunction(name)})`, globals);
}

function advancingDate() {
  let now = 0;
  return class AdvancingDate extends Date {
    static now() {
      now += 1_000;
      return now;
    }
  };
}

function gsDocument(countText = null, bodyText = "GS샵 배송관리", includeSearch = true) {
  const searchButton = {
    textContent: "조회",
    offsetParent: {},
    closest: () => null,
    click() {},
  };
  const countElement = countText
    ? { textContent: countText, children: [], click() {} }
    : null;
  return {
    body: { innerText: bodyText },
    querySelector: () => null,
    querySelectorAll(selector) {
      if (selector === "button") return includeSearch ? [searchButton] : [];
      if (selector === "*") return countElement ? [countElement] : [];
      return [];
    },
  };
}

test("GS Shop distinguishes a rendered zero count from a missing result contract", async () => {
  const globals = (document) => ({
    Blob,
    Date: advancingDate(),
    Promise,
    URL: { createObjectURL() {} },
    document,
    setTimeout: (callback) => callback(),
  });

  const empty = await loadFunction(
    "scrapeGsshopOrders",
    globals(gsDocument("총주문(0)")),
  )();
  const missing = await loadFunction(
    "scrapeGsshopOrders",
    globals(gsDocument()),
  )();

  assert.deepEqual(JSON.parse(JSON.stringify(empty)), {
    success: true,
    empty: true,
    rowCount: 0,
  });
  assert.equal(missing.success, false);
  assert.equal(missing.errorCode, "provider_contract_changed");
  assert.equal(missing.empty, undefined);
});

test("GS Shop does not infer login only because its search button is missing", async () => {
  const globals = (document) => ({
    Blob,
    Date: advancingDate(),
    Promise,
    URL: { createObjectURL() {} },
    document,
    location: { href: "https://partners.gsshop.com/partner-logistics-mng" },
    setTimeout: (callback) => callback(),
  });

  const changed = await loadFunction(
    "scrapeGsshopOrders",
    globals(gsDocument(null, "GS샵 배송관리", false)),
  )();
  const loggedOut = await loadFunction(
    "scrapeGsshopOrders",
    globals(gsDocument(null, "GS샵 로그인", false)),
  )();

  assert.equal(changed.errorCode, "provider_contract_changed");
  assert.equal(changed.pendingLogin, undefined);
  assert.equal(loggedOut.errorCode, "login_required");
  assert.equal(loggedOut.pendingLogin, true);
});

test("Alwayz maps an unauthorized preflight to login instead of zero orders", async () => {
  const extractButton = {
    textContent: "엑셀추출하기",
    offsetParent: {},
    click() {},
  };
  const scrape = loadFunction("scrapeAlwayzOrders", {
    Blob,
    Promise,
    URL: { createObjectURL() {} },
    btoa: () => "",
    document: {
      querySelectorAll: () => [extractButton],
    },
    fetch: async () => ({ ok: false, status: 401 }),
    localStorage: { getItem: () => "expired-token" },
    setTimeout: (callback) => callback(),
  });

  const result = await scrape();

  assert.equal(result.success, false);
  assert.equal(result.pendingLogin, true);
  assert.equal(result.errorCode, "login_required");
  assert.equal(result.empty, undefined);
});

test("Alwayz accepts an authenticated empty preflight as zero orders", async () => {
  const extractButton = {
    textContent: "엑셀추출하기",
    offsetParent: {},
    click() {},
  };
  const scrape = loadFunction("scrapeAlwayzOrders", {
    Blob,
    Promise,
    URL: { createObjectURL() {} },
    btoa: () => "",
    document: { querySelectorAll: () => [extractButton] },
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    }),
    localStorage: { getItem: () => "active-token" },
    setTimeout: (callback) => callback(),
  });

  const result = await scrape();

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: true,
    empty: true,
    rowCount: 0,
  });
});

function boriboriResponse(status, body) {
  return {
    ok: false,
    status,
    url: "https://seller-club.co.kr/order/rest/deli/downloadPkgOrdDeliList/excel-xlsx",
    text: async () => body,
  };
}

async function runBoribori(response) {
  return loadFunction("scrapeBoriboriOrders", {
    Date,
    TextDecoder,
    URLSearchParams,
    Uint8Array,
    btoa: () => "",
    fetch: async () => response,
    location: { pathname: "/order/deli" },
    setTimeout: (callback) => callback(),
  })("");
}

test("Boribori accepts only an explicit no-order 404 as empty", async () => {
  const empty = await runBoribori(
    boriboriResponse(404, JSON.stringify({ message: "조회된 주문이 없습니다." })),
  );
  const unknown404 = await runBoribori(
    boriboriResponse(404, JSON.stringify({ message: "Not Found" })),
  );

  assert.equal(empty.success, true);
  assert.equal(empty.empty, true);
  assert.equal(unknown404.success, false);
  assert.equal(unknown404.errorCode, "provider_contract_changed");
  assert.equal(unknown404.empty, undefined);
});
