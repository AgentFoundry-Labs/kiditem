import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL(
    "../../kiditem-os/background/coupang/worker.js",
    import.meta.url,
  ),
  "utf8",
);

test("seller identity collection renders selected product details before DOM extraction", () => {
  assert.match(
    source,
    /updateTabAndWait\(tabId, target\.link/,
    "selected product detail pages must be rendered before seller extraction",
  );
  assert.match(source, /executeCoupangSellerDetailExtraction\(tabId\)/);
});
