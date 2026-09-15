import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const attemptId = "11111111-1111-4111-8111-111111111111";
const attemptToken = "22222222-2222-4222-8222-222222222222";
const restartAttemptId = "44444444-4444-4444-8444-444444444444";
const restartAttemptToken = "55555555-5555-4555-8555-555555555555";
const sourcePath = "/api/orders/sellpia-shipment-tracking/attempts";
const ownerSource = readFileSync(
  new URL("../kiditem-os/background/orders/sellpia-shipment-tracking-source-owner.js", import.meta.url),
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
  sourceType: "sellpia_shipment_tracking",
  parserVersion: "sellpia-shipment-tracking-v1",
  sourceOrigin: "https://kiditem.sellpia.com",
  sourceAccountKey: "kiditem",
  startDate: "2026-09-07",
  endDate: "2026-09-07",
};

const payload = {
  rows: [{
    ordNo: "ORDER-1",
    itemNo: "",
    invNo: "INV-1",
    courier: "1136",
    provider: "아이스크림몰",
  }],
  total: 1,
  range: { start: plan.startDate, end: plan.endDate },
};

function checksum(bytes) {
  const length = Buffer.allocUnsafe(8);
  length.writeBigUInt64BE(BigInt(bytes.length));
  return createHash("sha256").update(length).update(bytes).digest("hex");
}

function control(state = "RUNNING", patch = {}) {
  return {
    attemptId,
    attemptToken,
    sourceImportRunId: attemptId,
    state,
    plan,
    expiresAt: "2099-01-01T00:00:00.000Z",
    artifactId: state === "COMPLETE" ? "33333333-3333-4333-8333-333333333333" : null,
    sourceFileName: state === "COMPLETE" ? "sellpia-shipment-tracking-v1.json" : null,
    sourceContentType: state === "COMPLETE" ? "application/json" : null,
    contentChecksum: null,
    sourceByteCount: state === "COMPLETE" ? 1 : null,
    errorCode: null,
    errorMessage: null,
    ...patch,
  };
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 400,
    status,
    async json() { return structuredClone(body); },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((settle) => { resolve = settle; });
  return { promise, resolve };
}

function createFixture({
  lostCompletion = false,
  collected = { success: true, ...payload },
  collectUntilStopped = false,
  holdFailure = false,
  parkBeforeCompletion = false,
  holdCompletion = false,
  unresolvedCompletion = false,
  failReadsAfterCompletion = 0,
} = {}) {
  const context = vm.createContext({
    Blob,
    Date,
    DataView,
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
    BigInt,
  });
  vm.runInContext(wireSource, context);
  vm.runInContext(sessionSource, context);
  vm.runInContext(ownerSource, context);

  const storage = {};
  const calls = [];
  const uploads = [];
  const ownerWrites = [];
  const chrome = {
    storage: {
      local: {
        get: async (key) => ({ [key]: structuredClone(storage[key]) }),
        set: async (values) => Object.assign(storage, structuredClone(values)),
      },
    },
    tabs: { query: async () => [], remove: async () => undefined },
  };
  const sessions = context.KidItemCollectionSession.create({
    chrome,
    storageKey: "sessions",
    webUrlPatterns: [],
  });
  const collectStarted = deferred();
  const failureRelease = deferred();
  const completionParked = deferred();
  const completionRelease = deferred();
  const completionHeld = deferred();
  const completionHoldRelease = deferred();
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
    [restartAttemptId, control("RUNNING", { attemptId: restartAttemptId, attemptToken: restartAttemptToken, sourceImportRunId: restartAttemptId })],
  ]);
  let completeCalls = 0;
  let readsAfterCompletion = 0;

  const owner = context.KidItemSellpiaShipmentTrackingSourceOwner.create({
    chrome,
    sessions: sessionApi,
    request: async (environmentId, path, init = {}) => {
      calls.push({ environmentId, path, method: init.method || "GET", headers: init.headers, body: init.body });
      const method = init.method || "GET";
      const id = decodeURIComponent(path.slice(`${sourcePath}/`.length).split("/")[0]);
      const current = attempts.get(id);
      if (method === "GET") {
        if (completeCalls > 0 && readsAfterCompletion < failReadsAfterCompletion) {
          readsAfterCompletion += 1;
          throw new Error("owner read temporarily unavailable");
        }
        return response(current);
      }
      ownerWrites.push({ attemptId: id, route: path.split("/").at(-1), afterEnd: current.state !== "RUNNING" });
      if (path.endsWith("/complete")) {
        completeCalls += 1;
        const file = init.body?.get("file");
        const bytes = new Uint8Array(await file.arrayBuffer());
        uploads.push(bytes);
        if (holdCompletion && completeCalls === 1) {
          completionHeld.resolve();
          await completionHoldRelease.promise;
          return response({ message: "owner completion is unavailable" }, 503);
        }
        if (unresolvedCompletion && id === attemptId) throw new Error("completion transport failed");
        attempts.set(id, control("COMPLETE", {
          attemptId: id,
          attemptToken: current.attemptToken,
          sourceImportRunId: id,
          contentChecksum: checksum(bytes),
          sourceByteCount: bytes.byteLength,
        }));
        if (lostCompletion) throw new Error("completion reply lost");
        return response(attempts.get(id));
      }
      if (path.endsWith("/fail")) {
        const body = JSON.parse(init.body);
        if (holdFailure) await failureRelease.promise;
        attempts.set(id, control("FAILED", {
          attemptId: id,
          attemptToken: current.attemptToken,
          sourceImportRunId: id,
          errorCode: body.errorCode,
          errorMessage: body.errorMessage,
        }));
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
    attempt: (id) => attempts.get(id),
    collectStarted: collectStarted.promise,
    releaseFailure: failureRelease.resolve,
    completionParked: completionParked.promise,
    releaseCompletion: completionRelease.resolve,
    completionHeld: completionHeld.promise,
    releaseHeldCompletion: completionHoldRelease.resolve,
    // cancelOrdersCollectionSession fences the local session, then cancels through the owner.
    operatorStop: async (target) => {
      await sessionApi.requestCancellation(target.attemptId, target.environmentId);
      return owner.cancel(target);
    },
    get completeCalls() { return completeCalls; },
  };
}

// An operator stop must leave exactly one owner /fail on the stopped attempt and
// must release the environment so the next collection is admitted.
function assertStoppedThenRestarted(fixture, restart) {
  const stopped = fixture.attempt(attemptId);
  assert.equal(stopped.state, "FAILED");
  assert.equal(stopped.errorCode, "COLLECTION_CANCELLED");
  assert.equal(restart.attemptId, restartAttemptId);
  assert.equal(restart.terminalState, "COMPLETE");
  const stoppedWrites = fixture.ownerWrites.filter((write) => write.attemptId === attemptId);
  assert.deepEqual(stoppedWrites.filter((write) => write.route === "fail").length, 1);
  assert.deepEqual(stoppedWrites.filter((write) => write.afterEnd), []);
}

test("requires the server-issued attempt ID and rejects caller-owned dates", () => {
  const context = vm.createContext({});
  vm.runInContext(ownerSource, context);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.KidItemSellpiaShipmentTrackingSourceOwner.parseAction({
      action: "collectSellpiaDeliTracking",
      attemptId,
    }))),
    { attemptId },
  );
  assert.throws(
    () => context.KidItemSellpiaShipmentTrackingSourceOwner.parseAction({
      action: "collectSellpiaDeliTracking",
      attemptId,
      startDate: plan.startDate,
    }),
    /Invalid Sellpia shipment tracking source request/,
  );
});

test("uploads one frozen raw capture and returns no provider rows to the page", async () => {
  const fixture = createFixture();
  const result = await fixture.owner.run({ environmentId: "office", attemptId });

  assert.equal(result.success, true);
  assert.equal(result.terminalState, "COMPLETE");
  assert.deepEqual(JSON.parse(new TextDecoder().decode(fixture.uploads[0])), payload);
  assert.equal(fixture.calls.find((call) => call.path.endsWith("/complete")).headers["x-source-attempt-token"], attemptToken);
  assert.equal((await fixture.sessions.list()).length, 0);
});

test("transports independently confirmed coverage without replacing it with the requested range", async () => {
  const confirmedRange = { start: plan.startDate, end: plan.endDate };
  const fixture = createFixture({ collected: { success: true, ...payload, confirmedRange } });
  const result = await fixture.owner.run({ environmentId: "local", attemptId });
  assert.equal(result.success, true);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(fixture.uploads[0])).confirmedRange, confirmedRange);
});

test("does not manufacture a missing provider query range from the frozen plan", async () => {
  const fixture = createFixture({ collected: { success: true, rows: [], total: 0 } });
  const result = await fixture.owner.run({ environmentId: "local", attemptId });
  assert.equal(result.success, false);
  assert.equal(result.terminalState, "FAILED");
  assert.equal(result.errorCode, "sellpia_invalid_tracking_evidence");
  assert.equal(fixture.uploads.length, 0);
});

test("replays identical bytes after a lost completion ACK and keeps the owner fence", async () => {
  const fixture = createFixture({ lostCompletion: true });
  const result = await fixture.owner.run({ environmentId: "local", attemptId });

  assert.equal(result.success, true);
  assert.equal(result.terminalState, "COMPLETE");
  assert.equal(fixture.completeCalls, 3);
  assert.equal(new Set(fixture.uploads.map((bytes) => Buffer.from(bytes).toString("hex"))).size, 1);
});

test("records provider login failure as owner FAILED and retains attention", async () => {
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
  assert.equal((await fixture.sessions.get(attemptId))?.attention?.reason, "marketplace_login");
  assert.equal(fixture.calls.filter((call) => call.path.endsWith("/complete")).length, 0);
});

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

test("an operator stop that overlaps the completion's first fence check releases the environment", async () => {
  const fixture = createFixture({ parkBeforeCompletion: true });
  const running = fixture.owner.run({ environmentId: "office", attemptId });
  await fixture.completionParked;

  await fixture.operatorStop({ environmentId: "office", attemptId });
  fixture.releaseCompletion();
  await running;

  const restart = await fixture.owner.run({ environmentId: "office", attemptId: restartAttemptId });
  assertStoppedThenRestarted(fixture, restart);
  // The stop reached the owner before the parked completion resumed, so the
  // stopped attempt never received a completion body.
  assert.deepEqual(
    fixture.ownerWrites.filter((write) => write.attemptId === attemptId).map((write) => write.route),
    ["fail"],
  );
});

test("an operator stop during the completion retry loop still ends the attempt with one /fail", async () => {
  const fixture = createFixture({ holdCompletion: true });
  const running = fixture.owner.run({ environmentId: "office", attemptId });
  await fixture.completionHeld;

  // Fence first, exactly as the web stop does, then join the in-flight completion.
  await fixture.sessions.requestCancellation(attemptId, "office");
  const stopping = fixture.owner.cancel({ environmentId: "office", attemptId });
  fixture.releaseHeldCompletion();
  await running;
  await stopping;

  const restart = await fixture.owner.run({ environmentId: "office", attemptId: restartAttemptId });
  assertStoppedThenRestarted(fixture, restart);
});

test("an operator stop after an unresolved completion ends the still-RUNNING attempt", async () => {
  const fixture = createFixture({ unresolvedCompletion: true });
  const unresolved = await fixture.owner.run({ environmentId: "office", attemptId });
  assert.equal(unresolved.errorCode, "SOURCE_OWNER_UNAVAILABLE");
  assert.equal(fixture.attempt(attemptId).state, "RUNNING");

  await fixture.operatorStop({ environmentId: "office", attemptId });

  const restart = await fixture.owner.run({ environmentId: "office", attemptId: restartAttemptId });
  assertStoppedThenRestarted(fixture, restart);
});

test("an operator stop after an unresolved completion releases a COMPLETE attempt for the next collection", async () => {
  const fixture = createFixture({ lostCompletion: true, failReadsAfterCompletion: 3 });
  const unresolved = await fixture.owner.run({ environmentId: "office", attemptId });
  assert.equal(unresolved.errorCode, "SOURCE_OWNER_UNAVAILABLE");
  assert.equal(fixture.attempt(attemptId).state, "COMPLETE");

  const stopped = await fixture.operatorStop({ environmentId: "office", attemptId });
  assert.equal(stopped.terminalState, "COMPLETE");

  const restart = await fixture.owner.run({ environmentId: "office", attemptId: restartAttemptId });
  assert.equal(restart.attemptId, restartAttemptId);
  assert.equal(restart.terminalState, "COMPLETE");
  // The stop must not turn an owner completion into a failure.
  assert.deepEqual(
    fixture.ownerWrites.filter((write) => write.attemptId === attemptId && write.route === "fail"),
    [],
  );
});
