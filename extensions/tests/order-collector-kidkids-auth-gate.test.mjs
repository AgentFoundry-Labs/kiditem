import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const source = fs.readFileSync(
  path.join(repoRoot, "extensions/order-collector/background/service-worker.js"),
  "utf8",
);

function loadScraper({ pageUrl, responseUrl }) {
  const start = source.indexOf("async function scrapeKidkidsOrders(dateFilter)");
  const end = source.indexOf(
    "// ── 도매꾹(domeggook) 주문 수집",
    start,
  );
  assert.ok(start >= 0 && end > start, "Kidkids scraper source must exist");

  const emptyDocument = {
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  const context = vm.createContext({
    DOMParser: class {
      parseFromString() {
        return emptyDocument;
      }
    },
    TextDecoder: class {
      decode() {
        return "<html></html>";
      }
    },
    URLSearchParams,
    fetch: async () => ({
      url: responseUrl,
      async arrayBuffer() {
        return new ArrayBuffer(0);
      },
    }),
    window: {
      location: { href: pageUrl },
    },
  });
  vm.runInContext(
    `${source.slice(start, end)}\nthis.scrapeKidkidsOrders = scrapeKidkidsOrders;`,
    context,
  );
  return context.scrapeKidkidsOrders;
}

test("Kidkids security verification requires operator login instead of returning zero orders", async () => {
  const scrapeKidkidsOrders = loadScraper({
    pageUrl:
      "https://partner.kidkids.net/new/pages/security/verify_user.htm",
    responseUrl:
      "https://partner.kidkids.net/logis/logis_index.htm?from_logis_index=Y",
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(await scrapeKidkidsOrders("2026-07-28"))),
    { success: false, loginRequired: true },
  );
});

test("Kidkids authenticated empty order list remains a successful zero-order result", async () => {
  const scrapeKidkidsOrders = loadScraper({
    pageUrl:
      "https://partner.kidkids.net/new/pages/logis/management.htm",
    responseUrl:
      "https://partner.kidkids.net/logis/logis_index.htm?from_logis_index=Y",
  });

  assert.deepEqual(
    JSON.parse(JSON.stringify(await scrapeKidkidsOrders("2026-07-28"))),
    { success: true, orders: [], count: 0 },
  );
});
