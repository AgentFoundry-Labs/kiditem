import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const attemptId = "11111111-1111-4111-8111-111111111111";
const attemptToken = "22222222-2222-4222-8222-222222222222";
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

function createFixture({ lostCompletion = false, collected = { success: true, ...payload } } = {}) {
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
  const sessionApi = sessions;
  let current = control();
  let completeCalls = 0;
  const owner = context.KidItemSellpiaShipmentTrackingSourceOwner.create({
    chrome,
    sessions: sessionApi,
    request: async (environmentId, path, init = {}) => {
      calls.push({ environmentId, path, method: init.method || "GET", headers: init.headers, body: init.body });
      const method = init.method || "GET";
      if (method === "GET") return response(current);
      if (path.endsWith("/complete")) {
        completeCalls += 1;
        const file = init.body?.get("file");
        const bytes = new Uint8Array(await file.arrayBuffer());
        uploads.push(bytes);
        current = control("COMPLETE", {
          contentChecksum: checksum(bytes),
          sourceByteCount: bytes.byteLength,
        });
        if (lostCompletion) throw new Error("completion reply lost");
        return response(current);
      }
      if (path.endsWith("/fail")) {
        const body = JSON.parse(init.body);
        current = control("FAILED", {
          errorCode: body.errorCode,
          errorMessage: body.errorMessage,
        });
        return response(current);
      }
      return response({ message: "unexpected owner route" }, 404);
    },
    collect: async () => collected,
  });
  return { owner, sessions: sessionApi, calls, uploads, get completeCalls() { return completeCalls; } };
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
