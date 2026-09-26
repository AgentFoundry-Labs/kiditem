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
