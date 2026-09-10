import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ownerPath = path.join(
  repoRoot,
  "extensions/kiditem-os/background/coupang/keyword-suggestion-source-owner.js",
);
const contractPath = path.join(
  repoRoot,
  "extensions/kiditem-os/background/coupang/wing-keyword-contract.js",
);
const wirePath = path.join(
  repoRoot,
  "extensions/kiditem-os/background/sourcing/source-attempt-wire.js",
);

const attemptId = "11111111-1111-4111-8111-111111111111";
const attemptToken = "22222222-2222-4222-8222-222222222222";

const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

function harness({ collect, loseFirstUpload = false, activeSequence = [], onRead } = {}) {
  const calls = [];
  const storage = {};
  let state = "RUNNING";
  let lostUpload = false;
  let session = null;
  let active = true;
  const remainingActiveChecks = [...activeSequence];
  const plan = {
    source: "coupang.keyword_suggestion",
    keyword: "A Pencil",
    maxResults: 2,
  };
  const attempt = () => ({
    attemptId,
    attemptToken,
    sourceKey: "coupang.keyword_suggestion",
    scopeKey: "default",
    targetKey: "keyword:a pencil",
    state,
    expiresAt: "2030-01-02T00:00:00.000Z",
    plan,
    warnings: state === "COMPLETE" ? ["DOM fallback"] : [],
  });
  const chrome = {
    storage: {
      local: {
        get(key, callback) {
          const result = { [key]: clone(storage[key]) };
          callback?.(result);
          return Promise.resolve(result);
        },
        set(value, callback) {
          Object.assign(storage, clone(value));
          callback?.();
          return Promise.resolve();
        },
      },
    },
  };
  const sessions = {
    async start(value) {
      calls.push(["session.start", value]);
      session = { attemptId: value.attemptId, producer: value.producer, attention: null };
      return session;
    },
    async getOwned() {
      return session;
    },
    async isActive() {
      if (remainingActiveChecks.length > 0) return remainingActiveChecks.shift();
      return active && Boolean(session);
    },
    async cancel(attempt, options) {
      calls.push(["session.cancel", attempt, options]);
      if (options?.ownerFailure) await options.ownerFailure({ attemptId: attempt });
      session = null;
      return { attemptId: attempt };
    },
  };
  const request = async (_environmentId, pathValue, init = {}) => {
    calls.push(["request", pathValue, init]);
    if (init.method === "GET" && onRead) await onRead();
    if (init.method === "PUT") {
      if (loseFirstUpload && !lostUpload) {
        lostUpload = true;
        state = "COMPLETE";
        throw new Error("lost response");
      }
      state = "COMPLETE";
      return { ok: true, status: 200, json: async () => attempt() };
    }
    if (pathValue.endsWith("/fail")) {
      state = "FAILED";
      return { ok: true, status: 200, json: async () => attempt() };
    }
    return { ok: true, status: 200, json: async () => attempt() };
  };
  const ownerContext = vm.createContext({
    console,
    Date,
    Error,
    JSON,
    Map,
    Number,
    Object,
    Promise,
    Set,
    String,
    URL,
    URLSearchParams,
    chrome,
  });
  vm.runInContext(fs.readFileSync(contractPath, "utf8"), ownerContext, { filename: contractPath });
  vm.runInContext(fs.readFileSync(wirePath, "utf8"), ownerContext, { filename: wirePath });
  vm.runInContext(fs.readFileSync(ownerPath, "utf8"), ownerContext, { filename: ownerPath });
  const sourceOwner = ownerContext.KidItemKeywordSuggestionSourceOwner;
  const owner = sourceOwner.create({
    chrome,
    sessions,
    requireEnvironment(environmentId) {
      if (!["office", "local"].includes(environmentId)) throw new Error("environment");
    },
    request,
    collect: collect || (async () => ({
      success: true,
      items: [
        { keyword: "  Ａ Toy ", source: "coupang-autocomplete" },
        { keyword: "a toy", source: "coupang-search-dom" },
        { keyword: "연필", source: "coupang-search-dom" },
      ],
      productNameTokens: [
        { keyword: " Ａ Toy ", count: 4 },
        { keyword: "a toy", count: 8 },
        { keyword: "연필", count: 2 },
      ],
      warnings: ["DOM fallback", 42],
    })),
  });
  return {
    owner,
    sourceOwner,
    calls,
    storage,
    attempt,
    getState: () => state,
    sessions,
    setActive: (value) => { active = Boolean(value); },
  };
}

const input = {
  environmentId: "office",
  idempotencyKey: "key",
  input: { keyword: " Ａ  Pencil ", maxResults: 2 },
};

test("source owner validates the frozen plan and sanitizes the collector receipt", async () => {
  const fake = harness();
  const result = await fake.owner.run(input);
  assert.equal(result.state, "COMPLETE");
  assert.equal(fake.calls.filter(([name]) => name === "session.start").length, 1);
  const upload = fake.calls.find(([name, pathValue, init]) => name === "request" && init.method === "PUT");
  assert.ok(upload);
  const body = JSON.parse(upload[2].body);
  assert.deepEqual(body.items, [
    { rank: 1, keyword: "A Toy", source: "coupang-autocomplete" },
    { rank: 2, keyword: "연필", source: "coupang-search-dom" },
  ]);
  assert.deepEqual(body.productNameTokens, [
    { keyword: "A Toy", count: 4 },
    { keyword: "연필", count: 2 },
  ]);
  assert.deepEqual(body.warnings, ["DOM fallback"]);
  assert.equal(upload[2].headers["x-source-attempt-token"], attemptToken);
  assert.equal(JSON.stringify(result).includes(attemptToken), false);
  assert.equal(await fake.sessions.getOwned(attemptId, "office"), null);
});

test("source owner replays an uncertain COMPLETE acknowledgement without recollecting", async () => {
  let collections = 0;
  const fake = harness({
    loseFirstUpload: true,
    collect: async () => {
      collections += 1;
      return { success: true, items: [], productNameTokens: [] };
    },
  });
  assert.equal((await fake.owner.run(input)).state, "COMPLETE");
  assert.equal(collections, 1);
  assert.equal((await fake.owner.run(input)).state, "COMPLETE");
  assert.equal(collections, 1);
  assert.equal(fake.calls.filter(([name, _path, init]) => name === "request" && init.method === "PUT").length, 2);
});

test("source owner cancellation uses one exact owner failure and does not publish a receipt", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let started;
  const startedPromise = new Promise((resolve) => { started = resolve; });
  const fake = harness({
    collect: async () => {
      started();
      await gate;
      return { success: true, items: [], productNameTokens: [] };
    },
  });
  const running = fake.owner.run(input);
  await startedPromise;
  const cancelling = fake.owner.cancel({ environmentId: "office", attemptId });
  await new Promise((resolve) => setImmediate(resolve));
  release();
  await cancelling;
  assert.equal((await running).state, "FAILED");
  assert.equal(fake.calls.filter(([name, _path, init]) => name === "request" && init.method === "PUT").length, 0);
  assert.equal(fake.calls.filter(([name, pathValue]) => name === "request" && pathValue.endsWith("/fail")).length, 1);
});

test("source owner stops a stored non-cancellation terminal when its session is no longer active", async () => {
  const fake = harness({ activeSequence: [true, true, false] });
  const result = await fake.owner.run(input);

  assert.equal(result.cancellationPending, true);
  assert.equal(fake.calls.filter(([name, _path, init]) => name === "request" && init.method === "PUT").length, 0);
  assert.equal(fake.calls.filter(([name, pathValue]) => name === "request" && pathValue.endsWith("/fail")).length, 0);
});

test("source owner stops a terminal retry after cancellation without replaying the retained receipt", async () => {
  const fake = harness({
    loseFirstUpload: true,
    activeSequence: [true, true, true, true, false],
  });
  const result = await fake.owner.run(input);

  assert.equal(result.cancellationPending, true);
  assert.equal(fake.calls.filter(([name, _path, init]) => name === "request" && init.method === "PUT").length, 1);
  assert.equal(fake.calls.filter(([name, pathValue]) => name === "request" && pathValue.endsWith("/fail")).length, 0);
});

test("source owner cancellation reconciles a deferred recovery read without starting a new collection", async () => {
  let signalRead;
  let releaseRead;
  const readStarted = new Promise((resolve) => { signalRead = resolve; });
  const readRelease = new Promise((resolve) => { releaseRead = resolve; });
  const fake = harness({
    onRead: async () => {
      signalRead();
      await readRelease;
    },
  });
  fake.storage[`kiditem_keyword_suggestion_attempt_v1:office:${attemptId}`] = {
    attemptId,
    idempotencyKey: "key",
  };

  const cancelling = fake.owner.cancel({ environmentId: "office", attemptId });
  await readStarted;
  assert.equal(fake.calls.filter(([name]) => name === "session.start").length, 0);
  releaseRead();
  const result = await cancelling;

  assert.deepEqual(result, { attemptId });
  assert.equal(fake.calls.filter(([name, pathValue]) => name === "request" && pathValue.endsWith("/fail")).length, 1);
  assert.equal(fake.calls.filter(([name, _path, init]) => name === "request" && init.method === "PUT").length, 0);
});

test("source owner parse boundary rejects environment injection and defaults", () => {
  const fake = harness();
  assert.deepEqual(
    JSON.parse(JSON.stringify(fake.sourceOwner.parseStart({
      action: "collectSourcingKeywordSuggestions",
      idempotencyKey: "key",
      keyword: " Ａ Pencil ",
      maxResults: 30,
    }))),
    { idempotencyKey: "key", input: { keyword: "A Pencil", maxResults: 30 } },
  );
  assert.throws(() => fake.sourceOwner.parseStart({
    action: "collectSourcingKeywordSuggestions",
    idempotencyKey: "key",
    keyword: "pencil",
    maxResults: 20,
    environmentId: "local",
  }), /keyword_suggestion_source_input_invalid/);
  assert.throws(() => fake.sourceOwner.parseInput({ keyword: "pencil", maxResults: 0 }), /keyword_suggestion_source_input_invalid/);
});

test("source owner token counts reject coercive values while preserving canonical digit strings", async () => {
  const fake = harness({
    collect: async () => ({
      success: true,
      items: [],
      productNameTokens: [
        { keyword: "zero", count: "0" },
        { keyword: "leading", count: "02" },
        { keyword: "canonical", count: "2" },
        { keyword: "array", count: [] },
        { keyword: "object", count: {} },
        { keyword: "boolean", count: true },
      ],
    }),
  });
  const result = await fake.owner.run(input);
  assert.equal(result.state, "COMPLETE");
  const upload = fake.calls.find(([name, _path, init]) => name === "request" && init.method === "PUT");
  const body = JSON.parse(upload[2].body);
  assert.deepEqual(body.productNameTokens, [{ keyword: "canonical", count: 2 }]);
});
