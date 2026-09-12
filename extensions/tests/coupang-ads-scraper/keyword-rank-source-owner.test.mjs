import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const wireSource = await readFile(
  new URL("../../kiditem-os/background/sourcing/source-attempt-wire.js", import.meta.url),
  "utf8",
);
const ownerSource = await readFile(
  new URL("../../kiditem-os/background/coupang/keyword-rank-source-owner.js", import.meta.url),
  "utf8",
);

const ATTEMPT_ID = "10000000-0000-4000-8000-000000000001";
const ATTEMPT_TOKEN = "20000000-0000-4000-8000-000000000001";
const ATTEMPT_PATH = `/api/ads/keyword-rank/serp/attempts/${ATTEMPT_ID}`;

function deferred() {
  let resolve;
  const promise = new Promise((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

function harness({ ownerReadUnavailableAfterCancel = false } = {}) {
  const requests = [];
  const sessionCalls = [];
  let state = "RUNNING";
  let active = false;
  let failCompleted = false;
  const captureStarted = deferred();
  const releaseCapture = deferred();
  const failPosted = deferred();
  const chrome = {
    storage: {
      local: {
        get(_key, callback) {
          const value = {};
          callback?.(value);
          return Promise.resolve(value);
        },
        set(_value, callback) {
          callback?.();
          return Promise.resolve();
        },
      },
    },
  };
  const attempt = () => ({
    attemptId: ATTEMPT_ID,
    attemptToken: ATTEMPT_TOKEN,
    state,
    itemCount: 0,
    errorCode: state === "FAILED" ? "COLLECTION_CANCELLED" : null,
    errorMessage: state === "FAILED" ? "키워드 순위 수집이 취소되었습니다." : null,
    expiresAt: "2099-01-02T00:00:00.000Z",
    plan: {
      sourceType: "coupang_keyword_serp",
      parserVersion: "keyword-serp-v1",
      keyword: "pencil",
      maxPages: 1,
    },
  });
  const request = async (environmentId, path, init = {}) => {
    requests.push({ environmentId, path, init });
    if (init.method === "GET") {
      if (ownerReadUnavailableAfterCancel && failCompleted) {
        throw new Error("owner unavailable after cancellation");
      }
      return { ok: true, status: 200, json: async () => attempt() };
    }
    assert.equal(path, `${ATTEMPT_PATH}/fail`);
    state = "FAILED";
    failCompleted = true;
    failPosted.resolve();
    return { ok: true, status: 200, json: async () => attempt() };
  };
  const sessions = {
    async start(value) {
      active = true;
      sessionCalls.push(["start", value]);
      return { ...value };
    },
    isActive() {
      return active;
    },
    async getOwned() {
      return active ? { attemptId: ATTEMPT_ID, producer: "advertising.keyword_rank" } : null;
    },
    async cancel(attemptId, options) {
      sessionCalls.push(["cancel", attemptId, options]);
      active = false;
      if (options?.ownerFailure) await options.ownerFailure();
      return { attemptId };
    },
  };
  const context = vm.createContext({
    Error,
    JSON,
    Map,
    Promise,
    Set,
    String,
    chrome,
  });
  vm.runInContext(wireSource, context, { filename: "source-attempt-wire.js" });
  vm.runInContext(ownerSource, context, { filename: "keyword-rank-source-owner.js" });
  const owner = context.KidItemKeywordRankSourceOwner.create({
    kind: "serp",
    chrome,
    request,
    sessions,
    collect: async () => {
      captureStarted.resolve();
      await releaseCapture.promise;
      return { success: true, pagesScanned: 1, items: [] };
    },
  });
  return {
    owner,
    requests,
    sessionCalls,
    captureStarted,
    releaseCapture,
    failPosted,
    isActive: () => active,
  };
}

async function runCancellationCase(options) {
  const h = harness(options);
  const running = h.owner.run({ environmentId: "office", attemptId: ATTEMPT_ID });
  await h.captureStarted.promise;
  const cancelling = h.owner.cancel({ environmentId: "office", attemptId: ATTEMPT_ID });
  await h.failPosted.promise;
  assert.equal(h.isActive(), false);
  h.releaseCapture.resolve();
  return { h, cancelResult: await cancelling, runResult: await running };
}

test("cancellation reconciles a terminal owner result after capture stops", async () => {
  const { h, cancelResult, runResult } = await runCancellationCase();

  assert.equal(cancelResult.terminalState, "FAILED");
  assert.equal(cancelResult.errorCode, "COLLECTION_CANCELLED");
  assert.deepEqual(JSON.parse(JSON.stringify(runResult)), {
    success: false,
    attemptId: ATTEMPT_ID,
    terminalState: "FAILED",
    itemCount: 0,
    errorCode: "COLLECTION_CANCELLED",
    error: "키워드 순위 수집이 취소되었습니다.",
  });
  assert.equal(h.sessionCalls.filter(([name]) => name === "cancel").length, 1);
  assert.deepEqual(h.requests.filter(({ init }) => init.method === "POST").map(({ path }) => path), [
    `${ATTEMPT_PATH}/fail`,
  ]);
});

test("cancellation reports pending when the post-cancel owner read is unavailable", async () => {
  const { h, cancelResult, runResult } = await runCancellationCase({
    ownerReadUnavailableAfterCancel: true,
  });

  assert.equal(cancelResult.terminalState, "FAILED");
  assert.equal(runResult.terminalState, "RUNNING");
  assert.equal(runResult.cancellationPending, true);
  assert.equal(runResult.errorCode, "COLLECTION_CANCELLED");
  assert.equal(h.requests.filter(({ init }) => init.method === "POST").length, 1);
});
