import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const manifestUrl = new URL(
  "../../coupang-ads-scraper/manifest.json",
  import.meta.url,
);

test("seller catalog collection can inspect Coupang seller shops", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

  assert.equal(manifest.version, "1.2.83");
  assert.ok(
    manifest.host_permissions.includes("https://shop.coupang.com/*"),
    "shop.coupang.com host permission is required for chrome.scripting.executeScript",
  );
});

test("web bridge reaches both localhost and the staging KidItem origin", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

  const externalMatches = manifest.externally_connectable?.matches ?? [];
  assert.ok(
    externalMatches.includes("http://localhost:3000/*"),
    "localhost web origin must stay externally connectable",
  );
  assert.ok(
    externalMatches.includes("https://staging.merchon.org/*"),
    "staging web origin must be externally connectable for chrome.runtime.sendMessage",
  );

  const hostBridge = (manifest.content_scripts ?? []).find((entry) =>
    (entry.js ?? []).includes("content/host-bridge.js"),
  );
  assert.ok(hostBridge, "host-bridge content script must be declared");
  assert.ok(
    hostBridge.matches.includes("http://localhost:3000/*"),
    "host-bridge must inject on localhost for extension-id discovery",
  );
  assert.ok(
    hostBridge.matches.includes("https://staging.merchon.org/*"),
    "host-bridge must inject on staging so the web app can discover the extension id",
  );
});
