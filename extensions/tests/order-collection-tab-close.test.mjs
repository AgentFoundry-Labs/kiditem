import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

/**
 * 사장님: "수집 끝났으면 창 닫아라". 수집이 끝난 시도가 연 몰 탭은 화면이 닫으라고 말한다.
 * 사람이 열어 둔 탭과 다른 시도의 탭은 건드리지 않는다.
 */
const workerSource = readFileSync(
  new URL("../kiditem-os/background/orders/worker.js", import.meta.url),
  "utf8",
);

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} not found`);
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`${name} closing brace not found`);
}

function load({ removed = [] } = {}) {
  const context = {
    Number,
    Array,
    Set,
    Map,
    chrome: {
      tabs: {
        async remove(tabId) {
          removed.push(tabId);
        },
      },
    },
    openedOrderCollectionTabs: new Map(),
  };
  vm.createContext(context);
  vm.runInContext(extractFunction(workerSource, "rememberOrderCollectionTab"), context);
  vm.runInContext(extractFunction(workerSource, "forgetOrderCollectionTab"), context);
  vm.runInContext(
    extractFunction(workerSource, "closeOrderCollectionTabs").replace(/^function /, "async function "),
    context,
  );
  return context;
}

test("⭐ closes only the tabs this attempt opened", async () => {
  const removed = [];
  const context = load({ removed });
  vm.runInContext("rememberOrderCollectionTab(11, 'attempt-a')", context);
  vm.runInContext("rememberOrderCollectionTab(12, 'attempt-a')", context);
  vm.runInContext("rememberOrderCollectionTab(13, 'attempt-b')", context);

  const result = await vm.runInContext("closeOrderCollectionTabs(['attempt-a'])", context);

  assert.equal(result.closed, 2);
  assert.deepEqual(removed.sort(), [11, 12]);
  // 다른 시도의 탭은 목록에 남는다.
  assert.equal(vm.runInContext("openedOrderCollectionTabs.size", context), 1);
});

test("an empty list closes every tab we opened, and nothing else is tracked", async () => {
  const removed = [];
  const context = load({ removed });
  vm.runInContext("rememberOrderCollectionTab(21, 'attempt-a')", context);
  vm.runInContext("rememberOrderCollectionTab(22, null)", context);

  const result = await vm.runInContext("closeOrderCollectionTabs([])", context);

  assert.equal(result.closed, 2);
  assert.deepEqual(removed.sort(), [21, 22]);
});

test("a tab we already closed is forgotten, so no one closes it twice", async () => {
  const removed = [];
  const context = load({ removed });
  vm.runInContext("rememberOrderCollectionTab(31, 'attempt-a')", context);
  vm.runInContext("forgetOrderCollectionTab(31)", context);

  const result = await vm.runInContext("closeOrderCollectionTabs(['attempt-a'])", context);

  assert.equal(result.closed, 0);
  assert.deepEqual(removed, []);
});

test("the collection tab helpers register and unregister the tabs we open", () => {
  const create = extractFunction(workerSource, "createFreshOrderCollectionTab");
  const close = extractFunction(workerSource, "closeFreshOrderCollectionTab");
  assert.match(create, /rememberOrderCollectionTab\(tab\?\.id, collection\?\.attemptId\)/);
  assert.match(close, /forgetOrderCollectionTab\(tab\.id\)/);
  const ensure = extractFunction(workerSource, "ensureMallLoggedIn");
  assert.match(ensure, /rememberOrderCollectionTab\(tab\.id, collection\?\.attemptId\)/);
});

test("the worker advertises the tab-close capability and validates the request", () => {
  assert.match(workerSource, /orderCollectionTabCloseV1: true/);
  const start = workerSource.indexOf('if (msg?.action === "closeOrderCollectionTabs")');
  assert.notEqual(start, -1);
  const block = workerSource.slice(start, workerSource.indexOf("\n  if (msg?.action ===", start + 1));
  assert.match(block, /typeof id === "string"/);
});
