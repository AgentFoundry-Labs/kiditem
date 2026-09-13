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

const attemptId = "11111111-1111-4111-8111-111111111111";
const attemptToken = "22222222-2222-4222-8222-222222222222";
const expiresAt = "2099-01-01T00:00:00.000Z";

test("keyword rank stops a normal terminal retry after the owner session fence is lost", async () => {
  const calls = [];
  let active = false;
  const context = vm.createContext({ Date, Promise, Set, String, Error });
  vm.runInContext(wireSource, context);
  vm.runInContext(ownerSource, context);

  const owner = context.KidItemKeywordRankSourceOwner.create({
    kind: "wing",
    chrome: { storage: { local: {} } },
    sessions: {
      async getOwned(runId) {
        return active ? { attemptId: runId, producer: "advertising.wing_rank" } : null;
      },
      async isActive() { return active; },
      async start() { active = true; },
      async cancel() { active = false; },
      async requireAttention() {},
    },
    request: async (_environmentId, path, init) => {
      calls.push({ path, init });
      if (init.method === "GET") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            attemptId,
            attemptToken,
            state: "RUNNING",
            expiresAt,
            plan: {
              sourceType: "coupang_wing_rank",
              parserVersion: "wing-rank-v1",
              keyword: "블록",
              maxPages: 1,
            },
          }),
        };
      }
      assert.equal(init.method, "PUT");
      active = false;
      return {
        ok: false,
        status: 503,
        json: async () => ({ message: "owner temporarily unavailable" }),
      };
    },
    collect: async () => ({
      success: true,
      pagesScanned: 1,
      items: [],
      collectedCount: 0,
      totalResults: 0,
      proof: { maxPages: 1, pages: [1], stopReason: "empty_page" },
    }),
  });

  const result = await owner.run({ environmentId: "local", attemptId });

  assert.equal(result.terminalState, "RUNNING");
  assert.equal(result.cancellationPending, true);
  assert.equal(calls.filter(({ init }) => init.method === "PUT").length, 1);
  assert.equal(calls.some(({ path }) => path.endsWith("/fail")), false);
});
