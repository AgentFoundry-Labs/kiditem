import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const collectorSource = await readFile(
  new URL(
    "../../kiditem-os/background/coupang/wing-search-collector.js",
    import.meta.url,
  ),
  "utf8",
);
const ATTEMPT_ID = "11111111-1111-4111-8111-111111111111";
const FORM_URL =
  "https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2";

function createHarness(cookie) {
  const requests = [];
  const context = vm.createContext({
    AbortController,
    Date,
    Error,
    JSON,
    Promise,
    URL,
    clearTimeout,
    queueMicrotask,
    setTimeout(callback) {
      queueMicrotask(callback);
      return 1;
    },
  });
  context.globalThis = context;
  vm.runInContext(collectorSource, context);
  const chrome = {
    runtime: { lastError: null },
    tabs: {
      create(_properties, callback) {
        callback({ id: 42, windowId: 7, url: FORM_URL, status: "complete" });
      },
      get(_tabId, callback) {
        callback({ id: 42, windowId: 7, url: FORM_URL, status: "complete" });
      },
    },
    scripting: {
      async executeScript({ func, args }) {
        const pageContext = vm.createContext({
          AbortSignal: { timeout: (timeoutMs) => ({ timeoutMs }) },
          document: { cookie },
          fetch: async (url, init) => {
            requests.push({ url, init });
            return {
              ok: true,
              status: 200,
              headers: { get: () => "application/json;charset=UTF-8" },
              text: async () => JSON.stringify({ result: [{ productId: 123, productName: "슬라임" }] }),
            };
          },
        });
        return [{ result: await vm.runInContext(`(${func.toString()})(...args)`, vm.createContext({ ...pageContext, args })) }];
      },
    },
  };
  const collector = context.KidItemWingSearchCollector.create({
    chrome,
    sessions: {
      async getOwned() {
        return { attemptId: ATTEMPT_ID, environmentId: "local", producer: "advertising.wing_rank" };
      },
      async attachTab() {},
    },
    environment: { bindTab: async () => {} },
    waitForTabComplete: async () => ({ url: FORM_URL, status: "complete" }),
    attention: async (_attemptId, _tabId, reason) => ({ success: false, attentionRequired: true, reason }),
  });
  return { collector, requests };
}

test("Wing catalog search mirrors the page XSRF request contract through collect", async () => {
  const { collector, requests } = createHarness("locale=ko_KR; XSRF-TOKEN=wing%2Ftoken%3D; other=value");
  const result = await collector.collect({ keyword: "슬라임", maxPages: 1, attemptId: ATTEMPT_ID, environmentId: "local" });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/tenants/seller-web/pre-matching/search");
  assert.deepEqual(JSON.parse(JSON.stringify(requests[0].init.headers)), {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "X-XSRF-TOKEN": "wing/token=",
  });
  assert.equal(requests[0].init.credentials, "include");
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    keyword: "슬라임",
    excludedProductIds: [],
    searchPage: 0,
    searchOrder: "DEFAULT",
    sortType: "DEFAULT",
  });
  assert.equal(requests[0].init.signal.timeoutMs, 20000);
  assert.equal(result.success, true);
});

test("Wing catalog search stops before fetch when the page XSRF token is missing", async () => {
  const { collector, requests } = createHarness("locale=ko_KR; other=value");
  const result = await collector.collect({ keyword: "슬라임", maxPages: 1, attemptId: ATTEMPT_ID, environmentId: "local" });

  assert.equal(requests.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: false,
    attentionRequired: true,
    reason: "marketplace_login",
  });
});
