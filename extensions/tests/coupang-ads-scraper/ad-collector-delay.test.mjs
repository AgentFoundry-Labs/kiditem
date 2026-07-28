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
const delaySource = fs.readFileSync(
  path.join(
    repoRoot,
    "extensions/coupang-ads-scraper/background/ad-collector-delay.js",
  ),
  "utf8",
);
const serviceWorkerSource = fs.readFileSync(
  path.join(
    repoRoot,
    "extensions/coupang-ads-scraper/background/service-worker.js",
  ),
  "utf8",
);

function loadDelayContract() {
  const scheduled = [];
  const context = vm.createContext({
    setTimeout(callback, milliseconds) {
      scheduled.push({ callback, milliseconds });
      return scheduled.length;
    },
  });
  context.globalThis = context;
  vm.runInContext(delaySource, context, { filename: "ad-collector-delay.js" });
  return { contract: context.KidItemAdCollectorDelay, scheduled };
}

test("advertising collector delay is handled by the extension worker with a hard cap", () => {
  const { contract, scheduled } = loadDelayContract();
  const responses = [];

  assert.equal(
    contract.handleMessage(
      { action: "waitForAdCollectorDelay", milliseconds: 60_000 },
      {},
      (response) => responses.push(response),
    ),
    true,
  );
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].milliseconds, 5_000);
  assert.deepEqual(responses, []);

  scheduled[0].callback();
  assert.deepEqual(
    JSON.parse(JSON.stringify(responses)),
    [{ success: true, milliseconds: 5_000 }],
  );
});

test("advertising collector delay ignores unrelated messages", () => {
  const { contract, scheduled } = loadDelayContract();
  assert.equal(contract.handleMessage({ action: "other" }, {}, () => {}), false);
  assert.equal(scheduled.length, 0);
});

test("service worker loads and registers the advertising collector delay handler", () => {
  assert.match(serviceWorkerSource, /"ad-collector-delay\.js"/);
  assert.match(
    serviceWorkerSource,
    /chrome\.runtime\.onMessage\.addListener\(KidItemAdCollectorDelay\.handleMessage\)/,
  );
});
