import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const collectorSource = readFileSync(
  new URL(
    "../kiditem-os/background/orders/sellpia-shipment-tracking-collector.js",
    import.meta.url,
  ),
  "utf8",
);

function createHarness({ responseBody, status = 200, existingTab = null, activeSequence = null } = {}) {
  const requests = [];
  const events = [];
  const removedTabs = [];
  const createdTabs = [];
  let activeChecks = 0;
  const pageContext = vm.createContext({
    Date,
    JSON,
    Number,
    Object,
    Promise,
    String,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    fetch: async (url, init) => {
      requests.push({ url, body: new URLSearchParams(String(init?.body || "")) });
      return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(responseBody),
      };
    },
  });
  const chrome = {
    tabs: {
      query: async () => {
        throw new Error("Sellpia tracking must not discover caller tabs.");
      },
      create: async (properties) => {
        const tab = {
          id: 77,
          windowId: 5,
          status: "complete",
          ...properties,
        };
        createdTabs.push(tab);
        return tab;
      },
      remove: async (tabId) => {
        events.push("remove");
        removedTabs.push(tabId);
      },
    },
    scripting: {
      executeScript: async ({ func, args }) => {
        events.push("execute");
        const context = vm.createContext({ ...pageContext, args });
        return [{ result: await vm.runInContext(`(${func.toString()})(...args)`, context) }];
      },
    },
  };
  const context = vm.createContext({ Date, Error, Promise, String });
  vm.runInContext(collectorSource, context, {
    filename: "sellpia-shipment-tracking-collector.js",
  });
  const collection = {
    attachTab: async (tab) => {
      events.push(["attach", tab.id]);
      return { attemptId: "11111111-1111-4111-8111-111111111111" };
    },
    assertActive: async () => {
      if (!activeSequence) return true;
      const index = Math.min(activeChecks++, activeSequence.length - 1);
      return activeSequence[index];
    },
    detachTab: async (tab) => {
      events.push(["detach", tab.id]);
      await chrome.tabs.remove(tab.id);
    },
  };
  const collector = context.KidItemSellpiaShipmentTrackingCollector.create({
    chrome,
    waitForTabReady: async () => events.push("ready"),
    withTimeout: async (operation) => operation,
    isMallAccessError: () => false,
    mallAccessErrorResult: (mallName) => ({
      success: false,
      pendingLogin: true,
      error: `${mallName} login is required.`,
    }),
    mallGenericErrorResult: (mallName, error) => ({
      success: false,
      error: `${mallName} collection failed: ${String(error?.message || error)}`,
    }),
  });
  return {
    collector,
    collection,
    requests,
    events,
    removedTabs,
    createdTabs,
    existingTab,
    get activeChecks() { return activeChecks; },
  };
}

test("Sellpia tracking collector preserves delinum_date read-only capture and owned-tab lifecycle", async () => {
  const harness = createHarness({
    responseBody: {
      list: [{
        group_no: "GROUP_ORDER-1",
        delinum: "  INV-1 ",
        delicom: "1136",
        receiver: "홍길동 (스마트스토어)",
        receiver_post: "06000",
        receiver_addr1: "서울",
        receiver_addr2: " 1층 ",
        ship_info: {
          ord_no: "ORDER-1",
          provider_name: "스마트스토어",
        },
      }],
    },
  });

  const result = await harness.collector.collect({
    startDate: "2026-09-07",
    endDate: "2026-09-08",
    collection: harness.collection,
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: true,
    rows: [{
      ordNo: "ORDER-1",
      itemNo: "",
      invNo: "INV-1",
      courier: "1136",
      provider: "스마트스토어",
      receiver: "홍길동",
      post: "06000",
      addr: "서울 1층",
    }],
    total: 1,
    range: { start: "2026-09-07", end: "2026-09-08" },
  });
  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].url, "delivery_link.action.html");
  assert.equal(harness.requests[0].body.get("date_type"), "delinum_date");
  assert.equal(harness.requests[0].body.get("s_date"), "2026-09-07");
  assert.equal(harness.requests[0].body.get("e_date"), "2026-09-08");
  assert.deepEqual(harness.events, [
    ["attach", 77],
    "ready",
    "execute",
    ["detach", 77],
    "remove",
  ]);
  assert.deepEqual(harness.removedTabs, [77]);
});

test("Sellpia tracking collector always creates an inactive task-owned tab", async () => {
  const harness = createHarness({
    existingTab: {
      id: 91,
      windowId: 2,
      url: "https://kiditem.sellpia.com/order_delivery_reprint.html",
      status: "complete",
    },
    responseBody: { list: [] },
  });

  const result = await harness.collector.collect({
    startDate: "2026-09-07",
    endDate: "2026-09-07",
    collection: harness.collection,
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: true,
    rows: [],
    total: 0,
    range: { start: "2026-09-07", end: "2026-09-07" },
  });
  assert.deepEqual(harness.createdTabs.map(({ url, active }) => ({ url, active })), [{
    url: "https://kiditem.sellpia.com/order_delivery_reprint.html",
    active: false,
  }]);
  assert.deepEqual(harness.events, [
    ["attach", 77],
    "ready",
    "execute",
    ["detach", 77],
    "remove",
  ]);
  assert.deepEqual(harness.removedTabs, [77]);
});

test("Sellpia tracking collector fences provider execution after the owner is cancelled", async () => {
  const harness = createHarness({
    responseBody: { list: [] },
    activeSequence: [true, false],
  });
  const result = await harness.collector.collect({ collection: harness.collection });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: false,
    errorCode: "COLLECTION_CANCELLED",
    error: "Sellpia shipment tracking collection is no longer active.",
  });
  assert.equal(harness.activeChecks, 2);
  assert.deepEqual(harness.events, [
    ["attach", 77],
    "ready",
    ["detach", 77],
    "remove",
  ]);
  assert.equal(harness.requests.length, 0);
});

test("Sellpia tracking collector rejects malformed list envelopes while filtering incomplete rows", async () => {
  for (const responseBody of [null, {}, { list: null }, { list: {} }]) {
    const malformed = createHarness({ responseBody });
    const result = await malformed.collector.collect({ collection: malformed.collection });
    assert.equal(result.success, false, JSON.stringify(responseBody));
    assert.deepEqual(malformed.removedTabs, [77]);
  }

  const filtered = createHarness({
    responseBody: {
      list: [
        { delinum: "INV-MISSING-ORDER" },
        {
          group_no: "GROUP_MISSING_INVOICE",
          delinum: "",
          ship_info: { ord_no: "ORDER-MISSING-INVOICE" },
        },
        {
          group_no: "GROUP_VALID",
          delinum: "INV-VALID",
          ship_info: { ord_no: "ORDER-VALID" },
        },
      ],
    },
  });
  const result = await filtered.collector.collect({ collection: filtered.collection });
  assert.equal(result.success, true);
  assert.deepEqual(result.rows.map((row) => row.ordNo), ["ORDER-VALID"]);
});

test("Sellpia tracking collector keeps provider failures as read-only capture failures", async () => {
  const harness = createHarness({ status: 500, responseBody: { message: "failed" } });
  const result = await harness.collector.collect({
    startDate: "2026-09-07",
    endDate: "2026-09-07",
    collection: harness.collection,
  });

  assert.equal(result.success, false);
  assert.match(result.error, /HTTP 500/);
  assert.deepEqual(harness.removedTabs, [77]);
});
