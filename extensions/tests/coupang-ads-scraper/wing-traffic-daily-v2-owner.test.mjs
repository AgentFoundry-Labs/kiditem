import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const attemptId = "11111111-1111-4111-8111-111111111111";
const attemptToken = "22222222-2222-4222-8222-222222222222";
const channelAccountId = "33333333-3333-4333-8333-333333333333";
const vendorId = "A0001";
const dates = ["2026-09-05", "2026-09-06"];
const targetUrl = "https://wing.coupang.com/tenants/business-insight/sales-analysis?start_date=2026-09-05&end_date=2026-09-06";
const sender = {
  tab: { id: 41, url: targetUrl },
  url: targetUrl,
  frameId: 0,
};

const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const canonicalize = value => {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, nested]) => [key, canonicalize(nested)]));
};
const checksum = value => createHash("sha256")
  .update(JSON.stringify(canonicalize(JSON.parse(JSON.stringify(value)))))
  .digest("hex");

const plan = {
  sourceType: "coupang_wing_traffic",
  parserVersion: "wing-traffic-daily-v2",
  channelAccountId,
  expectedAdvertiserId: vendorId,
  providerVendorId: vendorId,
  startDate: dates[0],
  endDate: dates[1],
  businessDate: dates[1],
  periodDays: 2,
  expectedDates: dates,
  filterScope: "ALL_NORMAL_RFM",
  targetUrl,
};

const accountSummary = {
  visitors: 10,
  views: 20,
  cartAdds: 3,
  orders: 2,
  salesQty: 2,
  revenue: 300,
  providerConversionRate: 10,
};

function control(state = "RUNNING", receipts = []) {
  return {
    attemptId,
    channelAccountId,
    state,
    plan,
    expiresAt: "2030-01-02T00:00:00.000Z",
    actualCutoffAt: state === "COMPLETE" ? "2026-09-06T01:00:00.000Z" : null,
    manifestChecksum: checksum({ plan, receipts }),
    rowCount: receipts.reduce((sum, receipt) => sum + receipt.rowCount, 0),
    matchedRowCount: receipts.reduce((sum, receipt) => sum + receipt.matchedCount, 0),
    unmatchedRowCount: receipts.reduce((sum, receipt) => sum + receipt.unmatchedCount, 0),
    receiptCount: receipts.length,
    expectedPages: null,
    terminalPageObserved: receipts.at(-1)?.terminalPageObserved ?? false,
    errorCode: null,
    errorMessage: null,
    attemptToken,
    receipts,
  };
}

function dailyBody(businessDate, { empty = false } = {}) {
  return {
    key: `${attemptId}:daily:${businessDate}:page:1`,
    capturedAt: "2026-09-06T01:00:00.000Z",
    kind: "daily_page",
    providerVendorId: vendorId,
    filterScope: "ALL_NORMAL_RFM",
    url: targetUrl,
    businessDate,
    startDate: businessDate,
    endDate: businessDate,
    period: 1,
    pageIndex: 1,
    proof: {
      expectedPages: 1,
      visitedPages: [1],
      terminalPageObserved: true,
      verified: true,
      complete: true,
      ...(empty ? { explicitEmpty: true } : {}),
    },
    data: empty ? [] : [{ vendorItemId: "VI-1", externalOptionId: "VI-1", visitors: 10 }],
    accountSummary,
    accountSummaryRaw: { visitors: 10, views: 20, orders: 2 },
  };
}

function periodBody() {
  return {
    key: `${attemptId}:period-summary:${dates[0]}:${dates[1]}`,
    capturedAt: "2026-09-06T01:00:00.000Z",
    kind: "period_summary",
    providerVendorId: vendorId,
    filterScope: "ALL_NORMAL_RFM",
    url: targetUrl,
    startDate: dates[0],
    endDate: dates[1],
    period: 2,
    accountSummary,
    accountSummaryRaw: { visitors: 20, views: 40, orders: 4 },
  };
}

function ackFor(body, sequence, { filterScope = "ALL_NORMAL_RFM" } = {}) {
  if (body.kind === "period_summary") {
    return {
      sequence,
      kind: "period_summary",
      key: body.key,
      checksum: checksum(body),
      providerVendorId: vendorId,
      filterScope,
      capturedAt: body.capturedAt,
      startDate: body.startDate,
      endDate: body.endDate,
      period: body.period,
      rowCount: 0,
      matchedCount: 0,
      unmatchedCount: 0,
      snapshotIds: [],
      url: body.url,
    };
  }
  return {
    sequence,
    kind: "daily_page",
    key: body.key,
    checksum: checksum(body),
    providerVendorId: vendorId,
    filterScope,
    capturedAt: body.capturedAt,
    businessDate: body.businessDate,
    pageIndex: body.pageIndex,
    expectedPages: body.proof.expectedPages,
    rowCount: body.data.length,
    matchedCount: body.data.length,
    unmatchedCount: 0,
    snapshotIds: body.data.map((_row, index) => `00000000-0000-4000-8000-00000000000${index + 1}`),
    url: body.url,
    startDate: body.startDate,
    endDate: body.endDate,
    terminalPageObserved: body.proof.terminalPageObserved,
  };
}

function harness(request, collect) {
  const requests = [];
  const closed = [];
  const storage = {};
  const chrome = {
    storage: {
      local: {
        get(key, callback) { const result = { [key]: clone(storage[key]) }; callback?.(result); return Promise.resolve(result); },
        set(value, callback) { Object.assign(storage, clone(value)); callback?.(); return Promise.resolve(); },
      },
    },
  };
  const context = vm.createContext({ chrome, console, crypto, TextEncoder, URL, setTimeout, clearTimeout, Date });
  for (const file of [
    "../../shared/collection-session.js",
    "../../kiditem-os/background/sourcing/source-attempt-wire.js",
    "../../kiditem-os/background/coupang/wing-traffic-source-owner.js",
  ]) vm.runInContext(fs.readFileSync(new URL(file, import.meta.url), "utf8"), context, { filename: file });
  const sessions = context.KidItemCollectionSession.create({ chrome, storageKey: "sessions", webUrlPatterns: [] });
  let current = control();
  let owner;
  owner = context.KidItemWingTrafficSourceOwnerV2.create({
    chrome,
    sessions,
    request: async (environmentId, path, init) => {
      requests.push({ environmentId, path, ...init });
      const response = await request(path, init, { current, setCurrent: value => { current = value; } });
      return { ok: !response?.httpStatus, status: response?.httpStatus || 200, json: async () => clone(response) };
    },
    collect: async (input) => {
      await sessions.attachTab(attemptId, { tabId: 41, windowId: 7 });
      return collect(input, owner);
    },
    environmentForTab: async tabId => tabId === 41 ? "local" : "office",
    ownedTab: async () => 41,
    closeAttempt: async (environmentId, id) => closed.push({ environmentId, id }),
  });
  return { owner, sessions, requests, closed, getCurrent: () => current, setCurrent: value => { current = value; } };
}

function ownerStep(owner, body) {
  return new Promise(resolve => owner.handleMessage({ action: "wingTrafficSourceStepV2", attemptId, step: "receipt", body }, sender, resolve));
}

test("Wing traffic daily v2 owner stages daily pages and one period summary with deterministic fenced sequences", async () => {
  let h;
  h = harness(async (path, init, state) => {
    if (!init) return state.current;
    if (!init.method) return state.current;
    if (init.method === "PUT") {
      const body = JSON.parse(init.body);
      const sequence = body.kind === "period_summary" ? plan.periodDays * 100 : dates.indexOf(body.businessDate) * 100 + body.pageIndex - 1;
      assert.equal(path, `/api/ads/traffic/attempts/${attemptId}/receipts/${sequence}`);
      assert.equal(init.headers["x-source-attempt-token"], attemptToken);
      const receipt = ackFor(body, sequence);
      state.setCurrent(control("RUNNING", [...state.current.receipts, receipt]));
      return receipt;
    }
    if (init.method === "POST" && path === `/api/ads/traffic/attempts/${attemptId}/complete`) {
      assert.deepEqual(JSON.parse(init.body), { manifestChecksum: state.current.manifestChecksum });
      state.setCurrent(control("COMPLETE", state.current.receipts));
      return { status: "READY" };
    }
    return state.current;
  }, async (_input, owner) => {
    assert.equal((await ownerStep(owner, dailyBody(dates[0]))).success, true);
    assert.equal((await ownerStep(owner, dailyBody(dates[1], { empty: true }))).success, true);
    assert.equal((await ownerStep(owner, periodBody())).success, true);
    return { success: true };
  });
  const result = await h.owner.run({ environmentId: "local", attemptId });
  assert.equal(result.terminalState, "COMPLETE");
  assert.deepEqual(h.requests.filter(item => item.method === "PUT").map(item => item.path), [
    `/api/ads/traffic/attempts/${attemptId}/receipts/0`,
    `/api/ads/traffic/attempts/${attemptId}/receipts/100`,
    `/api/ads/traffic/attempts/${attemptId}/receipts/200`,
  ]);
  assert.deepEqual(h.requests.filter(item => item.method === "POST").map(item => item.path), [
    `/api/ads/traffic/attempts/${attemptId}/complete`,
  ]);
  const periodAck = h.getCurrent().receipts.find(receipt => receipt.kind === "period_summary");
  assert.equal(periodAck.accountSummary, undefined);
  assert.deepEqual(periodAck.snapshotIds, []);
  assert.equal(h.closed.length, 1);
});

test("Wing traffic daily v2 owner rejects an ACK without the discriminator fence", async () => {
  let h;
  h = harness(async (path, init, state) => {
    if (!init) return state.current;
    if (init.method === "PUT") {
      const body = JSON.parse(init.body);
      return ackFor(body, 0, { filterScope: undefined });
    }
    return state.current;
  }, async (_input, owner) => {
    const result = await ownerStep(owner, dailyBody(dates[0]));
    assert.equal(result.success, false);
    assert.equal(result.errorCode, "SOURCE_OWNER_UNAVAILABLE");
    return { success: false, errorCode: result.errorCode };
  });
  const result = await h.owner.run({ environmentId: "local", attemptId });
  assert.equal(result.terminalState, "RUNNING");
  assert.equal(h.requests.some(item => item.method === "POST"), false);
});

test("Wing traffic daily v2 owner accepts signed account-summary correction values", async () => {
  let h;
  h = harness(async (path, init, state) => {
    if (!init) return state.current;
    if (init.method === "PUT") {
      const body = JSON.parse(init.body);
      const receipt = ackFor(body, 0);
      state.setCurrent(control("RUNNING", [...state.current.receipts, receipt]));
      return receipt;
    }
    return state.current;
  }, async (_input, owner) => {
    const signedSummary = {
      ...accountSummary,
      visitors: -10,
      views: -20,
      cartAdds: -3,
      orders: -2,
      salesQty: -2,
      revenue: -300,
    };
    const result = await ownerStep(owner, {
      ...dailyBody(dates[0]),
      accountSummary: signedSummary,
    });
    assert.equal(result.success, true);
    return { success: false, errorCode: "SOURCE_OWNER_UNAVAILABLE" };
  });
  const result = await h.owner.run({ environmentId: "local", attemptId });
  assert.equal(result.terminalState, "RUNNING");
  assert.deepEqual(h.requests.filter(item => item.method === "PUT").map(item => item.path), [
    `/api/ads/traffic/attempts/${attemptId}/receipts/0`,
  ]);
});
