import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const attemptId = "11111111-1111-4111-8111-111111111111";
const token = "22222222-2222-4222-8222-222222222222";
const control = {
  attemptId,
  attemptToken: token,
  channelAccountId: "33333333-3333-4333-8333-333333333333",
  state: "RUNNING",
  generation: "1",
  expiresAt: "2099-01-01T00:00:00.000Z",
  actualCutoffAt: null,
  errorCode: null,
  errorMessage: null,
  plan: {
    sourceType: "coupang_rocket_po_catalog",
    parserVersion: "rocket-po-v1",
    channelAccountId: "33333333-3333-4333-8333-333333333333",
    from: "2026-07-01",
    to: "2026-07-07",
    status: "PA",
    dateType: "PURCHASE_ORDER_DATE",
    requireConfirmation: true,
    vendorExpectations: {
      rocketVendorId: "A00123",
      sharedCoupangVendorId: null,
    },
  },
};

function fixture({ provider, requestHook, savedControl = control, DOMParser } = {}) {
  const context = vm.createContext({
    Date,
    Map,
    URL,
    setTimeout,
    clearTimeout,
  });
  for (const file of [
    "../shared/collection-session.js",
    "../kiditem-os/background/sourcing/source-attempt-wire.js",
    "../kiditem-os/background/orders/coupang-po-session.js",
    "../kiditem-os/background/orders/rocket-po-collection.js",
    "../kiditem-os/background/orders/rocket-po-source-owner.js",
  ])
    vm.runInContext(
      readFileSync(new URL(file, import.meta.url), "utf8"),
      context,
    );
  const storage = {};
  const calls = [];
  const providerUrls = [];
  const removedTabs = [];
  const focusedTabs = [];
  const injectedArgs = [];
  const timeouts = [];
  let nextTab = 40;
  const chrome = {
    storage: {
      local: {
        get: async (key) => ({ [key]: structuredClone(storage[key]) }),
        set: async (values) => Object.assign(storage, structuredClone(values)),
      },
    },
    tabs: {
      query: async () => [],
      create: async () => ({ id: ++nextTab, windowId: 7 }),
      get: async (id) => ({
        id,
        windowId: 7,
        url: "https://supplier.coupang.com/po-web/purchase/order",
      }),
      remove: async (id) => removedTabs.push(id),
      update: async (id) => focusedTabs.push(id),
    },
    windows: { update: async () => undefined },
    scripting: {
      executeScript: async ({ func, args }) => {
        injectedArgs.push(args);
        const isolated = vm.createContext({
          fetch: async (url) => {
            providerUrls.push(url);
            return provider
              ? provider(url)
              : {
                  ok: true,
                  text: async () =>
                    JSON.stringify({ body: { body: [], lastPageNumber: 1 } }),
                };
          },
          DOMParser,
        });
        const injected = vm.runInContext(`(${func.toString()})`, isolated);
        return [{ result: await injected(...args) }];
      },
    },
  };
  const sessions = context.KidItemCollectionSession.create({
    chrome,
    storageKey: "sessions",
    webUrlPatterns: [],
  });
  const sessionApi = sessions;
  const poSession = context.KidItemCoupangPoSession.create({
    chrome,
    attachOrderCollectionTab: (collection, tab, owned) =>
      collection.attachTab(tab, { owned }),
    waitForTabReady: async (id) => chrome.tabs.get(id),
  });
  const collector = context.KidItemRocketPoCollection.create({
    chrome,
    coupangPoSession: poSession,
    withTimeout: async (promise, timeout) => {
      timeouts.push(timeout);
      return promise;
    },
  });
  let current = structuredClone(savedControl);
  const owner = context.KidItemRocketPoSourceOwner.create({
    chrome,
    sessions: sessionApi,
    collect: collector.collect,
    request: async (environmentId, path, init) => {
      calls.push({ environmentId, path, ...init });
      const response = (body, status = 200) => ({
        ok: status < 400,
        status,
        json: async () => body,
      });
      if (requestHook) {
        const handled = await requestHook({
          path,
          init,
          response,
          setState: (state) => {
            current.state = state;
          },
        });
        if (handled) return handled;
      }
      if (init.method !== "GET") {
        current.state = init.method === "PUT" ? "COMPLETE" : "FAILED";
        if (current.state === "FAILED") {
          const failure = JSON.parse(init.body);
          current.errorCode = failure.code;
          current.errorMessage = failure.message;
        }
      }
      return response(structuredClone(current));
    },
  });
  return {
    collector,
    owner,
    sessions: sessionApi,
    calls,
    providerUrls,
    removedTabs,
    focusedTabs,
    storage,
    injectedArgs,
    timeouts,
  };
}

test("actual serialized Rocket collector uploads empty evidence using only the owner plan", async () => {
  const f = fixture();
  const result = await f.owner.run({ environmentId: "office", attemptId });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: true,
    attemptId,
    terminalState: "COMPLETE",
  });
  assert.equal(f.calls.length, 2);
  const upload = f.calls[1];
  assert.equal(upload.environmentId, "office");
  assert.equal(upload.method, "PUT");
  assert.equal(upload.headers["x-source-attempt-token"], token);
  const body = JSON.parse(upload.body);
  assert.deepEqual(body.rows, []);
  assert.equal(body.collection.collectionRunId, attemptId);
  assert.deepEqual(body.proof, {
    from: "2026-07-01",
    to: "2026-07-07",
    status: "PA",
    dateType: "PURCHASE_ORDER_DATE",
    validatedList: true,
  });
  assert.deepEqual(
    [...f.injectedArgs[0]],
    ["2026-07-01", "2026-07-07", "PA", "PURCHASE_ORDER_DATE", attemptId],
  );
  assert.deepEqual(f.timeouts, [180000]);
  assert.equal(f.providerUrls.length, 1);
  assert.deepEqual(f.removedTabs, [41]);
  assert.equal((await f.sessions.list()).length, 0);
  assert.equal(JSON.stringify(f.storage).includes(token), false);
});

test("collector.collect validates list/detail totals before returning usable rows", async () => {
  const skuTable = {
    textContent: "상품 번호 발주금액",
    rows: [{
      cells: [
        "1", "P-1", "8801234567890 상품명", "", "398", "", "6000", "5000", "1000", "2390000",
      ].map((textContent) => ({ textContent })),
    }],
  };
  class DOMParser {
    parseFromString() {
      return { querySelectorAll: () => [skuTable] };
    }
  }
  const f = fixture({
    DOMParser,
    provider: async (url) => {
      if (String(url).startsWith("/po-web/app/purchase-order/list")) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            body: {
              body: [{
                purchaseOrderSeq: 1001,
                purchaseOrderStatus: "PA",
                vendorId: "A00123",
                expectedDeliveryDate: "2026-07-08T00:00:00.000Z",
                skuCount: 1,
                sumOfOrderQty: 398,
                sumOfOrderAmount: 2390000,
                sumOfVendorConfirmedQty: 81,
                sumOfVendorConfirmedAmount: 486000,
              }],
              lastPageNumber: 1,
            },
          }),
        };
      }
      return { ok: true, text: async () => "<html></html>" };
    },
  });

  const result = await f.collector.collect(control.plan, {
    attemptId,
    attachTab: async () => undefined,
    detachTab: async () => undefined,
  });

  assert.equal(result.success, true);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].orderQty, 398);
  assert.equal(result.rows[0].plannedDeliveryDate, "2026-07-08");
  assert.equal(result.evidence.detailPoCount, 1);
  assert.deepEqual([...result.evidence.failedPoNumbers], []);
});

test("collector.collect rejects malformed required list numerics before detail IO", async () => {
  for (const [field, value] of [
    ["skuCount", "bad12"],
    ["sumOfOrderQty", "1,2"],
    ["sumOfOrderAmount", "[12]"],
    ["sumOfOrderQty", ""],
    ["sumOfOrderQty", null],
    ["sumOfOrderQty", false],
    ["sumOfOrderQty", {}],
  ]) {
    let detailCalls = 0;
    const f = fixture({
      provider: async (url) => {
        if (String(url).startsWith("/po-web/app/purchase-order/list")) {
          return {
            ok: true,
            text: async () => JSON.stringify({
              body: {
                body: [{
                  purchaseOrderSeq: 1001,
                  purchaseOrderStatus: "PA",
                  vendorId: "A00123",
                  expectedDeliveryDate: "2026-07-08T00:00:00.000Z",
                  skuCount: 1,
                  sumOfOrderQty: 2,
                  sumOfOrderAmount: 990,
                  [field]: value,
                }],
                lastPageNumber: 1,
              },
            }),
          };
        }
        detailCalls += 1;
        return { ok: true, text: async () => "<html></html>" };
      },
    });
    const result = await f.collector.collect(control.plan, {
      attemptId,
      attachTab: async () => undefined,
      detachTab: async () => undefined,
    });
    assert.equal(result.success, false, `${field}:${String(value)}`);
    assert.equal(result.errorCode, "rocket_po_collection_incomplete");
    assert.match(result.error, /missing or invalid/);
    assert.equal(Object.hasOwn(result, "rows"), false);
    assert.equal(detailCalls, 0);
  }
});

test("collector.collect rejects invalid calendar dates before detail IO", async () => {
  for (const expectedDeliveryDate of [
    "2026-02-31",
    "2026-02-31T00:00:00.000Z",
    "2026-13-01T00:00:00.000Z",
    "2026-07-08T25:00:00.000Z",
  ]) {
    let detailCalls = 0;
    const f = fixture({
      provider: async (url) => {
        if (String(url).startsWith("/po-web/app/purchase-order/list")) {
          return {
            ok: true,
            text: async () => JSON.stringify({
              body: {
                body: [{
                  purchaseOrderSeq: 1001,
                  purchaseOrderStatus: "PA",
                  vendorId: "A00123",
                  expectedDeliveryDate,
                  skuCount: 1,
                  sumOfOrderQty: 2,
                  sumOfOrderAmount: 990,
                }],
                lastPageNumber: 1,
              },
            }),
          };
        }
        detailCalls += 1;
        return { ok: true, text: async () => "<html></html>" };
      },
    });
    const result = await f.collector.collect(control.plan, {
      attemptId,
      attachTab: async () => undefined,
      detachTab: async () => undefined,
    });
    assert.equal(result.success, false, expectedDeliveryDate);
    assert.equal(result.errorCode, "rocket_po_collection_incomplete");
    assert.match(result.error, /expected delivery date is invalid/);
    assert.equal(Object.hasOwn(result, "rows"), false);
    assert.equal(detailCalls, 0);
  }
});

test("collector.collect retries one transient detail mismatch and never returns partial rows", async () => {
  let detailCalls = 0;
  const skuTable = {
    textContent: "상품 번호 발주금액",
    rows: [{
      cells: [
        "1", "P-1", "8801234567890 상품명", "", "81", "", "6000", "5000", "1000", "486000",
      ].map((textContent) => ({ textContent })),
    }],
  };
  class DOMParser {
    parseFromString() {
      return { querySelectorAll: () => [skuTable] };
    }
  }
  const f = fixture({
    DOMParser,
    provider: async (url) => {
      if (String(url).startsWith("/po-web/app/purchase-order/list")) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            body: {
              body: [{
                purchaseOrderSeq: 1001,
                purchaseOrderStatus: "PA",
                vendorId: "A00123",
                expectedDeliveryDate: "2026-07-08T00:00:00.000Z",
                skuCount: 1,
                sumOfOrderQty: 398,
                sumOfOrderAmount: 2390000,
                sumOfVendorConfirmedQty: 81,
              }],
              lastPageNumber: 1,
            },
          }),
        };
      }
      detailCalls += 1;
      return { ok: true, text: async () => "<html></html>" };
    },
  });

  const result = await f.collector.collect(control.plan, {
    attemptId,
    attachTab: async () => undefined,
    detachTab: async () => undefined,
  });

  assert.equal(result.success, false);
  assert.equal(result.errorCode, "rocket_po_collection_incomplete");
  assert.match(result.error, /1001/);
  assert.equal(Object.hasOwn(result, "rows"), false);
  assert.equal(detailCalls, 2);
});

test("collector.collect accepts a detail mismatch only after one retry recovers the list totals", async () => {
  let detailCalls = 0;
  const tableFor = (orderQty, totalPurchase) => ({
    textContent: "상품 번호 발주금액",
    rows: [{
      cells: [
        "1", "P-1", "8801234567890 상품명", "", String(orderQty), "", "6000", "5000", "1000", String(totalPurchase),
      ].map((textContent) => ({ textContent })),
    }],
  });
  class DOMParser {
    parseFromString() {
      return {
        querySelectorAll: () => [
          detailCalls === 1 ? tableFor(81, 486000) : tableFor(398, 2390000),
        ],
      };
    }
  }
  const f = fixture({
    DOMParser,
    provider: async (url) => {
      if (String(url).startsWith("/po-web/app/purchase-order/list")) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            body: {
              body: [{
                purchaseOrderSeq: 1001,
                purchaseOrderStatus: "PA",
                vendorId: "A00123",
                expectedDeliveryDate: "2026-07-08T00:00:00.000Z",
                skuCount: 1,
                sumOfOrderQty: 398,
                sumOfOrderAmount: 2390000,
                sumOfVendorConfirmedQty: 81,
              }],
              lastPageNumber: 1,
            },
          }),
        };
      }
      detailCalls += 1;
      return { ok: true, text: async () => "<html></html>" };
    },
  });

  const result = await f.collector.collect(control.plan, {
    attemptId,
    attachTab: async () => undefined,
    detachTab: async () => undefined,
  });

  assert.equal(result.success, true);
  assert.equal(result.rows[0].orderQty, 398);
  assert.equal(detailCalls, 2);
});

test("collector.collect rejects a zero-total PO when the detail SKU table is missing", async () => {
  let detailCalls = 0;
  class DOMParser {
    parseFromString() {
      return { querySelectorAll: () => [] };
    }
  }
  const f = fixture({
    DOMParser,
    provider: async (url) => {
      if (String(url).startsWith("/po-web/app/purchase-order/list")) {
        return {
          ok: true,
          text: async () => JSON.stringify({
            body: {
              body: [{
                purchaseOrderSeq: 1001,
                purchaseOrderStatus: "PA",
                vendorId: "A00123",
                expectedDeliveryDate: "2026-07-08T00:00:00.000Z",
                skuCount: 0,
                sumOfOrderQty: 0,
                sumOfOrderAmount: 0,
              }],
              lastPageNumber: 1,
            },
          }),
        };
      }
      detailCalls += 1;
      return { ok: true, text: async () => "<html></html>" };
    },
  });

  const result = await f.collector.collect(control.plan, {
    attemptId,
    attachTab: async () => undefined,
    detachTab: async () => undefined,
  });

  assert.equal(result.success, false);
  assert.equal(result.errorCode, "rocket_po_collection_incomplete");
  assert.match(result.error, /no valid SKU rows/);
  assert.equal(Object.hasOwn(result, "rows"), false);
  assert.equal(detailCalls, 2);
});

test("lost terminal ACK retries identical bytes without provider recollection or contradictory failure", async () => {
  const f = fixture({
    requestHook: ({ init, setState }) => {
      if (init.method === "PUT") {
        setState("COMPLETE");
        throw new Error("reply lost");
      }
    },
  });
  assert.equal(
    (await f.owner.run({ environmentId: "office", attemptId })).terminalState,
    "COMPLETE",
  );
  const uploads = f.calls.filter((call) => call.method === "PUT");
  assert.equal(uploads.length, 3);
  assert.equal(new Set(uploads.map((call) => call.body)).size, 1);
  assert.equal(f.providerUrls.length, 1);
  assert.equal(
    f.calls.some((call) => call.path.endsWith("/fail")),
    false,
  );
});

test("a persisted stop fence blocks Rocket's second normal terminal PUT after a 503", async () => {
  let putCount = 0;
  const f = fixture({
    requestHook: async ({ init, response }) => {
      if (init.method !== "PUT") return null;
      putCount += 1;
      if (putCount === 1) {
        await f.sessions.requestCancellation(attemptId, "office");
        return response({ message: "temporary" }, 503);
      }
      return null;
    },
  });

  const result = await f.owner.run({ environmentId: "office", attemptId });

  assert.equal(result.success, false);
  assert.equal(result.terminalState, "RUNNING");
  assert.equal(result.errorCode, "SOURCE_RESULT_UNCONFIRMED");
  assert.equal(putCount, 1);
  assert.equal(f.calls.filter((call) => call.method === "PUT").length, 1);
  assert.deepEqual(f.removedTabs, [41]);
});

test("login keeps the existing one fresh-tab retry, then owner FAILED and attention only", async () => {
  const f = fixture({
    provider: async () => ({
      ok: true,
      text: async () => "<html>login</html>",
    }),
  });
  const result = await f.owner.run({ environmentId: "office", attemptId });
  assert.equal(result.terminalState, "FAILED");
  assert.equal(result.errorCode, "coupang_po_session_required");
  assert.equal(f.providerUrls.length, 2);
  assert.deepEqual(f.timeouts, [180000, 180000]);
  assert.deepEqual(f.removedTabs, [41]);
  assert.equal((await f.sessions.get(attemptId)).attention.canOpenTab, true);
  await f.sessions.openAttentionTab(attemptId);
  assert.deepEqual(f.focusedTabs, [42]);
  const stored = JSON.stringify(f.storage);
  for (const forbidden of [
    token,
    "attemptToken",
    "terminalState",
    "FAILED",
    "vendorExpectations",
    "collectionRunId",
  ]) {
    assert.equal(stored.includes(forbidden), false, forbidden);
  }
});

test("bad/expired plans are rejected before provider IO and terminal replay does not recollect", async () => {
  for (const invalid of [
    { ...control, expiresAt: "2000-01-01T00:00:00.000Z" },
    { ...control, plan: { ...control.plan, sourceType: "other" } },
    { ...control, plan: { ...control.plan, channelAccountId: "foreign" } },
  ]) {
    const f = fixture({ savedControl: invalid });
    await assert.rejects(
      f.owner.run({ environmentId: "office", attemptId }),
      /PLAN_INVALID|EXPIRED/,
    );
    assert.equal(f.providerUrls.length, 0);
    assert.equal((await f.sessions.list()).length, 0);
  }
  const complete = fixture({ savedControl: { ...control, state: "COMPLETE" } });
  assert.equal(
    (await complete.owner.run({ environmentId: "office", attemptId }))
      .terminalState,
    "COMPLETE",
  );
  assert.equal(complete.providerUrls.length, 0);
});

test("definitive malformed capture rejection fails the owner, while fence/uncertain refusal never contradicts PUT", async () => {
  for (const status of [400, 409, 503]) {
    const f = fixture({
      requestHook: ({ init, response }) =>
        init.method === "PUT"
          ? response({ message: "invalid source evidence" }, status)
          : null,
    });
    const result = await f.owner.run({ environmentId: "office", attemptId });
    assert.equal(result.terminalState, status === 400 ? "FAILED" : "RUNNING");
    assert.equal(
      f.calls.filter((call) => call.path.endsWith("/fail")).length,
      status === 400 ? 1 : 0,
    );
    assert.equal(
      f.calls.filter((call) => call.method === "PUT").length,
      status === 503 ? 3 : 1,
    );
  }
});

test("cancel checks environment and waits for owner terminal ACK before discarding progress", async () => {
  const f = fixture();
  await f.sessions.start({
    attemptId,
    environmentId: "office",
    producer: "orders.coupang_rocket_po",
  });
  assert.equal(
    await f.owner.cancel({ environmentId: "local", attemptId }),
    null,
  );
  assert.equal(f.calls.length, 0);
  assert.equal(
    (await f.owner.cancel({ environmentId: "office", attemptId }))
      .terminalState,
    "FAILED",
  );
  assert.equal((await f.sessions.list()).length, 0);
  assert.equal(f.providerUrls.length, 0);
  const refused = fixture({
    requestHook: ({ init, response }) =>
      init.method === "POST" ? response({ message: "unavailable" }, 503) : null,
  });
  await refused.sessions.start({
    attemptId,
    environmentId: "office",
    producer: "orders.coupang_rocket_po",
  });
  await assert.rejects(
    refused.owner.cancel({ environmentId: "office", attemptId }),
    /unavailable/,
  );
  assert.notEqual(await refused.sessions.get(attemptId), null);
});

test("simultaneous delivery of the same attempt shares one provider capture", async () => {
  const f = fixture();
  const results = await Promise.all([
    f.owner.run({ environmentId: "office", attemptId }),
    f.owner.run({ environmentId: "office", attemptId }),
  ]);
  assert.equal(
    results.every((result) => result.terminalState === "COMPLETE"),
    true,
  );
  assert.equal(f.providerUrls.length, 1);
  assert.equal(f.calls.filter((call) => call.method === "PUT").length, 1);
});

test("a later rejection cannot turn an earlier committed but unacknowledged upload into failure", async () => {
  let uploads = 0;
  const f = fixture({
    requestHook: ({ init, setState, response }) => {
      if (init.method !== "PUT") return null;
      uploads += 1;
      if (uploads === 1) {
        setState("COMPLETE");
        throw new Error("reply lost");
      }
      return response({ message: "request rejected" }, 400);
    },
  });
  assert.equal(
    (await f.owner.run({ environmentId: "office", attemptId })).terminalState,
    "COMPLETE",
  );
  assert.equal(
    f.calls.some((call) => call.path.endsWith("/fail")),
    false,
  );
});

test("cancel recovers a lost failure ACK from the exact owner before cleaning up", async () => {
  const f = fixture({
    requestHook: ({ init, setState }) => {
      if (init.method === "POST") {
        setState("FAILED");
        throw new Error("reply lost");
      }
    },
  });
  await f.sessions.start({
    attemptId,
    environmentId: "office",
    producer: "orders.coupang_rocket_po",
  });
  assert.equal(
    (await f.owner.cancel({ environmentId: "office", attemptId }))
      .terminalState,
    "FAILED",
  );
  assert.equal((await f.sessions.list()).length, 0);
  assert.equal(f.providerUrls.length, 0);
});
