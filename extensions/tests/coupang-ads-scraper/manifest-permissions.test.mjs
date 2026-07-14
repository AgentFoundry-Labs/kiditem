import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const manifestUrl = new URL(
  "../../coupang-ads-scraper/manifest.json",
  import.meta.url,
);

test("seller catalog collection can inspect Coupang seller shops", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

  assert.equal(manifest.version, "1.2.32");
  assert.ok(
    manifest.host_permissions.includes("https://shop.coupang.com/*"),
    "shop.coupang.com host permission is required for chrome.scripting.executeScript",
  );
});
