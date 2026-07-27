import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const manifestUrl = new URL(
  "../../coupang-ads-scraper/manifest.json",
  import.meta.url,
);

test("seller catalog collection can inspect Coupang seller shops", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

  assert.equal(manifest.version, "1.2.97");
  assert.ok(
    manifest.host_permissions.includes("https://shop.coupang.com/*"),
    "shop.coupang.com host permission is required for chrome.scripting.executeScript",
  );
});

test('client detail renderer has debugger access and only the committed upload hosts', async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));

  assert.ok(manifest.permissions.includes('debugger'));
  assert.ok(manifest.host_permissions.includes('http://localhost:9000/*'));
  assert.ok(
    manifest.host_permissions.includes(
      'https://gheoobctiarluauprvro.storage.supabase.co/*',
    ),
  );
  assert.equal(
    manifest.host_permissions.some((pattern) => pattern === 'https://*.supabase.co/*'),
    false,
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
