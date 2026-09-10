import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const backgroundRoot = path.join(repoRoot, "extensions/kiditem-os/background");
const entryPath = path.join(backgroundRoot, "service-worker.js");
const attemptId = "11111111-1111-4111-8111-111111111111";
const attemptToken = "22222222-2222-4222-8222-222222222222";
const channelAccountId = "33333333-3333-4333-8333-333333333333";

function createFakeChrome() {
  const storage = {};
  const internalMessageListeners = [];
  const noopEvent = () => ({ addListener() {}, removeListener() {} });
  const chrome = {
    runtime: {
      id: "kiditem-os-monthly-test",
      lastError: null,
      getManifest: () => ({ version: "test" }),
      onInstalled: { addListener() {} },
      onStartup: noopEvent(),
      onConnect: noopEvent(),
      onMessage: { addListener: (listener) => internalMessageListeners.push(listener) },
      onMessageExternal: { addListener() {} },
      onConnectExternal: { addListener() {} },
    },
    alarms: {
      create() {},
      clear(_name, callback) { callback?.(true); return Promise.resolve(true); },
      onAlarm: noopEvent(),
    },
    storage: {
      local: {
        async get(key, callback) {
          const result = key == null
            ? { ...storage }
            : typeof key === "string"
              ? { [key]: storage[key] }
              : Array.isArray(key)
                ? Object.fromEntries(key.map((value) => [value, storage[value]]))
                : Object.fromEntries(Object.entries(key).map(([name, fallback]) => [
                  name,
                  storage[name] === undefined ? fallback : storage[name],
                ]));
          callback?.(result);
          return result;
        },
        async set(values, callback) {
          Object.assign(storage, values);
          callback?.();
        },
        async remove(keys, callback) {
          for (const key of Array.isArray(keys) ? keys : [keys]) delete storage[key];
          callback?.();
        },
        onChanged: noopEvent(),
      },
    },
    tabs: {
      async create(properties) { return { id: 1, windowId: 1, ...properties }; },
      async get(id) { return { id, windowId: 1, url: "https://example.test/" }; },
      async query() { return []; },
      async remove() {},
      async update(id, properties) { return { id, windowId: 1, ...properties }; },
      sendMessage() {},
      onRemoved: noopEvent(),
      onUpdated: noopEvent(),
    },
    windows: {
      async create() { return { id: 1, tabs: [{ id: 1 }] }; },
      async get() { return { id: 1 }; },
      async remove() {},
      async update() {},
      onRemoved: noopEvent(),
    },
    scripting: { async executeScript() { return []; } },
    cookies: { async getAll() { return []; }, async remove() {} },
    sidePanel: { setPanelBehavior() {}, async open() {} },
    action: { onClicked: noopEvent() },
    debugger: { async attach() {}, async detach() {}, async sendCommand() {}, onEvent: noopEvent() },
  };
  return { chrome, storage, internalMessageListeners };
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function frozenDateConstructor(iso) {
  const RealDate = Date;
  return class FrozenDate extends RealDate {
    constructor(...args) { super(args.length === 0 ? iso : args[0]); }
    static now() { return new RealDate(iso).getTime(); }
  };
}

function bootServiceWorker(fetchFn, nowIso = null) {
  const fake = createFakeChrome();
  let context;
  const sandbox = {
    AbortController,
    Blob,
    Date: nowIso ? frozenDateConstructor(nowIso) : Date,
    FormData,
    Headers,
    FileReader: class {
      readAsDataURL() { this.result = "data:,"; this.onload?.(); }
    },
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
    atob,
    btoa,
    chrome: fake.chrome,
    clearInterval,
    clearTimeout,
    console,
    crypto,
    fetch: fetchFn,
    setInterval,
    setTimeout,
    structuredClone,
    importScripts(...files) {
      for (const file of files) {
        // The parent checkout is temporarily missing this order-module import
        // from service-worker.js; load the committed module only for this
        // production-worker harness so the monthly contract can execute.
        if (file === "orders/worker.js") {
          for (const dependencyName of [
            "sellpia-shipment-tracking-collector.js",
            "sellpia-sales-collector.js",
            "sellpia-product-profit-collector.js",
          ]) {
            const globalName = dependencyName.startsWith("sellpia-sales")
              ? "KidItemSellpiaSalesCollector"
              : dependencyName.startsWith("sellpia-product")
                ? "KidItemSellpiaProductProfitCollector"
                : "KidItemSellpiaShipmentTrackingCollector";
            if (context[globalName]) continue;
            const dependency = path.join(backgroundRoot, "orders", dependencyName);
            vm.runInContext(readFileSync(dependency, "utf8"), context, {
              filename: dependency,
            });
          }
        }
        const filename = path.join(backgroundRoot, file.split("?")[0]);
        vm.runInContext(readFileSync(filename, "utf8"), context, { filename });
      }
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  context = vm.createContext(sandbox);
  vm.runInContext(readFileSync(entryPath, "utf8"), context, { filename: entryPath });
  return { ...fake, context };
}

function internalRequest(harness, message) {
  return new Promise((resolve) => {
    const responders = harness.internalMessageListeners.filter((listener) =>
      listener(message, {}, resolve) === true,
    );
    assert.ok(responders.length >= 1);
  });
}

function freezeNow(context, iso) {
  context.Date = frozenDateConstructor(iso);
}

function trafficAttempt(state, startDate, endDate, targetUrl) {
  const periodDays = Math.round(
    (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000,
  ) + 1;
  return {
    attemptId,
    attemptToken,
    state,
    channelAccountId,
    expiresAt: "2030-01-02T00:00:00.000Z",
    receipts: [],
    plan: {
      sourceType: "coupang_wing_traffic",
      parserVersion: "wing-traffic-daily-v2",
      channelAccountId,
      expectedAdvertiserId: "A0001",
      providerVendorId: "A0001",
      startDate,
      endDate,
      businessDate: endDate,
      periodDays,
      expectedDates: Array.from({ length: periodDays }, (_, index) =>
        new Date(Date.parse(`${startDate}T00:00:00Z`) + index * 86_400_000)
          .toISOString().slice(0, 10)),
      filterScope: "ALL_NORMAL_RFM",
      targetUrl,
    },
  };
}

test("monthly Wing request validates before I/O and rejects future or first-day ranges", async () => {
  const requests = [];
  const harness = bootServiceWorker(async (url) => {
    requests.push(String(url));
    return response({});
  }, "2026-09-01T14:00:00.000Z");
  harness.storage.kiditem_environment_profiles_v1 = { local: { accessToken: "fixture" } };
  freezeNow(harness.context, "2026-09-01T14:00:00.000Z"); // 2026-09-01 23:00 KST

  for (const message of [
    { action: "monthlyScrape", year: "2026", month: 8, environmentId: "local" },
    { action: "monthlyScrape", year: 2026, month: 8, environmentId: "local", extra: true },
    { action: "monthlyScrape", year: 2026, month: 0, environmentId: "local" },
    { action: "monthlyScrape", year: 2026, month: 10, environmentId: "local" },
    { action: "monthlyScrape", year: 2026, month: 9, environmentId: "local" },
  ]) {
    const result = await internalRequest(harness, message);
    assert.equal(result.success, false);
  }
  assert.deepEqual(requests, []);
  assert.equal(Object.keys(harness.storage).some((key) => key.includes("monthly_sync")), false);
});

test("monthly Wing admission freezes one KST range, dispatches daily-v2 once, and writes no monthly state", async () => {
  const requests = [];
  const state = { attempt: null, beginCount: 0 };
  const harness = bootServiceWorker(async (url, init = {}) => {
    const href = String(url);
    requests.push({ href, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null });
    if (href.endsWith("/api/ads/traffic/source")) return response({ latestAttempt: null });
    if (href.endsWith("/api/ads/traffic/attempts")) {
      state.beginCount += 1;
      const body = JSON.parse(init.body);
      state.attempt = trafficAttempt("COMPLETE", body.startDate, body.endDate, body.url);
      return response(state.attempt);
    }
    if (href.includes(`/api/ads/traffic/attempts/${attemptId}/control`)) return response(state.attempt);
    return response({});
  }, "2026-09-08T00:00:00.000Z");
  harness.storage.kiditem_environment_profiles_v1 = { local: { accessToken: "fixture" } };
  freezeNow(harness.context, "2026-09-08T00:00:00.000Z"); // 2026-09-08 09:00 KST

  const result = await internalRequest(harness, {
    action: "monthlyScrape",
    year: 2026,
    month: 8,
    environmentId: "local",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: true,
    attemptId,
    terminalState: "COMPLETE",
    startDate: "2026-08-01",
    endDate: "2026-08-31",
  });
  assert.equal(state.beginCount, 1);
  assert.equal(requests.filter(({ href }) => href.endsWith("/api/ads/traffic/attempts")).length, 1);
  assert.equal(requests.filter(({ href }) => href.endsWith("/api/ads/traffic/source")).length, 1);
  assert.equal(requests.filter(({ href }) => href.includes("/control")).length, 0);
  assert.equal(Object.keys(harness.storage).some((key) => key.includes("monthly_sync")), false);
});

test("monthly Wing admission surfaces a terminal FAILED replay and rejects a non-v2 plan", async () => {
  for (const terminalState of ["FAILED"]) {
    const harness = bootServiceWorker(async (url, init = {}) => {
      const href = String(url);
      if (href.endsWith("/api/ads/traffic/source")) return response({ latestAttempt: null });
      if (href.endsWith("/api/ads/traffic/attempts")) {
        const body = JSON.parse(init.body);
        return response(trafficAttempt(terminalState, body.startDate, body.endDate, body.url));
      }
      return response({});
    }, "2026-09-08T00:00:00.000Z");
    harness.storage.kiditem_environment_profiles_v1 = { local: { accessToken: "fixture" } };
    freezeNow(harness.context, "2026-09-08T00:00:00.000Z");
    const result = await internalRequest(harness, {
      action: "monthlyScrape", year: 2026, month: 8, environmentId: "local",
    });
    assert.equal(result.success, true);
    assert.equal(result.terminalState, terminalState);
  }

  const harness = bootServiceWorker(async (url, init = {}) => {
    const href = String(url);
    if (href.endsWith("/api/ads/traffic/source")) return response({ latestAttempt: null });
    if (href.endsWith("/api/ads/traffic/attempts")) {
      const body = JSON.parse(init.body);
      const attempt = trafficAttempt("RUNNING", body.startDate, body.endDate, body.url);
      attempt.plan.parserVersion = "wing-traffic-v1";
      return response(attempt);
    }
    return response({});
  }, "2026-09-08T00:00:00.000Z");
  harness.storage.kiditem_environment_profiles_v1 = { local: { accessToken: "fixture" } };
  freezeNow(harness.context, "2026-09-08T00:00:00.000Z");
  const rejected = await internalRequest(harness, {
    action: "monthlyScrape", year: 2026, month: 8, environmentId: "local",
  });
  assert.equal(rejected.success, false);
  assert.match(rejected.error, /daily-v2/);
});
