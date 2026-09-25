import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { MERGED_EXTENSION_VERSION } from '../helpers/domain-worker-modules.mjs';

const manifestUrl = new URL(
  "../../kiditem-os/manifest.json",
  import.meta.url,
);

test("seller catalog collection can inspect Coupang seller shops", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

  assert.equal(manifest.version, MERGED_EXTENSION_VERSION);
  assert.ok(
    manifest.host_permissions.includes("https://shop.coupang.com/*"),
    "shop.coupang.com host permission is required for chrome.scripting.executeScript",
  );
});

test('Wing form image fetch has debugger access and only local/Office storage hosts', async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));

  assert.ok(manifest.permissions.includes('debugger'));
  assert.ok(manifest.host_permissions.includes('http://localhost:9000/*'));
  assert.ok(manifest.host_permissions.includes('http://kiditem-office:9000/*'));
  assert.equal(
    manifest.host_permissions.some((pattern) => pattern === 'https://*.supabase.co/*'),
    false,
  );
});

/**
 * 등록할 상품 사진(대표 · 추가)은 대부분 쿠팡 이미지 CDN 에 있다. 몰 파일 칸에 넣으려면
 * 서비스워커가 그 바이트를 읽어야 하는데, 권한이 없으면 CORS 로 막혀 사진이 통째로 빠진다.
 */
test("mall registration can read product photos from Coupang's image CDN", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

  assert.ok(manifest.host_permissions.includes("https://*.coupangcdn.com/*"));
});

test("web bridge reaches local and Office KidItem origins", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

  const externalMatches = manifest.externally_connectable?.matches ?? [];
  assert.ok(
    externalMatches.includes("http://localhost:3000/*"),
    "localhost web origin must stay externally connectable",
  );
  assert.ok(
    externalMatches.includes("http://kiditem-office/*"),
    "office web origin must be externally connectable",
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
    hostBridge.matches.includes("http://kiditem-office/*"),
    "host-bridge must inject on the office server",
  );
});

/**
 * 매니페스트 `key` 가 확장 ID 를 고정한다(KID-356). 머지 충돌 등으로 `key` 가 빠지거나
 * 바뀌면 모든 운영자의 확장 ID 가 다시 바뀌어 저장된 인증이 사라진다. Chrome 과 같은
 * 방식(공개키 DER 의 SHA-256 앞 32 hex 를 a–p 로)으로 ID 를 계산해 고정값과 대조한다.
 */
test("manifest key pins the KIDITEM OS extension ID", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

  assert.equal(typeof manifest.key, "string");
  const digest = createHash("sha256")
    .update(Buffer.from(manifest.key, "base64"))
    .digest("hex")
    .slice(0, 32);
  const extensionId = [...digest]
    .map((nibble) => String.fromCharCode(97 + parseInt(nibble, 16)))
    .join("");
  assert.equal(extensionId, "jdklckncgmllpabkofllidmoiglbcnpb");
});
