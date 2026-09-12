import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL(
    "../../kiditem-os/background/coupang/wing-search-collector.js",
    import.meta.url,
  ),
  "utf8",
);

const ATTEMPT_ID = "11111111-1111-4111-8111-111111111111";
const FORM_URL =
  "https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2";

function createHarness(
  responses,
  {
    cookie = "XSRF-TOKEN=fixture",
    producer = "advertising.wing_rank",
    environmentId = "local",
    waitForTabComplete = async () => ({ url: FORM_URL, status: "complete" }),
    onGetOwned,
    onBind,
    onAttach,
    attachResult = { attemptId: ATTEMPT_ID },
    attention,
  } = {},
) {
  const requests = [];
  const delays = [];
  const createdTabs = [];
  const removedTabs = [];
  const attachedTabs = [];
  const boundTabs = [];
  let injection = 0;
  let tab = { id: 42, windowId: 7, url: FORM_URL, status: "complete" };
  let active = true;
  const context = vm.createContext({
    AbortController,
    Date,
    Error,
    JSON,
    Promise,
    URL,
    clearTimeout,
    queueMicrotask,
    setTimeout(callback, milliseconds) {
      delays.push(milliseconds);
      queueMicrotask(callback);
      return 1;
    },
  });
  context.globalThis = context;
  vm.runInContext(source, context, { filename: "wing-search-collector.js" });

  const sessions = {
    async getOwned(attemptId, requestedEnvironment) {
      if (!active || attemptId !== ATTEMPT_ID || requestedEnvironment !== environmentId) {
        return null;
      }
      const extra = await onGetOwned?.();
      if (extra === null) return null;
      return { attemptId, environmentId, producer, ...(extra || {}) };
    },
    async attachTab(attemptId, value) {
      attachedTabs.push({ attemptId, ...value });
      await onAttach?.();
      return attachResult;
    },
  };
  const chrome = {
    runtime: { lastError: null },
    tabs: {
      create(properties, callback) {
        createdTabs.push(properties);
        tab = { id: 42, windowId: 7, status: "complete", ...properties };
        callback?.(tab);
        return Promise.resolve(tab);
      },
      get(_tabId, callback) {
        callback?.(tab);
        return Promise.resolve(tab);
      },
      remove(tabId, callback) {
        removedTabs.push(tabId);
        callback?.();
        return Promise.resolve();
      },
    },
    scripting: {
      async executeScript({ func, args }) {
        const response = responses[injection++];
        if (response instanceof Error) throw response;
        const pageContext = vm.createContext({
          AbortSignal: { timeout: (timeoutMs) => ({ timeoutMs }) },
          document: { cookie },
          fetch: async (url, init) => {
            requests.push({ url, init });
            return {
              ok: response.status === 200,
              status: response.status,
              headers: {
                get: (name) =>
                  name.toLowerCase() === "content-type"
                    ? response.contentType || "application/json"
                    : null,
              },
              text: async () => JSON.stringify(response.body),
            };
          },
        });
        return [{ result: await vm.runInContext(`(${func.toString()})(...args)`, vm.createContext({
          ...pageContext,
          args,
        })) }];
      },
    },
  };
  const collector = context.KidItemWingSearchCollector.create({
    chrome,
    sessions,
    environment: {
      bindTab: async (tabId, value) => {
        boundTabs.push({ tabId, environmentId: value });
        await onBind?.();
      },
    },
    waitForTabComplete,
    attention: attention || (async (attemptId, tabId, reason, message) => ({
      success: false,
      attentionRequired: true,
      runId: attemptId,
      tabId,
      reason,
      error: message,
    })),
  });
  return {
    collector,
    requests,
    delays,
    createdTabs,
    removedTabs,
    attachedTabs,
    boundTabs,
    setActive(value) {
      active = value;
    },
    setTab(value) {
      tab = value;
    },
  };
}

function collectInput(extra = {}) {
  return {
    keyword: "블록",
    maxPages: 5,
    attemptId: ATTEMPT_ID,
    environmentId: "local",
    ...extra,
  };
}

test("Wing search collector owns request payload, cursor proof, normalization, and dedupe", async () => {
  const product = {
    productId: 101,
    itemId: 201,
    vendorItemId: 301,
    productName: "블록",
    salePrice: 1000,
    salesLast28d: 3,
    pvLast28Day: 12,
    rating: 4.5,
    ratingCount: 8,
    displayCategoryInfo: [{ categoryHierarchy: "완구 > 블록" }],
  };
  const harness = createHarness([
    { status: 429, body: {} },
    { status: 200, body: { result: [product], nextSearchPage: 2 } },
    { status: 200, body: {
      result: [product, { ...product, productId: 102, vendorItemId: 302 }],
      nextSearchPage: null,
    } },
  ]);

  const result = await harness.collector.collect(collectInput());

  assert.deepEqual(
    harness.requests.map(({ url, init }) => ({
      url,
      method: init.method,
      credentials: init.credentials,
      body: JSON.parse(init.body),
    })),
    [
      { url: "/tenants/seller-web/pre-matching/search", method: "POST", credentials: "include",
        body: { keyword: "블록", excludedProductIds: [], searchPage: 0, searchOrder: "DEFAULT", sortType: "DEFAULT" } },
      { url: "/tenants/seller-web/pre-matching/search", method: "POST", credentials: "include",
        body: { keyword: "블록", excludedProductIds: [], searchPage: 0, searchOrder: "DEFAULT", sortType: "DEFAULT" } },
      { url: "/tenants/seller-web/pre-matching/search", method: "POST", credentials: "include",
        body: { keyword: "블록", excludedProductIds: [], searchPage: 2, searchOrder: "DEFAULT", sortType: "DEFAULT" } },
    ],
  );
  assert.deepEqual(JSON.parse(JSON.stringify(result.pages.map((page) => page.searchPage))), [0, 2]);
  assert.equal(result.stopReason, "no_next_search_page");
  assert.equal(result.dateWindow, "last28d");
  assert.equal(result.rows.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(result.rows[0])), {
    productId: "101",
    itemId: "201",
    vendorItemId: "301",
    productName: "블록",
    itemName: null,
    brandName: null,
    manufacture: null,
    categoryHierarchy: "완구 > 블록",
    imagePath: null,
    salePrice: 1000,
    rating: 4.5,
    ratingCount: 8,
    pvLast28Day: 12,
    salesLast28d: 3,
    estimatedRevenue28d: 3000,
    conversionRate28d: 0.25,
    deliveryInfo: null,
  });
  assert.deepEqual(harness.delays, [4000, 2200]);
  assert.deepEqual(harness.boundTabs, [{ tabId: 42, environmentId: "local" }]);
  assert.deepEqual(harness.attachedTabs, [{ attemptId: ATTEMPT_ID, tabId: 42, windowId: 7 }]);
});

test("Wing search collector proves the actual result array without turning an absent array into rows", async () => {
  const harness = createHarness([{ status: 200, body: {} }]);
  const result = await harness.collector.collect(collectInput({ maxPages: 1 }));

  assert.equal(result.success, true);
  assert.equal(result.stopReason, "empty_page");
  assert.deepEqual(JSON.parse(JSON.stringify(result.rows)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(result.pages[0])), {
    searchPage: 0,
    itemCount: 0,
    resultArrayObserved: false,
    nextSearchPage: null,
    total: null,
  });
});

test("Wing search collector keeps unknown numeric fields nullable and accepts only the exact Wing form path", async () => {
  const harness = createHarness([
    { status: 200, body: { result: [{
      productId: 99,
      productName: "미완성 행",
      salePrice: [],
      salesLast28d: {},
      pvLast28Day: false,
      rating: { value: 4.5 },
      ratingCount: "0",
    }] } },
  ], {
    waitForTabComplete: async () => ({
      url: `${FORM_URL}?foo=bar#ready`,
      status: "complete",
    }),
  });
  const result = await harness.collector.collect(collectInput({ maxPages: 1 }));
  const row = JSON.parse(JSON.stringify(result.rows[0]));

  assert.equal(row.salePrice, null);
  assert.equal(row.salesLast28d, null);
  assert.equal(row.pvLast28Day, null);
  assert.equal(row.rating, null);
  assert.equal(row.ratingCount, 0);
  assert.equal(row.estimatedRevenue28d, null);
  assert.equal(row.conversionRate28d, null);

  const wrongPath = createHarness([{ status: 200, body: { result: [] } }], {
    waitForTabComplete: async () => ({
      url: "https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2-extra",
      status: "complete",
    }),
  });
  const attention = await wrongPath.collector.collect(collectInput({ maxPages: 1 }));
  assert.equal(attention.attentionRequired, true);
  assert.equal(attention.reason, "marketplace_login");
  assert.deepEqual(wrongPath.removedTabs, []);
});

test("Wing search collector returns attention for first-page authentication and rate-limit failures", async () => {
  const reasons = [];
  const attention = async (_attemptId, _tabId, reason, message) => {
    reasons.push({ reason, message });
    return { success: false, attentionRequired: true, reason };
  };
  const missingXsrf = createHarness([{ status: 200, body: {} }], {
    cookie: "locale=ko_KR",
    attention,
  });
  assert.deepEqual(
    await missingXsrf.collector.collect(collectInput({ maxPages: 1 })),
    { success: false, attentionRequired: true, reason: "marketplace_login" },
  );

  const rateLimited = createHarness([
    ...Array.from({ length: 4 }, () => ({ status: 429, body: {} })),
  ], { attention });
  const result = await rateLimited.collector.collect(collectInput({ maxPages: 1 }));
  assert.deepEqual(result, { success: false, attentionRequired: true, reason: "rate_limited" });
  assert.deepEqual(reasons.map(({ reason }) => reason), ["marketplace_login", "rate_limited"]);
  assert.deepEqual(rateLimited.delays, [4000, 8000, 16000]);
});

test("Wing search collector preserves partial rows and the later-page incomplete proof", async () => {
  const harness = createHarness([
    { status: 200, body: { result: [{ productId: 1, productName: "블록" }], nextSearchPage: 3 } },
    ...Array.from({ length: 4 }, () => ({ status: 503, body: {} })),
  ]);
  const result = await harness.collector.collect(collectInput());

  assert.equal(result.success, true);
  assert.equal(result.rows.length, 1);
  assert.equal(result.stopReason, "non_json_response");
  assert.equal(result.pages.length, 1);
  assert.deepEqual(harness.requests.map(({ init }) => JSON.parse(init.body).searchPage), [0, 3, 3, 3, 3]);
  assert.deepEqual(harness.delays, [2200, 1000, 2000, 4000]);
});

test("Wing search collector keeps owner/environment fences and cancellation at its interface", async () => {
  const wrongProducer = createHarness([{ status: 200, body: { result: [] } }], {
    producer: "advertising.other",
  });
  await assert.rejects(
    wrongProducer.collector.collect(collectInput({ maxPages: 1 })),
    /source_owner_session_invalid/,
  );

  const wrongEnvironment = createHarness([{ status: 200, body: { result: [] } }], {
    environmentId: "office",
  });
  await assert.rejects(
    wrongEnvironment.collector.collect(collectInput({ maxPages: 1 })),
    /source_owner_session_invalid/,
  );

  const aborted = new AbortController();
  aborted.abort(new Error("operator_cancelled"));
  const cancelled = createHarness([]);
  await assert.rejects(
    cancelled.collector.collect(collectInput({ signal: aborted.signal })),
    /operator_cancelled/,
  );

  const ownerLost = createHarness([
    { status: 200, body: { result: [{ productId: 1 }], nextSearchPage: 2 } },
  ], { onGetOwned: (() => {
    let calls = 0;
    return () => (++calls > 3 ? null : undefined);
  })() });
  const result = await ownerLost.collector.collect(collectInput());
  assert.equal(result.cancelled, true);
  assert.equal(result.tabId, 42);
});

test("Wing search collector reuses an owned tab and never adopts a missing tab", async () => {
  const harness = createHarness([{ status: 200, body: { result: [] } }]);
  harness.setTab({ id: 99, windowId: 12, url: FORM_URL, status: "complete" });
  await harness.collector.collect(collectInput({ collectionTabId: 99, maxPages: 1 }));
  assert.deepEqual(harness.createdTabs, []);
  assert.deepEqual(harness.boundTabs, [{ tabId: 99, environmentId: "local" }]);
  assert.deepEqual(harness.attachedTabs, [{ attemptId: ATTEMPT_ID, tabId: 99, windowId: 12 }]);
});

test("Wing search collector closes a newly created tab when session attachment is refused", async () => {
  const harness = createHarness([], { attachResult: null });

  const result = await harness.collector.collect(collectInput({ maxPages: 1 }));

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: false,
    cancelled: true,
    tabId: 42,
    runId: ATTEMPT_ID,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(harness.createdTabs)), [{
    url: FORM_URL,
    active: false,
  }]);
  assert.deepEqual(harness.removedTabs, [42]);
  assert.deepEqual(harness.requests, []);
});

test("Wing search collector closes a created tab when cancellation arrives during binding", async () => {
  const harness = createHarness([], {
    onBind: () => harness.setActive(false),
  });

  const result = await harness.collector.collect(collectInput({ maxPages: 1 }));

  assert.equal(result.cancelled, true);
  assert.equal(result.tabId, 42);
  assert.deepEqual(harness.removedTabs, [42]);
  assert.deepEqual(harness.attachedTabs, []);
  assert.deepEqual(harness.requests, []);
});
