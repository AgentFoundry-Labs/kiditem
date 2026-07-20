import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const extensionRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../coupang-ads-scraper',
);

const workerPath = path.join(extensionRoot, 'background/service-worker.js');
const runtimePath = path.join(extensionRoot, 'background/coupang-catalog-import.js');
const inventoryContentPath = path.join(
  extensionRoot,
  'content/wing-inventory-scraper.js',
);

test('service worker exposes the resumable Coupang catalog import actions', () => {
  const worker = fs.readFileSync(workerPath, 'utf8');
  const inventoryContent = fs.readFileSync(inventoryContentPath, 'utf8');
  for (const action of [
    'startCoupangCatalogImport',
    'getCoupangCatalogImportStatus',
    'cancelCoupangCatalogImport',
    'registerWingThumbnail',
  ]) {
    assert.match(worker, new RegExp(`msg\\.action === ["']${action}["']`));
  }
  assert.match(worker, /coupangCatalogSnapshot:\s*true/);
  assert.match(worker, /browserCollectionSessions:\s*true/);
  assert.match(inventoryContent, /collectCoupangCatalogDiscoveryPage/);
});

test('retired standalone Wing image-row sync actions stay removed', () => {
  const worker = fs.readFileSync(workerPath, 'utf8');
  const inventoryContent = fs.readFileSync(inventoryContentPath, 'utf8');

  for (const retiredAction of [
    'scrapeCoupangImageRows',
    'getCoupangImageRowsStatus',
    'cancelCoupangImageRows',
  ]) {
    assert.doesNotMatch(worker, new RegExp(retiredAction));
  }
  assert.doesNotMatch(worker, /kiditem_image_sync_/);
  assert.doesNotMatch(worker, /coupangImageRows/);
  assert.doesNotMatch(inventoryContent, /scrapeInventoryImagePage/);
  assert.doesNotMatch(inventoryContent, /parseImageRows/);
});

test('runtime uploads all three durable chunk kinds and finalizes through the API', () => {
  const runtime = fs.readFileSync(runtimePath, 'utf8');

  assert.match(runtime, /discovery_page/);
  assert.match(runtime, /product_details/);
  assert.match(runtime, /manifest_confirmation/);
  assert.match(runtime, /\/finalize/);
  assert.match(runtime, /chrome\.alarms\.create/);
});

test('catalog login pauses its browser session and clears the alarm', () => {
  const runtime = fs.readFileSync(runtimePath, 'utf8');

  assert.match(runtime, /collectionSessions\.attachTab/);
  assert.match(runtime, /collectionSessions\.requireAttention/);
  assert.match(runtime, /status:\s*["']attention_required["']/);
  assert.match(runtime, /await clearAlarm\(\)/);
  assert.match(runtime, /async function restart\(/);
  assert.doesNotMatch(runtime, /\bactivateTab\s*\(/);
  assert.doesNotMatch(runtime, /active:\s*true/);
  assert.doesNotMatch(runtime, /focused:\s*true/);
});

test('an already-completed catalog run closes its collection session immediately', () => {
  const runtime = fs.readFileSync(runtimePath, 'utf8');

  assert.match(runtime, /if \(state\.status === ["']done["']\) \{/);
  assert.match(runtime, /collectionSessions\.succeed\(runId\)/);
  assert.match(runtime, /if \(restarted\.status === ["']done["']\) \{/);
  assert.match(runtime, /collectionSessions\.succeed\(restarted\.runId\)/);
});
