import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const source = fs.readFileSync(
  path.join(repoRoot, "extensions/kiditem-os/content/coupang/wing-unified.js"),
  "utf8",
);

test("Wing pages do not auto-collect or self-close legacy batch tabs", () => {
  assert.doesNotMatch(source, /waitAndSync|syncSalesAnalysisWithRetry|kiditemBatch/);
  assert.doesNotMatch(source, /action:\s*["']reportBatchScrapeDone["']/);
  assert.doesNotMatch(source, /setTimeout\(\(\)\s*=>\s*\{\s*(?:batchSyncWithRetry|waitAndSync)/);
});

test("generic Wing dashboard cards are not collected — itemwinner moved to the operation kind (KID-362)", async () => {
  let listener = null;
  let syncMessages = 0;
  class FakeMutationObserver {
    observe() {}
    disconnect() {}
  }
  const location = {
    href: "https://wing.coupang.com/",
    pathname: "/",
    search: "",
    hash: "",
  };
  const context = vm.createContext({
    chrome: {
      runtime: {
        lastError: null,
        onMessage: {
          addListener(nextListener) {
            listener = nextListener;
          },
        },
        sendMessage(message) {
          if (message?.action === "syncToServer") syncMessages += 1;
        },
      },
      storage: { local: { set() {} } },
    },
    console,
    document: {
      addEventListener() {},
      body: {},
      querySelector() {
        return null;
      },
      querySelectorAll(selector) {
        if (selector.includes("dashboard-card")) {
          return [
            {
              querySelector(innerSelector) {
                if (innerSelector.includes("title")) return { innerText: "무료노출 프로모션" };
                if (innerSelector.includes("count")) return { innerText: "0" };
                return null;
              },
            },
          ];
        }
        return [];
      },
      title: "Wing",
      visibilityState: "visible",
    },
    location,
    MutationObserver: FakeMutationObserver,
    URLSearchParams,
    setTimeout() {
      return 0;
    },
    clearTimeout() {},
    showBadge() {},
  });
  context.window = context;
  context.window.location = location;
  vm.runInContext(source, context, { filename: "wing-unified.js" });

  assert.equal(typeof listener, "function");
  const result = await new Promise((resolve) => {
    assert.equal(listener({ action: "manualSync" }, {}, resolve), true);
  });

  assert.equal(result.success, false);
  assert.match(result.error, /매출분석 페이지가 아닙니다/);
  assert.equal(syncMessages, 0);
});
