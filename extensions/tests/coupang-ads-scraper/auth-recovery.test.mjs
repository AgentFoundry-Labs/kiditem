import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL(
    "../../coupang-ads-scraper/background/kiditem-auth.js",
    import.meta.url,
  ),
  "utf8",
);

function createHarness({ initialToken = "current-token", responses = [200] } = {}) {
  const storage = { kiditem_auth_token: initialToken };
  const storageListeners = [];
  const fetchCalls = [];
  const scriptCalls = [];

  const chrome = {
    storage: {
      local: {
        get: (_keys, callback) => callback({ ...storage }),
        set: (next, callback) => {
          const changes = Object.fromEntries(
            Object.entries(next).map(([key, value]) => [
              key,
              { oldValue: storage[key], newValue: value },
            ]),
          );
          Object.assign(storage, next);
          for (const listener of storageListeners) listener(changes, "local");
          callback?.();
        },
      },
      onChanged: {
        addListener: (listener) => storageListeners.push(listener),
        removeListener: (listener) => {
          const index = storageListeners.indexOf(listener);
          if (index >= 0) storageListeners.splice(index, 1);
        },
      },
    },
    tabs: {
      query: async () => [{ id: 41, url: "http://localhost:3000/dashboard" }],
    },
    scripting: {
      executeScript: async (details) => {
        scriptCalls.push(details);
        return [];
      },
    },
  };

  const responseQueue = [...responses];
  const fetchFn = async (url, init) => {
    fetchCalls.push({ url, init });
    const status = responseQueue.shift() ?? 200;
    return { ok: status >= 200 && status < 300, status };
  };

  const context = vm.createContext({
    AbortController,
    Headers,
    clearTimeout,
    console,
    setTimeout,
  });
  vm.runInContext(source, context);
  const auth = context.KidItemAuth.create({
    chrome,
    fetchFn,
    apiUrl: "http://localhost:4000",
    tokenKey: "kiditem_auth_token",
    webUrlPatterns: ["http://localhost:3000/*"],
    requestTimeoutMs: 25_000,
    authRefreshTimeoutMs: 20,
  });

  return { auth, chrome, fetchCalls, scriptCalls, storage };
}

async function waitForCalls(calls, count) {
  const deadline = Date.now() + 1_000;
  while (calls.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.equal(calls.length, count);
}

test("sends the current Supabase access token as bearer auth", async () => {
  const harness = createHarness();

  const response = await harness.auth.authedFetch("/api/ads/scrape-targets");

  assert.equal(response.status, 200);
  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(
    new Headers(harness.fetchCalls[0].init.headers).get("authorization"),
    "Bearer current-token",
  );
});

test("requests web refresh and retries once with a changed token after 401", async () => {
  const harness = createHarness({ responses: [401, 200] });

  const pending = harness.auth.authedFetch("/api/ads/scrape-targets");
  await waitForCalls(harness.fetchCalls, 1);
  harness.chrome.storage.local.set({ kiditem_auth_token: "rotated-token" });
  const response = await pending;

  assert.equal(response.status, 200);
  assert.equal(harness.fetchCalls.length, 2);
  assert.equal(
    new Headers(harness.fetchCalls[1].init.headers).get("authorization"),
    "Bearer rotated-token",
  );
  assert.equal(harness.scriptCalls.length, 1);
  assert.deepEqual(Array.from(harness.scriptCalls[0].args), [
    "kiditem:extension-auth-required",
  ]);
  assert.equal(
    harness.scriptCalls[0].args.includes("current-token"),
    false,
    "the page event must never carry an auth token",
  );
});

test("does not recurse when the single retry also returns 401", async () => {
  const harness = createHarness({ responses: [401, 401, 200] });

  const pending = harness.auth.authedFetch("/api/ads/scrape-targets");
  await waitForCalls(harness.fetchCalls, 1);
  harness.chrome.storage.local.set({ kiditem_auth_token: "rotated-token" });
  const response = await pending;

  assert.equal(response.status, 401);
  assert.equal(harness.fetchCalls.length, 2);
  assert.equal(harness.scriptCalls.length, 1);
});

test("coalesces concurrent 401 refresh requests", async () => {
  const harness = createHarness({ responses: [401, 401, 200, 200] });

  const first = harness.auth.authedFetch("/api/ads/scrape-targets");
  const second = harness.auth.authedFetch("/api/ads/actions");
  await waitForCalls(harness.fetchCalls, 2);
  harness.chrome.storage.local.set({ kiditem_auth_token: "rotated-token" });
  const responses = await Promise.all([first, second]);

  assert.deepEqual(
    responses.map((response) => response.status),
    [200, 200],
  );
  assert.equal(harness.fetchCalls.length, 4);
  assert.equal(harness.scriptCalls.length, 1);
});

test("returns the original 401 when no changed token arrives", async () => {
  const harness = createHarness({ responses: [401, 200] });

  const response = await harness.auth.authedFetch("/api/ads/scrape-targets");

  assert.equal(response.status, 401);
  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(harness.scriptCalls.length, 1);
});

test("recovers a missing extension token from the logged-in web tab", async () => {
  const harness = createHarness({ initialToken: null, responses: [401, 200] });

  const pending = harness.auth.authedFetch("/api/ads/scrape-targets");
  await waitForCalls(harness.fetchCalls, 1);
  harness.chrome.storage.local.set({ kiditem_auth_token: "restored-token" });
  const response = await pending;

  assert.equal(response.status, 200);
  assert.equal(harness.fetchCalls.length, 2);
  assert.equal(
    new Headers(harness.fetchCalls[1].init.headers).get("authorization"),
    "Bearer restored-token",
  );
});
