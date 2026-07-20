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
  path.join(repoRoot, "extensions/coupang-ads-scraper/content/wing-unified.js"),
  "utf8",
);

test("generic Wing dashboard cards cannot be saved as item-winner evidence", async () => {
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
  assert.match(result.error, /아이템위너 페이지가 아닙니다/);
  assert.equal(syncMessages, 0);
});
