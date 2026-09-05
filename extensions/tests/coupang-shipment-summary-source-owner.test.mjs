import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const wire = readFileSync(
  new URL(
    "../kiditem-os/background/sourcing/source-attempt-wire.js",
    import.meta.url,
  ),
  "utf8",
);
const source = readFileSync(
  new URL(
    "../kiditem-os/background/orders/coupang-shipment-summary-source-owner.js",
    import.meta.url,
  ),
  "utf8",
);
const sessionSource = readFileSync(
  new URL("../shared/collection-session.js", import.meta.url),
  "utf8",
);
const attemptId = "a1111111-1111-4111-8111-111111111111";
const token = "b1111111-1111-4111-8111-111111111111";
const plan = {
  attemptId,
  attemptToken: token,
  state: "RUNNING",
  generation: "1",
  expiresAt: "2099-01-01T00:00:00Z",
  plan: {
    sourceType: "coupang_shipment_summary",
    parserVersion: "shipment-summary-v1",
    maxPages: 40,
  },
};
const observation = {
  success: true,
  scannedPages: 1,
  totalRows: 0,
  dates: [],
  proof: {
    maxPages: 40,
    validatedTable: true,
    stopReason: "empty_page",
    lastPageRowCount: 0,
    pageRowCounts: [0],
  },
};

function fixture({ capture = observation, requestHook } = {}) {
  const context = vm.createContext({ Date, Map });
  vm.runInContext(wire, context);
  vm.runInContext(source, context);
  vm.runInContext(sessionSource, context);
  const calls = [];
  const collected = [];
  const storage = {};
  const removedTabs = [];
  const focusedTabs = [];
  const chrome = {
    storage: {
      local: {
        get: async (key) => ({ [key]: structuredClone(storage[key]) }),
        set: async (values) => Object.assign(storage, structuredClone(values)),
      },
    },
    tabs: {
      query: async () => [],
      remove: async (id) => removedTabs.push(id),
      update: async (id) => focusedTabs.push(id),
    },
    windows: { update: async () => undefined },
  };
  const sessions = context.KidItemCollectionSession.create({
    chrome,
    storageKey: "sessions",
    webUrlPatterns: [],
  });
  let state = "RUNNING";
  let failureReceipt = {};
  const owner = context.KidItemCoupangShipmentSummarySourceOwner.create({
    chrome,
    sessions,
    request: async (environmentId, path, init) => {
      calls.push({ environmentId, path, ...init });
      const response = (body, status = 200) => ({
        ok: status < 400,
        status,
        json: async () => body,
      });
      if (requestHook) {
        const handled = await requestHook({
          init,
          path,
          calls,
          response,
          setState: (value) => {
            state = value;
          },
        });
        if (handled) return handled;
      }
      if (init.method === "GET")
        return response({ ...plan, state, ...failureReceipt });
      state = init.method === "PUT" ? "COMPLETE" : "FAILED";
      if (state === "FAILED") {
        const body = JSON.parse(init.body);
        failureReceipt = { errorCode: body.code, errorMessage: body.message };
      }
      return response({ ...plan, state, ...failureReceipt });
    },
    collect: async (options) => {
      collected.push(options);
      await sessions.attachTab(attemptId, {
        tabId: 42,
        windowId: 7,
        closeOnCancel: true,
      });
      return capture;
    },
  });
  return {
    owner,
    calls,
    collected,
    sessions,
    storage,
    removedTabs,
    focusedTabs,
  };
}

test("owner transports validated empty directly with the server plan and returns no raw rows/token", async () => {
  const f = fixture();
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(await f.owner.run({ environmentId: "office", attemptId })),
    ),
    { success: true, attemptId, terminalState: "COMPLETE" },
  );
  assert.equal(f.collected[0].maxPages, 40);
  assert.equal(f.calls[1].environmentId, "office");
  assert.equal(f.calls[1].method, "PUT");
  assert.equal(f.calls[1].headers["x-source-attempt-token"], token);
  assert.deepEqual(JSON.parse(f.calls[1].body), {
    items: [],
    scannedPages: 1,
    totalRows: 0,
    proof: observation.proof,
  });
  assert.equal((await f.sessions.list()).length, 0);
  assert.deepEqual(f.removedTabs, [42]);
});

test("lost complete responses replay the identical body and recover only from the exact owner", async () => {
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
  assert.equal(f.collected.length, 1);
  assert.equal(
    f.calls.some((call) => call.path.endsWith("/fail")),
    false,
  );
});

test("login failure is submitted to the owner, while owner refusal never becomes success", async () => {
  const f = fixture({
    capture: {
      success: false,
      errorCode: "coupang_shipment_session_required",
      error: "로그인해주세요.",
    },
  });
  assert.equal(
    (await f.owner.run({ environmentId: "local", attemptId })).terminalState,
    "FAILED",
  );
  assert.equal(f.calls[1].path.endsWith("/fail"), true);
  assert.deepEqual(JSON.parse(f.calls[1].body), {
    code: "coupang_shipment_session_required",
    message: "로그인해주세요.",
  });
  const refused = fixture({
    requestHook: ({ init, response }) =>
      init.method === "PUT"
        ? response({ message: "ATTEMPT_FENCE_LOST" }, 409)
        : null,
  });
  const result = await refused.owner.run({
    environmentId: "office",
    attemptId,
  });
  assert.equal(result.success, false);
  assert.equal(result.terminalState, "RUNNING");
  assert.equal(refused.calls.filter((call) => call.method === "PUT").length, 1);
});

test("foreign source plan is rejected before supplier IO", async () => {
  const f = fixture({
    requestHook: ({ response }) =>
      response({ ...plan, plan: { ...plan.plan, sourceType: "other" } }),
  });
  await assert.rejects(
    f.owner.run({ environmentId: "office", attemptId }),
    /PLAN_INVALID/,
  );
  assert.equal(f.collected.length, 0);
});

test("cancel is environment fenced and closes local progress only after owner failure", async () => {
  const f = fixture();
  await f.sessions.start({
    attemptId,
    environmentId: "office",
    producer: "orders.coupang_shipment_summary",
  });
  assert.equal(
    await f.owner.cancel({ attemptId, environmentId: "local" }),
    null,
  );
  assert.equal(f.calls.length, 0);
  assert.equal(
    (await f.owner.cancel({ attemptId, environmentId: "office" }))
      .terminalState,
    "FAILED",
  );
  assert.equal(f.collected.length, 0);
  assert.equal((await f.sessions.list()).length, 0);
});

test("only owner-acknowledged login failure retains an attention tab without credentials or execution state", async () => {
  const f = fixture({
    capture: {
      success: false,
      errorCode: "coupang_shipment_session_required",
      error: "로그인해주세요.",
    },
  });
  assert.equal(
    (await f.owner.run({ environmentId: "office", attemptId })).terminalState,
    "FAILED",
  );
  assert.equal((await f.sessions.get(attemptId))?.attention?.canOpenTab, true);
  assert.deepEqual(f.removedTabs, []);
  await f.sessions.openAttentionTab(attemptId);
  assert.deepEqual(f.focusedTabs, [42]);
  const stored = JSON.stringify(f.storage);
  for (const forbidden of [
    token,
    "attemptToken",
    "terminalState",
    "FAILED",
    "dates",
    "maxPages",
  ])
    assert.equal(stored.includes(forbidden), false, forbidden);
  const normal = fixture({
    capture: {
      success: false,
      errorCode: "coupang_shipment_response_invalid",
      error: "형식 오류",
    },
  });
  await normal.owner.run({ environmentId: "office", attemptId });
  assert.deepEqual(normal.removedTabs, [42]);
  assert.equal((await normal.sessions.list()).length, 0);
});
