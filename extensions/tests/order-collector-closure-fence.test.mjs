import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const workerPath = path.join(repoRoot, "extensions/kiditem-os/background/orders/worker.js");

function loadAdditionalCollectionContext(sessionStorage = {}, options = {}) {
  const source = readFileSync(workerPath, "utf8");
  const start = source.indexOf("const ordersAdditionalCollections = new Map();");
  const end = source.indexOf("const KIDSNOTE_ORDER_URL", start);
  assert.ok(start >= 0 && end > start, "worker must define the additional collection context");
  const removedTabs = [];
  const context = vm.createContext({
    chrome: {
      storage: {
        session: {
          async get(key) {
            if (typeof options.beforeSessionRead === "function") {
              await options.beforeSessionRead(key);
            }
            return { [key]: structuredClone(sessionStorage[key]) };
          },
          async set(values) {
            if (typeof options.beforeSessionSet === "function") {
              await options.beforeSessionSet(values);
            }
            if (options.sessionSetFails || options.sessionSetFailsRemaining > 0) {
              if (options.sessionSetFailsRemaining > 0) options.sessionSetFailsRemaining -= 1;
              throw new Error("session storage set failed");
            }
            Object.assign(sessionStorage, structuredClone(values));
          },
        },
      },
      tabs: {
        async remove(tabId) {
          removedTabs.push(tabId);
          if (options.removeFailsFor?.has(tabId)) {
            throw new Error(`tab ${tabId} is still open`);
          }
        },
        async query() {
          return [...(options.existingTabIds || [])].map((id) => ({ id }));
        },
      },
    },
  });
  vm.runInContext(
    `${source.slice(start, end)}\nthis.__ordersFence = {\n` +
      "run: runOrdersAdditionalCollection,\n" +
      "cancel: cancelAdditionalCollections,\n" +
      "retry: retryAdditionalCollections,\n" +
      "cancelled: additionalCollectionCancelled,\n" +
      "create: createOrdersAdditionalCollectionContext,\n" +
      "contexts: ordersAdditionalCollections,\n" +
      "};",
    context,
    { filename: workerPath },
  );
  return { api: context.__ordersFence, removedTabs, sessionStorage };
}

test("additional read cancellation is environment-scoped and closes only owned tabs", async () => {
  const { api, removedTabs } = loadAdditionalCollectionContext();
  const userTabId = 99;
  let releaseLocal;
  let localStarted;
  const localGate = new Promise((resolve) => { releaseLocal = resolve; });
  const localReady = new Promise((resolve) => { localStarted = resolve; });
  let releaseOffice;
  let officeStarted;
  const officeGate = new Promise((resolve) => { releaseOffice = resolve; });
  const officeReady = new Promise((resolve) => { officeStarted = resolve; });

  const localRun = api.run("local", "Sellpia order snapshot", async (context) => {
    await context.ownTab({ id: 101, windowId: 1 });
    localStarted();
    await localGate;
    return context.isActive()
      ? { success: true }
      : api.cancelled(context);
  });
  const officeRun = api.run("office", "Coupang shipment list", async (context) => {
    await context.ownTab({ id: 202, windowId: 2 });
    officeStarted();
    await officeGate;
    return context.isActive()
      ? { success: true }
      : api.cancelled(context);
  });

  await Promise.all([localReady, officeReady]);
  const cancellation = await api.cancel("local");
  assert.deepEqual(JSON.parse(JSON.stringify(cancellation)), { cancelled: 1 });
  assert.deepEqual(removedTabs, [101]);
  assert.equal(api.contexts.has("local"), true);
  assert.equal(api.contexts.has("office"), true);

  releaseLocal();
  const localResult = await localRun;
  assert.equal(localResult.errorCode, "COLLECTION_CANCELLED");
  assert.equal(removedTabs.includes(userTabId), false);

  releaseOffice();
  const officeResult = await officeRun;
  assert.equal(officeResult.success, true);
  assert.deepEqual(removedTabs, [101, 202]);
  assert.equal(api.contexts.size, 0);
});

test("additional owned-tab ledger survives a service-worker restart", async () => {
  const sessionStorage = {};
  const first = loadAdditionalCollectionContext(sessionStorage);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let started;
  const ready = new Promise((resolve) => { started = resolve; });
  const running = first.api.run("local", "Coupang shipment list", async (context) => {
    await context.ownTab({ id: 303, windowId: 3 });
    started();
    await gate;
    return context.isActive() ? { success: true } : first.api.cancelled(context);
  });

  await ready;
  const key = "kiditem_orders_additional_collection_resources_v1";
  assert.deepEqual(sessionStorage[key], { local: [303] });

  // A fresh VM represents the service worker after termination. It has no
  // in-memory context, but the private storage.session resource ledger still
  // identifies the owned background tab.
  const restarted = loadAdditionalCollectionContext(sessionStorage);
  const cancellation = await restarted.api.cancel("local");
  assert.deepEqual(JSON.parse(JSON.stringify(cancellation)), { cancelled: 1 });
  assert.deepEqual(restarted.removedTabs, [303]);
  assert.deepEqual(sessionStorage[key], {});

  release();
  await running;
  // The old fixture VM also reaches its best-effort finally block; the
  // restarted cancellation remains the call that removed the persisted tab.
  assert.deepEqual(first.removedTabs, [303]);
});

test("restart retry closes durable outstanding tabs before any extraction can resume", async () => {
  const key = "kiditem_orders_additional_collection_resources_v1";
  const sessionStorage = { [key]: { local: [304] } };
  const restarted = loadAdditionalCollectionContext(sessionStorage);

  assert.equal(await restarted.api.retry("local"), true);
  assert.deepEqual(restarted.removedTabs, [304]);
  assert.deepEqual(sessionStorage[key], {});
});

test("additional cancellation fences in-memory work before a delayed ledger read", async () => {
  let releaseRead;
  let delayReads = false;
  const readGate = new Promise((resolve) => { releaseRead = resolve; });
  const { api } = loadAdditionalCollectionContext({}, {
    beforeSessionRead: async () => {
      if (delayReads) await readGate;
    },
  });
  let releaseWork;
  let ready;
  const workGate = new Promise((resolve) => { releaseWork = resolve; });
  const workReady = new Promise((resolve) => { ready = resolve; });
  const running = api.run("local", "Sellpia order snapshot", async (context) => {
    await context.ownTab({ id: 404, windowId: 4 });
    ready();
    await workGate;
    return context.isActive() ? { success: true } : api.cancelled(context);
  });

  await workReady;
  delayReads = true;
  const cancelling = api.cancel("local");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(api.contexts.get("local")?.values().next().value.isActive(), false);
  releaseRead();
  await cancelling;
  releaseWork();
  assert.equal((await running).errorCode, "COLLECTION_CANCELLED");
});

test("additional cancellation closes orphaned ledger tabs alongside current contexts", async () => {
  const key = "kiditem_orders_additional_collection_resources_v1";
  const sessionStorage = { [key]: { local: [501] } };
  const { api, removedTabs } = loadAdditionalCollectionContext(sessionStorage);
  let release;
  let ready;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { ready = resolve; });
  const running = api.run("local", "Coupang shipment list", async (context) => {
    await context.ownTab({ id: 502, windowId: 5 });
    ready();
    await gate;
    return context.isActive() ? { success: true } : api.cancelled(context);
  });

  await started;
  const cancellation = await api.cancel("local");
  assert.deepEqual(JSON.parse(JSON.stringify(cancellation)), { cancelled: 1 });
  assert.deepEqual(removedTabs, [502, 501]);
  assert.deepEqual(sessionStorage[key], {});
  release();
  assert.equal((await running).errorCode, "COLLECTION_CANCELLED");
});

test("additional ledger correlation survives a failed close for restart recovery", async () => {
  const key = "kiditem_orders_additional_collection_resources_v1";
  const sessionStorage = {};
  const removeFailsFor = new Set([601]);
  const { api, removedTabs } = loadAdditionalCollectionContext(sessionStorage, {
    removeFailsFor,
    existingTabIds: [601],
  });
  let release;
  let ready;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { ready = resolve; });
  const running = api.run("local", "Coupang shipment list", async (context) => {
    await context.ownTab({ id: 601, windowId: 6 });
    ready();
    await gate;
    return context.isActive() ? { success: true } : api.cancelled(context);
  });

  await started;
  assert.equal(await api.cancel("local"), false);
  release();
  assert.equal((await running).errorCode, "COLLECTION_CANCELLED");
  assert.deepEqual(sessionStorage[key], { local: [601] });
  assert.deepEqual(removedTabs, [601, 601]);

  removeFailsFor.delete(601);
  assert.equal(await api.retry("local"), true);
  assert.deepEqual(removedTabs, [601, 601, 601]);
  assert.deepEqual(sessionStorage[key], {});
});

test("additional cancellation reports unsettled when the ledger read fails", async () => {
  let failLedgerRead = false;
  const { api, removedTabs } = loadAdditionalCollectionContext({}, {
    beforeSessionRead: async () => {
      if (failLedgerRead) throw new Error("ledger unavailable");
    },
  });
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const running = api.run("local", "Sellpia order snapshot", async (context) => {
    assert.equal(await context.ownTab({ id: 801, windowId: 8 }), true);
    markStarted();
    await gate;
    return context.isActive() ? { success: true } : api.cancelled(context);
  });
  await started;
  failLedgerRead = true;
  assert.equal(await api.cancel("local"), false);
  release();
  assert.equal((await running).errorCode, "COLLECTION_CANCELLED");
  assert.ok(removedTabs.includes(801));
});

test("ownTab closes its exact tab when durable ownership cannot be recorded", async () => {
  const { api, removedTabs, sessionStorage } = loadAdditionalCollectionContext({}, {
    sessionSetFails: true,
  });
  const result = await api.run("local", "Sellpia order snapshot", async (context) => ({
    owned: await context.ownTab({ id: 802, windowId: 8 }),
  }));

  assert.deepEqual(result, { owned: false });
  assert.deepEqual(removedTabs, [802, 802]);
  assert.deepEqual(sessionStorage, {});
});

test("retainTab cannot hand off a tab after cancellation wins its ledger race", async () => {
  let releaseSet;
  let setStarted;
  let holdSet = false;
  const setGate = new Promise((resolve) => { releaseSet = resolve; });
  const setReady = new Promise((resolve) => { setStarted = resolve; });
  const { api, removedTabs } = loadAdditionalCollectionContext({}, {
    beforeSessionSet: async () => {
      if (!holdSet) return;
      setStarted();
      await setGate;
    },
  });
  const context = api.create("local", "Sellpia order snapshot");
  await context.ownTab({ id: 803, windowId: 8 });
  // The initial ownTab write has completed; only the retain ledger removal is
  // held at the storage boundary below.
  holdSet = true;
  const retained = context.retainTab({ id: 803, windowId: 8 });
  await setReady;
  const cancellation = api.cancel("local");
  assert.equal(context.isActive(), false);
  releaseSet();

  assert.equal(await retained, false);
  await cancellation;
  assert.ok(removedTabs.includes(803));
  assert.equal(context.ownedTabIds.has(803), false);
});

test("canceled retention re-correlates an ID before failed close and restart retry", async () => {
  const key = "kiditem_orders_additional_collection_resources_v1";
  const sessionStorage = {};
  const removeFailsFor = new Set([804]);
  let holdSet = false;
  let releaseSet;
  let markSetStarted;
  const setGate = new Promise((resolve) => { releaseSet = resolve; });
  const setStarted = new Promise((resolve) => { markSetStarted = resolve; });
  const first = loadAdditionalCollectionContext(sessionStorage, {
    removeFailsFor,
    existingTabIds: [804],
    beforeSessionSet: async () => {
      if (!holdSet) return;
      markSetStarted();
      await setGate;
    },
  });
  const context = first.api.create("local", "Sellpia order snapshot");
  assert.equal(await context.ownTab({ id: 804, windowId: 8 }), true);
  holdSet = true;
  const retained = context.retainTab({ id: 804, windowId: 8 });
  await setStarted;

  const cancelling = first.api.cancel("local");
  assert.equal(context.isActive(), false);
  releaseSet();
  assert.equal(await retained, false);
  assert.equal(await cancelling, false);
  assert.equal(context.ownedTabIds.has(804), true);
  assert.deepEqual(sessionStorage[key], { local: [804] });

  removeFailsFor.delete(804);
  const restarted = loadAdditionalCollectionContext(sessionStorage);
  assert.equal(await restarted.api.retry("local"), true);
  assert.deepEqual(restarted.removedTabs, [804]);
  assert.deepEqual(sessionStorage[key], {});
});

test("failed remember plus failed close stays in-memory for a later exact-ID retry", async () => {
  const key = "kiditem_orders_additional_collection_resources_v1";
  const removeFailsFor = new Set([805]);
  const { api, removedTabs, sessionStorage } = loadAdditionalCollectionContext({}, {
    removeFailsFor,
    existingTabIds: [805],
    sessionSetFailsRemaining: 1,
  });
  const result = await api.run("local", "Sellpia order snapshot", async (context) => ({
    owned: await context.ownTab({ id: 805, windowId: 8 }),
  }));

  assert.deepEqual(result, { owned: false });
  assert.equal(api.contexts.has("local"), true);
  assert.equal(api.contexts.get("local")?.values().next().value.ownedTabIds.has(805), true);
  assert.deepEqual(sessionStorage, {});

  removeFailsFor.delete(805);
  assert.equal(await api.retry("local"), true);
  assert.deepEqual(removedTabs, [805, 805, 805]);
  assert.equal(api.contexts.has("local"), false);
  assert.deepEqual(sessionStorage, { [key]: {} });
});

test("pending-only additional retry never stops a newly started read", async () => {
  const key = "kiditem_orders_additional_collection_resources_v1";
  const sessionStorage = { [key]: { local: [701] } };
  const { api, removedTabs } = loadAdditionalCollectionContext(sessionStorage);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let ready;
  const started = new Promise((resolve) => { ready = resolve; });
  const running = api.run("local", "Sellpia order snapshot", async (context) => {
    await context.ownTab({ id: 702, windowId: 7 });
    ready();
    await gate;
    return context.isActive() ? { success: true } : api.cancelled(context);
  });

  await started;
  const retry = await api.retry("local");
  assert.equal(retry, true);
  assert.deepEqual(removedTabs, [701]);
  assert.equal(api.contexts.get("local")?.values().next().value.isActive(), true);
  release();
  assert.deepEqual(await running, { success: true });
  assert.deepEqual(removedTabs, [701, 702]);
});

test("Orders registers recovery and additional-read cancellation hooks", () => {
  const worker = readFileSync(workerPath, "utf8");
  assert.match(worker, /recoverCollections:\s*\(environmentId\)\s*=>\s*recoverOrdersCollections\(environmentId\)/);
  assert.match(worker, /cancelAdditionalCollections:\s*\(environmentId\)\s*=>\s*cancelAdditionalCollections\(environmentId\)/);
  assert.match(worker, /retryAdditionalCollections:\s*\(environmentId\)\s*=>\s*retryAdditionalCollections\(environmentId\)/);
  assert.match(worker, /const ordersAdditionalCollections = new Map\(\)/);
  assert.match(worker, /ORDERS_ADDITIONAL_RESOURCES_KEY/);
  assert.match(worker, /async function collectSellpiaOrderSnapshot\(environmentId\)/);
  assert.match(worker, /async function collectCoupangShipmentList\(options, environmentId\)/);
  assert.match(worker, /async function fetchCoupangShipmentPdfBatch\(options, environmentId\)/);
});
