import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const attemptId = "11111111-1111-4111-8111-111111111111";
const attemptToken = "22222222-2222-4222-8222-222222222222";
const restartAttemptId = "33333333-3333-4333-8333-333333333333";
const restartAttemptToken = "44444444-4444-4444-8444-444444444444";
const sourcePath = "/api/sellpia-sales/attempts";
const ownerSource = readFileSync(
  new URL("../kiditem-os/background/orders/sellpia-sales-source-owner.js", import.meta.url),
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
  sourceType: "sellpia_sales_daily",
  parserVersion: "sellpia-sales-v1",
  sourceOrigin: "https://kiditem.sellpia.com",
  sourcePath: "/sale_summary.html?mode=main_link",
  sourceAccountKey: "kiditem",
  range: { from: "2026-07-17", to: "2026-07-18" },
  businessDates: ["2026-07-17", "2026-07-18"],
};

const payload = {
  range: plan.range,
  sellers: [{
    sellerId: "118",
    sellerName: "스마트스토어",
    days: [{ date: "2026-07-17", price: 1200, amount: 2, buyPrice: 700 }],
  }],
};

function control(state = "RUNNING", patch = {}) {
  return {
    attemptId,
    attemptToken,
    state,
    expiresAt: "2099-01-01T00:00:00.000Z",
    plan,
    actualCutoffAt: null,
    completedAt: null,
    contentChecksum: null,
    contentByteCount: null,
    rowCount: 0,
    sellerCount: 0,
    businessDates: [],
    errorCode: null,
    errorMessage: null,
    ...patch,
  };
}

function terminalControl(state, patch = {}) {
  const value = control(state, patch);
  delete value.attemptToken;
  return value;
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
  collected = { success: true, payload },
  loseCompletionAck = false,
  loseFailureAck = false,
  collectImpl = null,
  collectUntilStopped = false,
  holdFailure = false,
  parkBeforeCompletion = false,
  holdCompletion = null,
  unresolvedCompletion = false,
  lostCompletion = false,
  failReadsAfterCompletion = 0,
} = {}) {
  const context = vm.createContext({
    Date,
    Map,
    TextDecoder,
    TextEncoder,
    URL,
    setTimeout,
    clearTimeout,
    structuredClone,
  });
  vm.runInContext(wireSource, context);
  vm.runInContext(sessionSource, context);
  vm.runInContext(ownerSource, context);

  const storage = {};
  const calls = [];
  const bodies = [];
  const chrome = {
    storage: {
      local: {
        get: async (key) => ({ [key]: structuredClone(storage[key]) }),
        set: async (values) => Object.assign(storage, structuredClone(values)),
      },
    },
    tabs: {
      query: async () => [],
      remove: async () => undefined,
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
    [restartAttemptId, control("RUNNING", { attemptId: restartAttemptId, attemptToken: restartAttemptToken })],
  ]);
  let completeCalls = 0;
  let collectCalls = 0;
  let failCalls = 0;
  let readsAfterCompletion = 0;

  const owner = context.KidItemSellpiaSalesSourceOwner.create({
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
        bodies.push(JSON.parse(init.body));
        if (holdCompletion && completeCalls === 1) {
          completionHeld.resolve();
          await completionHoldRelease.promise;
          if (holdCompletion === "unavailable") {
            return response({ message: "owner completion is unavailable" }, 503);
          }
        }
        if (unresolvedCompletion && id === attemptId) throw new Error("completion transport failed");
        attempts.set(id, terminalControl("COMPLETE", {
          attemptId: id,
          actualCutoffAt: "2026-07-18T00:00:00.000Z",
          completedAt: "2026-07-18T10:00:00.000Z",
          rowCount: 2,
          sellerCount: 1,
          businessDates: plan.businessDates,
        }));
        if (loseCompletionAck && completeCalls === 1) throw new Error("completion reply lost");
        if (lostCompletion && id === attemptId) throw new Error("completion reply lost");
        return response(attempts.get(id));
      }
      if (path.endsWith("/fail")) {
        failCalls += 1;
        const failure = JSON.parse(init.body);
        if (holdFailure) await failureRelease.promise;
        attempts.set(id, terminalControl("FAILED", {
          attemptId: id,
          errorCode: failure.errorCode,
          errorMessage: failure.errorMessage,
        }));
        if (loseFailureAck && failCalls === 1) throw new Error("failure reply lost");
        return response(attempts.get(id));
      }
      return response({ message: "unexpected owner route" }, 404);
    },
    collect: async (collection) => {
      collectCalls += 1;
      if (collectUntilStopped && collection.attemptId === attemptId) {
        // Like the Sellpia collector after a stop closes its tab: it sees the fence and returns.
        collectStarted.resolve();
        while (await collection.isActive()) {
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
        return { success: false, errorCode: "sellpia_network_failed", error: "Sellpia tab was closed." };
      }
      return collectImpl ? collectImpl(collection) : collected;
    },
  });

  return {
    owner,
    sessions: sessionApi,
    calls,
    bodies,
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
    get collectCalls() { return collectCalls; },
    get failCalls() { return failCalls; },
  };
}

test("requires the server-issued attempt ID and rejects caller-owned range fields", () => {
  const context = vm.createContext({});
  vm.runInContext(ownerSource, context);
  assert.deepEqual(
    JSON.parse(JSON.stringify(context.KidItemSellpiaSalesSourceOwner.parseAction({
      action: "collectSellpiaSaleSummary",
      attemptId,
    }))),
    { attemptId },
  );
  assert.throws(
    () => context.KidItemSellpiaSalesSourceOwner.parseAction({
      action: "collectSellpiaSaleSummary",
      attemptId,
      startDate: plan.range.from,
    }),
    /Invalid Sellpia sales source request/,
  );
});

test("a delayed capture cannot publish COMPLETE after owner cancellation fences the local run", async () => {
  let captureStarted;
  const started = new Promise((resolve) => { captureStarted = resolve; });
  let releaseCapture;
  const captureFinished = new Promise((resolve) => { releaseCapture = resolve; });
  const fixture = createFixture({
    collectImpl: async () => {
      captureStarted();
      await captureFinished;
      return { success: true, payload };
    },
  });

  const running = fixture.owner.run({ environmentId: "office", attemptId });
  await started;
  await fixture.sessions.requestCancellation(attemptId, "office");
  const cancellation = fixture.owner.cancel({ environmentId: "office", attemptId });
  const cancelled = await cancellation;
  releaseCapture();
  const result = await running;

  assert.equal(cancelled.terminalState, "FAILED");
  assert.equal(result.terminalState, "FAILED");
  assert.equal(fixture.completeCalls, 0);
  assert.equal(fixture.failCalls, 1);
});

test("uploads the frozen plan payload directly and clears local progress only after COMPLETE", async () => {
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
  assert.deepEqual(fixture.bodies[0].range, plan.range);
  assert.equal(typeof fixture.bodies[0].capturedAt, "string");
  assert.equal(Number.isNaN(Date.parse(fixture.bodies[0].capturedAt)), false);
  assert.deepEqual(fixture.bodies[0].sellers, payload.sellers);
  assert.equal(fixture.completeCalls, 1);
  assert.equal((await fixture.sessions.list()).length, 0);
});

test("reconciles a lost terminal response through the persisted COMPLETE attempt", async () => {
  const fixture = createFixture({ loseCompletionAck: true });
  const result = await fixture.owner.run({ environmentId: "local", attemptId });

  assert.equal(result.success, true);
  assert.equal(result.terminalState, "COMPLETE");
  assert.equal(fixture.completeCalls, 2);
  assert.equal(fixture.bodies[0].capturedAt, fixture.bodies[1].capturedAt);
  assert.equal((await fixture.sessions.list()).length, 0);
});

test("records provider login failure as FAILED and keeps attention correlation", async () => {
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
  assert.equal(result.errorCode, "SELLPIA_LOGIN_REQUIRED");
  assert.deepEqual(JSON.parse(JSON.stringify((await fixture.sessions.get(attemptId))?.attention)), {
    reason: "marketplace_login",
    message: "Sellpia login is required.",
    canOpenTab: false,
  });
  const failure = fixture.calls.find((call) => call.path.endsWith("/fail"));
  assert.deepEqual(JSON.parse(failure.body), {
    errorCode: "SELLPIA_LOGIN_REQUIRED",
    errorMessage: "Sellpia login is required.",
  });
  assert.match(failure.body, /"errorCode":"[A-Z0-9_:-]{1,100}"/);
  assert.equal(fixture.calls.at(-1).method, "GET");
  assert.equal(fixture.calls.at(-1).path, `${sourcePath}/${attemptId}`);
});

test("uses a DTO-valid fallback for absent and invalid provider failure codes", async () => {
  for (const errorCode of [undefined, "provider failure/💥"]) {
    const fixture = createFixture({
      collected: {
        success: false,
        ...(errorCode === undefined ? {} : { errorCode }),
        error: "Sellpia provider failure.",
      },
    });
    const result = await fixture.owner.run({ environmentId: "office", attemptId });

    assert.equal(result.success, false);
    assert.equal(result.terminalState, "FAILED");
    assert.equal(result.errorCode, "SELLPIA_SALES_COLLECTION_FAILED");
    const failure = fixture.calls.find((call) => call.path.endsWith("/fail"));
    const body = JSON.parse(failure.body);
    assert.deepEqual(body, {
      errorCode: "SELLPIA_SALES_COLLECTION_FAILED",
      errorMessage: "Sellpia provider failure.",
    });
    assert.match(body.errorCode, /^[A-Z0-9_:-]{1,100}$/);
    assert.equal(fixture.calls.at(-1).method, "GET");
    assert.equal(fixture.calls.at(-1).path, `${sourcePath}/${attemptId}`);
  }
});

test("replays a lost failure acknowledgement without recollecting", async () => {
  const fixture = createFixture({
    loseFailureAck: true,
    collected: {
      success: false,
      errorCode: "provider_failure",
      error: "Sellpia provider failure.",
    },
  });

  const result = await fixture.owner.run({ environmentId: "local", attemptId });

  assert.equal(result.success, false);
  assert.equal(result.terminalState, "FAILED");
  assert.equal(result.errorCode, "PROVIDER_FAILURE");
  assert.equal(fixture.collectCalls, 1);
  assert.equal(fixture.failCalls, 2);
  assert.equal(fixture.calls.at(-1).method, "GET");
  assert.equal(fixture.calls.at(-1).path, `${sourcePath}/${attemptId}`);
});

test("does not publish a payload whose range differs from the frozen attempt", async () => {
  const fixture = createFixture({
    collected: {
      success: true,
      payload: { ...payload, range: { from: "2026-07-16", to: "2026-07-18" } },
    },
  });
  const result = await fixture.owner.run({ environmentId: "office", attemptId });

  assert.equal(result.success, false);
  assert.equal(result.terminalState, "FAILED");
  assert.equal(result.errorCode, "SELLPIA_SALES_PAYLOAD_INVALID");
  assert.equal(fixture.completeCalls, 0);
  assert.equal(fixture.calls.filter((call) => call.path.endsWith("/fail")).length, 1);
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
  await fixture.sessions.start({ environmentId: "office", attemptId, producer: "orders.sellpia_sales" });

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

// A stop must leave exactly one owner /fail on the stopped attempt and release
// the environment, even when it overlaps a terminal request already in flight.
function assertOneCancelThenRestarted(fixture, restart) {
  const stopped = fixture.attempt(attemptId);
  assert.equal(stopped.state, "FAILED");
  assert.equal(stopped.errorCode, "COLLECTION_CANCELLED");
  assert.equal(restart.attemptId, restartAttemptId);
  assert.equal(restart.terminalState, "COMPLETE");
  const stoppedWrites = fixture.ownerWrites.filter((write) => write.attemptId === attemptId);
  assert.equal(stoppedWrites.filter((write) => write.route === "fail").length, 1);
  assert.deepEqual(stoppedWrites.filter((write) => write.afterEnd), []);
}

test("an operator stop during the completion retry loop still ends the attempt with one /fail", async () => {
  const fixture = createFixture({ holdCompletion: "unavailable" });
  const running = fixture.owner.run({ environmentId: "office", attemptId });
  await fixture.completionHeld;

  // Fence first, exactly as the web stop does, then join the in-flight completion.
  await fixture.sessions.requestCancellation(attemptId, "office");
  const stopping = fixture.owner.cancel({ environmentId: "office", attemptId });
  fixture.releaseHeldCompletion();
  await running;
  await stopping;

  const restart = await fixture.owner.run({ environmentId: "office", attemptId: restartAttemptId });
  assertOneCancelThenRestarted(fixture, restart);
});

test("an operator stop that joins a completion the owner accepts leaves the attempt COMPLETE and releases the environment", async () => {
  const fixture = createFixture({ holdCompletion: "accept" });
  const running = fixture.owner.run({ environmentId: "office", attemptId });
  await fixture.completionHeld;

  await fixture.sessions.requestCancellation(attemptId, "office");
  const stopping = fixture.owner.cancel({ environmentId: "office", attemptId });
  fixture.releaseHeldCompletion();
  await running;
  const stopped = await stopping;

  assert.equal(stopped.terminalState, "COMPLETE");
  assert.equal(fixture.attempt(attemptId).state, "COMPLETE");
  const restart = await fixture.owner.run({ environmentId: "office", attemptId: restartAttemptId });
  assert.equal(restart.attemptId, restartAttemptId);
  assert.equal(restart.terminalState, "COMPLETE");
  // The completion won the race, so the stop sends no /fail.
  assert.deepEqual(
    fixture.ownerWrites.filter((write) => write.attemptId === attemptId && write.route === "fail"),
    [],
  );
});

test("an operator stop after an unresolved completion ends the still-RUNNING attempt", async () => {
  const fixture = createFixture({ unresolvedCompletion: true });
  const unresolved = await fixture.owner.run({ environmentId: "office", attemptId });
  assert.equal(unresolved.errorCode, "SOURCE_OWNER_UNAVAILABLE");
  assert.equal(fixture.attempt(attemptId).state, "RUNNING");

  await fixture.operatorStop({ environmentId: "office", attemptId });

  const restart = await fixture.owner.run({ environmentId: "office", attemptId: restartAttemptId });
  assertOneCancelThenRestarted(fixture, restart);
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
