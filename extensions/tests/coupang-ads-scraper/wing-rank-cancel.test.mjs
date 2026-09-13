import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(
  new URL(
    "../../kiditem-os/background/coupang/worker.js",
    import.meta.url,
  ),
  "utf8",
);
const keywordCollectorSource = await readFile(
  new URL(
    "../../kiditem-os/background/coupang/coupang-keyword-suggestion-collector.js",
    import.meta.url,
  ),
  "utf8",
);

function functionSource(name, nextName) {
  const start = source.indexOf(`async function ${name}`);
  const end = source.indexOf(`async function ${nextName}`, start + 1);
  assert.ok(start >= 0, `${name} must exist`);
  assert.ok(end > start, `${nextName} must follow ${name}`);
  return source.slice(start, end);
}

test("Wing rank keeps caller-level whole-search retry around the Wing collector seam", () => {
  assert.match(source, /search = await wingSearchCollector\.collect\(/);
  assert.match(source, /for \(let attempt = 1; attempt <= 2; attempt\+\+\)/);
  assert.match(source, /if \(search\?\.attentionRequired \|\| search\?\.cancelled\) return search/);
  assert.match(source, /if \(!search\?\.success\) throw new Error/);
});

test("keyword suggestions retain the initial page-render delay", async () => {
  const context = vm.createContext({
    console,
    Date,
    Error,
    Map,
    Number,
    Object,
    Promise,
    Set,
    String,
    URL,
    URLSearchParams,
  });
  vm.runInContext(keywordCollectorSource, context, {
    filename: "coupang-keyword-suggestion-collector.js",
  });
  const delays = [];
  const collector = context.KidItemCoupangKeywordSuggestionCollector.create({
    chrome: {
      tabs: { remove: async () => undefined },
      scripting: {
        async executeScript() {
          return [{ result: { success: true, items: [], productNameTokens: [], warnings: [] } }];
        },
      },
    },
    sessions: {
      async getOwned() {
        return { producer: "sourcing.keyword_suggestion" };
      },
      async attachTab() {
        return { attemptId: "attempt" };
      },
    },
    createTab: async () => ({ id: 7, windowId: 8 }),
    bindTab: async () => undefined,
    waitForTabComplete: async (_tabId, options) => ({ url: options.expectedUrl, status: "complete" }),
    attention: async () => ({ success: false, attentionRequired: true }),
    delay: async (milliseconds) => delays.push(milliseconds),
  });
  const result = await collector.collect({
    keyword: "pencil",
    maxResults: 2,
    runId: "attempt",
    environmentId: "office",
  });
  assert.equal(result.success, true);
  assert.deepEqual(delays, [1500]);
});
