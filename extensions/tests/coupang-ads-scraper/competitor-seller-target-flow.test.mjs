import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const collectorSource = await readFile(
  new URL(
    "../../kiditem-os/background/coupang/coupang-seller-identity-collector.js",
    import.meta.url,
  ),
  "utf8",
);
const sellerDetailSource = await readFile(
  new URL("../../kiditem-os/utils/coupang-seller-detail.js", import.meta.url),
  "utf8",
);

const ATTEMPT_ID = "10000000-0000-4000-8000-000000000001";
const PRODUCT_URL = "https://www.coupang.com/vp/products/123?itemId=456";

function createHarness({ afterCreate } = {}) {
  const attached = [];
  const bound = [];
  const removed = [];
  let active = true;
  let tab = { id: 41, windowId: 7, active: false, url: "about:blank", status: "complete" };
  const context = vm.createContext({
    Date,
    Error,
    JSON,
    Map,
    Promise,
    Set,
    String,
    URL,
    console,
    setTimeout,
  });
  context.globalThis = context;
  vm.runInContext(sellerDetailSource, context);
  vm.runInContext(collectorSource, context);

  const sessions = {
    async getOwned(attemptId, environmentId) {
      return attemptId === ATTEMPT_ID && environmentId === "local"
        ? { attemptId, environmentId, producer: "advertising.competitor_seller_identity" }
        : null;
    },
    async isActive() {
      return active;
    },
    async attachTab(attemptId, value) {
      attached.push({ attemptId, ...value });
      return { attemptId, ...value };
    },
  };
  const chrome = {
    runtime: { lastError: null },
    tabs: {
      create(properties, callback) {
        tab = { id: 41, windowId: 7, active: false, status: "complete", ...properties };
        afterCreate?.(() => { active = false; });
        callback(tab);
      },
      get(_tabId, callback) {
        callback(tab);
      },
      update(_tabId, properties, callback) {
        tab = { ...tab, ...properties, status: "complete" };
        callback(tab);
      },
      remove(tabId, callback) {
        removed.push(tabId);
        callback?.();
      },
    },
    scripting: {
      async executeScript({ func }) {
        const anchor = {
          href: "https://shop.coupang.com/vid/seller-42",
          textContent: "판매자 A 판매자 상품 보러가기",
        };
        const page = vm.createContext({
          URL,
          document: { querySelectorAll: () => [anchor] },
          location: { origin: "https://www.coupang.com" },
        });
        const result = vm.runInContext(`(${func.toString()})()`, page);
        return [{ result }];
      },
    },
  };
  const collector = context.KidItemCoupangSellerIdentityCollector.create({
    chrome,
    sessions,
    environment: { bindTab: async (tabId, environmentId) => bound.push({ tabId, environmentId }) },
    waitForTabComplete: async () => ({ url: tab.url, status: "complete" }),
    delay: async () => {},
  });
  return { collector, attached, bound, removed };
}

test("seller identity collector renders selected product details before executed seller-link extraction", async () => {
  const harness = createHarness();
  const result = await harness.collector.collect([
    { keyword: "연필", productKey: "p-1", productId: "123", link: PRODUCT_URL },
  ], {
    environmentId: "local",
    attemptId: ATTEMPT_ID,
    expiresAt: "2099-09-04T01:00:00.000Z",
  });

  assert.equal(result.success, true);
  assert.equal(result.identities.length, 1);
  assert.deepEqual({
    ...result.identities[0],
    capturedAt: "captured",
  }, {
    keyword: "연필",
    productKey: "p-1",
    productId: "123",
    vendorItemId: null,
    link: PRODUCT_URL,
    sellerName: "판매자 A",
    sellerId: "seller-42",
    sellerStoreUrl: "https://shop.coupang.com/vid/seller-42",
    capturedAt: "captured",
  });
  assert.deepEqual(harness.attached, [{
    attemptId: ATTEMPT_ID,
    tabId: 41,
    windowId: 7,
    closeOnCancel: true,
  }]);
  assert.deepEqual(harness.bound, [{ tabId: 41, environmentId: "local" }]);
});

test("seller identity collector rejects non-Coupang product URLs before navigation", async () => {
  const harness = createHarness();
  const result = await harness.collector.collect([
    { keyword: "연필", productKey: "p-1", link: "https://example.com/vp/products/123" },
  ], {
    environmentId: "local",
    attemptId: ATTEMPT_ID,
    expiresAt: "2099-09-04T01:00:00.000Z",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { success: true, identities: [] });
  assert.deepEqual(harness.attached, [{
    attemptId: ATTEMPT_ID,
    tabId: 41,
    windowId: 7,
    closeOnCancel: true,
  }]);
});

test("seller identity collector closes a created tab when cancellation wins before attachment", async () => {
  const harness = createHarness({ afterCreate: (cancel) => cancel() });
  const result = await harness.collector.collect([
    { keyword: "연필", productKey: "p-1", productId: "123", link: PRODUCT_URL },
  ], {
    environmentId: "local",
    attemptId: ATTEMPT_ID,
    expiresAt: "2099-09-04T01:00:00.000Z",
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), { success: false, cancelled: true });
  assert.deepEqual(harness.attached, []);
  assert.deepEqual(harness.bound, []);
  assert.deepEqual(harness.removed, [41]);
});
