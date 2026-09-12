import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const sourcePath = path.join(
  repoRoot,
  "extensions/kiditem-os/background/coupang/coupang-keyword-suggestion-collector.js",
);

function load(page = {}) {
  const context = vm.createContext({
    URL,
    URLSearchParams,
    Date,
    Error,
    Map,
    Number,
    Object,
    Promise,
    Set,
    String,
    console,
    clearTimeout,
    setTimeout,
    document: page.document,
    fetch: page.fetch,
    location: { origin: "https://www.coupang.com" },
  });
  vm.runInContext(fs.readFileSync(sourcePath, "utf8"), context, {
    filename: sourcePath,
  });
  return context.KidItemCoupangKeywordSuggestionCollector;
}

function harness({ loadedUrl = null, owned = true, producer = "sourcing.keyword_suggestion", attached = owned, bindError = null, page = {} } = {}) {
  const calls = [];
  const sessions = {
    async getOwned() {
      calls.push(["owned"]);
      return owned ? { attemptId: "attempt", producer } : null;
    },
    async attachTab(attemptId, value) {
      calls.push(["attach", attemptId, value]);
      return attached ? { attemptId } : null;
    },
  };
  const chrome = {
    tabs: {
      remove(tabId, callback) {
        calls.push(["remove", tabId]);
        callback?.();
        return Promise.resolve();
      },
    },
    scripting: {
      async executeScript(input) {
        calls.push(["execute", input.target, input.args]);
        const result = await input.func(...input.args);
        return [{ result }];
      },
    },
  };
  const collector = load(page).create({
    chrome,
    sessions,
    createTab: async (value) => {
      calls.push(["create", value]);
      return { id: 41, windowId: 7 };
    },
    bindTab: async (...value) => {
      calls.push(["bind", ...value]);
      if (bindError) throw bindError;
    },
    waitForTabComplete: async (tabId, value) => {
      calls.push(["wait", tabId, value]);
      return { id: tabId, url: loadedUrl || value.expectedUrl, status: "complete" };
    },
    attention: async (...value) => {
      calls.push(["attention", ...value]);
      return { success: false, attentionRequired: true, tabId: value[1], runId: value[0] };
    },
    delay: async (value) => calls.push(["delay", value]),
  });
  return { collector, calls };
}

function pageFixture() {
  const related = {
    textContent: "A Toy",
    getAttribute(name) {
      return name === "href" ? "/np/search?q=A%20Toy" : null;
    },
  };
  const product = { textContent: "A Toy Pencil 2개" };
  return {
    document: {
      querySelectorAll(selector) {
        return selector.includes("/np/search") || selector.includes("q=")
          ? [related]
          : [product];
      },
    },
    fetch: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify({ suggestions: ["Ａ Toy", "검색"] }),
    }),
  };
}

test("keyword suggestion collector owns the public-search tab before waiting and preserves capture output", async () => {
  const fake = harness({ page: pageFixture() });
  const result = await fake.collector.collect({
    keyword: "A Pencil",
    maxResults: 2,
    runId: "attempt",
    environmentId: "office",
  });

  assert.equal(result.success, true);
  assert.equal(result.keyword, "A Pencil");
  assert.equal(result.warnings.length, 0);
  const createIndex = fake.calls.findIndex(([name]) => name === "create");
  const bindIndex = fake.calls.findIndex(([name]) => name === "bind");
  const attachIndex = fake.calls.findIndex(([name]) => name === "attach");
  const waitIndex = fake.calls.findIndex(([name]) => name === "wait");
  assert.deepEqual(fake.calls.slice(0, createIndex + 1).map(([name]) => name), ["owned", "create"]);
  assert.equal(fake.calls.some(([name]) => name === "start"), false);
  assert.ok(createIndex < bindIndex && bindIndex < attachIndex && attachIndex < waitIndex);
  assert.equal(fake.calls.find(([name]) => name === "create")[1].active, false);
  assert.equal(
    fake.calls.find(([name]) => name === "create")[1].url,
    "https://www.coupang.com/np/search?component=&q=A%20Pencil&channel=user",
  );
  assert.deepEqual(JSON.parse(JSON.stringify(fake.calls.find(([name]) => name === "attach")[2])), {
    tabId: 41,
    windowId: 7,
    closeOnCancel: true,
  });
  assert.equal(fake.calls.find(([name]) => name === "delay")[1], 1500);
  assert.equal(fake.calls.some(([name]) => name === "execute"), true);
});

test("keyword suggestion collector keeps autocomplete warnings and routes a non-search page to attention", async () => {
  const warningPage = {
    document: { querySelectorAll: () => [] },
    fetch: async () => ({
      ok: false,
      status: 429,
      headers: { get: () => "application/json" },
      text: async () => "{}",
    }),
  };
  const warning = harness({ page: warningPage });
  const capturedWarnings = await warning.collector.collect({
    keyword: "A Pencil",
    maxResults: 2,
    runId: "attempt",
    environmentId: "office",
  });
  assert.deepEqual(Array.from(capturedWarnings.warnings), ["쿠팡 자동완성 호출 실패 (429)"]);

  const attention = harness({
    loadedUrl: "https://www.coupang.com/login",
    page: pageFixture(),
  });
  const result = await attention.collector.collect({
    keyword: "A Pencil",
    maxResults: 2,
    runId: "attempt",
    environmentId: "office",
  });
  assert.equal(result.attentionRequired, true);
  assert.equal(attention.calls.some(([name]) => name === "execute"), false);
});

test("keyword suggestion collector stops before extraction after cancellation", async () => {
  const fake = harness({ owned: false, page: pageFixture() });
  const result = await fake.collector.collect({
    keyword: "A Pencil",
    maxResults: 2,
    runId: "attempt",
    environmentId: "office",
  });
  assert.equal(result.cancelled, true);
  assert.equal(fake.calls.some(([name]) => name === "create"), false);
  assert.equal(fake.calls.some(([name]) => name === "execute"), false);
});

test("keyword suggestion collector closes a newly-created tab when attachment is lost", async () => {
  const fake = harness({ attached: false, page: pageFixture() });
  const result = await fake.collector.collect({
    keyword: "A Pencil",
    maxResults: 2,
    runId: "attempt",
    environmentId: "office",
  });
  assert.equal(result.success, false);
  assert.equal(result.cancelled, undefined);
  assert.deepEqual(fake.calls.filter(([name]) => name === "remove"), [["remove", 41]]);
  assert.equal(fake.calls.some(([name]) => name === "wait"), false);
});

test("keyword suggestion collector rejects an unowned producer before creating a tab", async () => {
  const fake = harness({
    page: pageFixture(),
    producer: "sourcing.other",
  });
  const result = await fake.collector.collect({
    keyword: "A Pencil",
    maxResults: 2,
    runId: "attempt",
    environmentId: "office",
  });
  assert.equal(result.cancelled, true);
  assert.equal(fake.calls.some(([name]) => name === "create"), false);
});

test("keyword suggestion page does not publish empty results from access-denied or HTML responses", async () => {
  const cases = [
    {
      name: "403",
      page: {
        document: { querySelectorAll: () => [] },
        fetch: async () => ({
          ok: false,
          status: 403,
          headers: { get: () => "application/json" },
          text: async () => JSON.stringify({ error: "Access Denied" }),
        }),
      },
    },
    {
      name: "plain HTML",
      page: {
        document: { querySelectorAll: () => [] },
        fetch: async () => ({
          ok: true,
          status: 200,
          headers: { get: () => "text/html" },
          text: async () => "<html><body>Access Denied</body></html>",
        }),
      },
    },
    {
      name: "error envelope",
      page: {
        document: { querySelectorAll: () => [] },
        fetch: async () => ({
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          text: async () => JSON.stringify({ success: false, error: "unauthorized" }),
        }),
      },
    },
    {
      name: "unrelated structured object",
      page: {
        document: { querySelectorAll: () => [] },
        fetch: async () => ({
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          text: async () => JSON.stringify({ status: "pending" }),
        }),
      },
    },
    {
      name: "empty object",
      page: {
        document: { querySelectorAll: () => [] },
        fetch: async () => ({
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          text: async () => JSON.stringify({}),
        }),
      },
    },
    {
      name: "no DOM",
      page: {
        document: undefined,
        fetch: async () => ({
          ok: true,
          status: 200,
          headers: { get: () => "text/plain" },
          text: async () => "not-json",
        }),
      },
    },
  ];
  for (const fixture of cases) {
    const result = await harness({ page: fixture.page }).collector.collect({
      keyword: "A Pencil",
      maxResults: 2,
      runId: "attempt",
      environmentId: "office",
    });
    assert.equal(result.success, false, fixture.name);
    assert.equal(result.total, undefined, fixture.name);
  }
});

test("keyword suggestion page accepts a valid empty structured JSON response", async () => {
  const result = await harness({
    page: {
      document: { querySelectorAll: () => [] },
      fetch: async () => ({
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        text: async () => JSON.stringify({ suggestions: [] }),
      }),
    },
  }).collector.collect({
    keyword: "A Pencil",
    maxResults: 2,
    runId: "attempt",
    environmentId: "office",
  });
  assert.equal(result.success, true);
  assert.deepEqual(Array.from(result.items), []);
  assert.deepEqual(Array.from(result.productNameTokens), []);
});
