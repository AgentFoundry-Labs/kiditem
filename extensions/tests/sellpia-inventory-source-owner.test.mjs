import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const attemptId = "11111111-1111-4111-8111-111111111111";
const attemptToken = "22222222-2222-4222-8222-222222222222";
const restartAttemptId = "33333333-3333-4333-8333-333333333333";
const restartAttemptToken = "44444444-4444-4444-8444-444444444444";
const sourcePath = "/api/inventory/sellpia-source/attempts";
const ownerSource = readFileSync(
  new URL("../kiditem-os/background/orders/sellpia-inventory-source-owner.js", import.meta.url),
  "utf8",
);
const wireSource = readFileSync(
  new URL("../kiditem-os/background/sourcing/source-attempt-wire.js", import.meta.url),
  "utf8",
);
const sessionSource = readFileSync(
  new URL("../kiditem-os/background/collection-session.js", import.meta.url),
  "utf8",
);

const plan = {
  sourceType: "sellpia_inventory",
  parserVersion: "sellpia-inventory-v1",
  scope: "inventory",
  trigger: "manual_request",
  sourceOrigin: "https://kiditem.sellpia.com",
  sourceAccountKey: "kiditem",
  generation: "7",
};

const snapshot = {
  source: "sellpia_product_search",
  version: 1,
  rowCount: 1,
  rows: [{
    productCode: "SKU-1",
    optionCode: "OPT-1",
    name: "테스트 상품",
    optionName: null,
    barcode: "8800000000000",
    currentStock: 4,
    purchasePrice: 1000,
    salePrice: 2000,
  }],
};

function control(state = "RUNNING", patch = {}) {
  return {
    attemptId,
    attemptToken,
    generation: plan.generation,
    state,
    plan,
    expiresAt: "2099-01-01T00:00:00.000Z",
    actualCutoffAt: null,
    fileName: null,
    contentChecksum: null,
    rowCount: 0,
    errorCode: null,
    errorMessage: null,
    ...patch,
  };
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 400,
    status,
    async json() {
      return structuredClone(body);
    },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((settle) => { resolve = settle; });
  return { promise, resolve };
}

function createFixture({
  completion = "accept",
  collected = { success: true, snapshot },
  collectUntilStopped = false,
  holdFailure = false,
  parkBeforeCompletion = false,
} = {}) {
  const context = vm.createContext({
    Blob,
    Date,
    FormData,
    Map,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    URL,
    crypto: webcrypto,
    setTimeout,
    clearTimeout,
    structuredClone,
  });
  vm.runInContext(wireSource, context);
  vm.runInContext(sessionSource, context);
  vm.runInContext(ownerSource, context);

  const storage = {};
  const calls = [];
  const uploads = [];
  const removedTabs = [];
  const chrome = {
    storage: {
      local: {
        get: async (key) => ({ [key]: structuredClone(storage[key]) }),
        set: async (values) => Object.assign(storage, structuredClone(values)),
      },
    },
    tabs: {
      query: async () => [],
      remove: async (tabId) => removedTabs.push(tabId),
    },
  };
  const sessions = context.KidItemCollectionSession.create({
    chrome,
    storageKey: "sessions",
    webUrlPatterns: [],
  });
  const ownerWrites = [];
  const collectStarted = deferred();
  const failureRelease = deferred();
  const completionParked = deferred();
  const completionRelease = deferred();
  // The owner reports progress immediately before it submits completion.
  const sessionApi = parkBeforeCompletion
    ? {
        ...sessions,
        progress: async (...args) => {
          completionParked.resolve();
          await completionRelease.promise;
          return sessions.progress(...args);
        },
      }
    : sessions;
  const attempts = new Map([
    [attemptId, control()],
    [restartAttemptId, control("RUNNING", { attemptId: restartAttemptId, attemptToken: restartAttemptToken })],
  ]);
  let completeCalls = 0;

  const owner = context.KidItemSellpiaInventorySourceOwner.create({
    chrome,
    sessions: sessionApi,
    request: async (environmentId, path, init = {}) => {
      calls.push({ environmentId, path, method: init.method || "GET", headers: init.headers, body: init.body });
      const method = init.method || "GET";
      const id = decodeURIComponent(path.slice(`${sourcePath}/`.length).split("/")[0]);
      const current = attempts.get(id);
      if (method === "GET") return response(current);
      ownerWrites.push({ attemptId: id, route: path.split("/").at(-1), afterEnd: current.state !== "RUNNING" });
      if (path.endsWith("/complete")) {
        completeCalls += 1;
        const file = init.body?.get("file");
        const bytes = new Uint8Array(await file.arrayBuffer());
        uploads.push(bytes);
        if (completion === "running") throw new Error("reply lost");
        const hash = createHash("sha256").update(bytes).digest("hex");
        attempts.set(id, {
          ...current,
          state: "COMPLETE",
          contentChecksum: completion === "mismatch" ? "f".repeat(64) : hash,
          fileName: file.name,
          rowCount: 1,
        });
        if (completion === "lost") throw new Error("reply lost");
        return response(attempts.get(id));
      }
      if (path.endsWith("/fail")) {
        const body = JSON.parse(init.body);
        if (holdFailure) await failureRelease.promise;
        attempts.set(id, {
          ...attempts.get(id),
          state: "FAILED",
          errorCode: body.errorCode,
          errorMessage: body.errorMessage,
        });
        return response(attempts.get(id));
      }
      return response({ message: "unexpected owner route" }, 404);
    },
    collect: async (collection) => {
      if (!collectUntilStopped || collection.attemptId !== attemptId) return collected;
      // Like the Sellpia collector after a stop closes its tab: it sees the fence and returns.
      collectStarted.resolve();
      while (await collection.isActive()) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      return { success: false, errorCode: "sellpia_network_failed", error: "Sellpia tab was closed." };
    },
  });

  return {
    owner,
    sessions: sessionApi,
    calls,
    uploads,
    ownerWrites,
    removedTabs,
    storage,
    attempt: (id) => attempts.get(id),
    collectStarted: collectStarted.promise,
    releaseFailure: failureRelease.resolve,
    completionParked: completionParked.promise,
    releaseCompletion: completionRelease.resolve,
    // cancelOrdersCollectionSession fences the local session, then cancels through the owner.
    operatorStop: async (target) => {
      await sessionApi.requestCancellation(target.attemptId, target.environmentId);
      return owner.cancel(target);
    },
    get completeCalls() { return completeCalls; },
  };
}

test("requires the server-issued attempt ID and flat owner plan", () => {
  const context = vm.createContext({});
  vm.runInContext(ownerSource, context);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.KidItemSellpiaInventorySourceOwner.parseAction({ action: "collectSellpiaInventory", attemptId }))),
    { attemptId },
  );
  assert.throws(
    () => context.KidItemSellpiaInventorySourceOwner.parseAction({
      action: "collectSellpiaInventory",
      idempotencyKey: "legacy-key",
    }),
    /Invalid Sellpia inventory source request/,
  );
});

test("uploads the existing normalized snapshot as exact multipart bytes and clears local progress only after owner COMPLETE", async () => {
  const fixture = createFixture();
  const result = await fixture.owner.run({ environmentId: "office", attemptId });

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: true,
    attemptId,
    terminalState: "COMPLETE",
    continuationRequired: false,
  });
  const complete = fixture.calls.find((call) => call.path.endsWith("/complete"));
  assert.equal(complete.headers["x-source-attempt-token"], attemptToken);
  assert.equal(complete.body.get("file").name, "sellpia-inventory-snapshot-v1.json");
  assert.deepEqual(
    JSON.parse(new TextDecoder().decode(fixture.uploads[0])),
    snapshot,
  );
  assert.equal(fixture.completeCalls, 1);
  assert.equal((await fixture.sessions.list()).length, 0);
  assert.equal(fixture.calls.some((call) => call.path === `${sourcePath}`), false);
});

test("replays identical bytes after a lost completion ACK and reconciles content checksum", async () => {
  const fixture = createFixture({ completion: "lost" });
  const result = await fixture.owner.run({ environmentId: "local", attemptId });

  assert.equal(result.success, true);
  assert.equal(result.terminalState, "COMPLETE");
  assert.equal(fixture.completeCalls, 3);
  assert.equal(new Set(fixture.uploads.map((bytes) => Buffer.from(bytes).toString("hex")).values()).size, 1);
  assert.equal(fixture.calls.some((call) => call.path.endsWith("/fail")), false);
});

test("does not accept a different terminal content checksum and keeps the owner session replayable", async () => {
  const fixture = createFixture({ completion: "mismatch" });
  const first = await fixture.owner.run({ environmentId: "local", attemptId });

  assert.equal(first.success, false);
  assert.equal(first.errorCode, "SOURCE_OWNER_UNAVAILABLE");
  assert.equal(first.terminalState, "RUNNING");
  assert.equal((await fixture.sessions.get(attemptId))?.producer, "inventory.sellpia");

  const second = await fixture.owner.run({ environmentId: "local", attemptId });
  assert.equal(second.success, false);
  assert.equal(second.errorCode, "SOURCE_OWNER_UNAVAILABLE");
  assert.equal(fixture.completeCalls, 1);
  assert.equal(fixture.calls.some((call) => call.path.endsWith("/fail")), false);
});

test("leaves RUNNING owner and local correlation on unresolved completion transport failure", async () => {
  const fixture = createFixture({ completion: "running" });
  const result = await fixture.owner.run({ environmentId: "office", attemptId });

  assert.equal(result.success, false);
  assert.equal(result.errorCode, "SOURCE_OWNER_UNAVAILABLE");
  assert.equal(result.terminalState, "RUNNING");
  assert.equal(fixture.completeCalls, 3);
  assert.equal((await fixture.sessions.get(attemptId))?.producer, "inventory.sellpia");
  assert.equal(fixture.calls.some((call) => call.path.endsWith("/fail")), false);
});

test("submits collector login failure to owner and retains attention correlation", async () => {
  const fixture = createFixture({
    collected: {
      success: false,
      pendingLogin: true,
      errorCode: "sellpia_login_required",
      error: "Sellpia login is required.",
    },
  });
  const result = await fixture.owner.run({ environmentId: "office", attemptId });

  assert.equal(result.success, false);
  assert.equal(result.terminalState, "FAILED");
  assert.equal(result.errorCode, "sellpia_login_required");
  assert.deepEqual(JSON.parse(JSON.stringify((await fixture.sessions.get(attemptId))?.attention)), {
    reason: "marketplace_login",
    message: "Sellpia login is required.",
    canOpenTab: false,
  });
  const failure = fixture.calls.find((call) => call.path.endsWith("/fail"));
  assert.deepEqual(JSON.parse(failure.body), {
    errorCode: "sellpia_login_required",
    errorMessage: "Sellpia login is required.",
  });
});

function assertStoppedThenRestarted(fixture, restart) {
  const stopped = fixture.attempt(attemptId);
  assert.equal(stopped.state, "FAILED");
  assert.equal(stopped.errorCode, "COLLECTION_CANCELLED");
  assert.equal(restart.attemptId, restartAttemptId);
  assert.equal(restart.terminalState, "COMPLETE");
  const stoppedWrites = fixture.ownerWrites.filter((write) => write.attemptId === attemptId);
  assert.deepEqual(stoppedWrites.map((write) => write.route), ["fail"]);
  assert.deepEqual(stoppedWrites.filter((write) => write.afterEnd), []);
}

test("an operator stop during collection releases the environment for the next attempt", async () => {
  const fixture = createFixture({ collectUntilStopped: true, holdFailure: true });
  const running = fixture.owner.run({ environmentId: "office", attemptId });
  await fixture.collectStarted;

  const stopping = fixture.operatorStop({ environmentId: "office", attemptId });
  // The collector sees the stop, so the run returns before the owner acknowledges it.
  await running;
  fixture.releaseFailure();
  await stopping;

  const restart = await fixture.owner.run({ environmentId: "office", attemptId: restartAttemptId });
  assertStoppedThenRestarted(fixture, restart);
});

test("an operator stop with no run in this worker releases the environment for the next attempt", async () => {
  const fixture = createFixture();
  await fixture.sessions.start({ environmentId: "office", attemptId, producer: "inventory.sellpia" });

  await fixture.operatorStop({ environmentId: "office", attemptId });

  const restart = await fixture.owner.run({ environmentId: "office", attemptId: restartAttemptId });
  assertStoppedThenRestarted(fixture, restart);
});

test("an operator stop after the post-collect check releases the environment without completing the stopped attempt", async () => {
  const fixture = createFixture({ parkBeforeCompletion: true });
  const running = fixture.owner.run({ environmentId: "office", attemptId });
  await fixture.completionParked;

  await fixture.operatorStop({ environmentId: "office", attemptId });
  fixture.releaseCompletion();
  await running;

  const restart = await fixture.owner.run({ environmentId: "office", attemptId: restartAttemptId });
  assertStoppedThenRestarted(fixture, restart);
});
