import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const extensionRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../kiditem-os',
);

const workerPath = path.join(extensionRoot, 'background/coupang/worker.js');
const runtimePath = path.join(extensionRoot, 'background/coupang/coupang-catalog-import.js');
const inventoryContentPath = path.join(
  extensionRoot,
  'content/coupang/wing-inventory-scraper.js',
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
  assert.match(runtime, /chrome\.alarms\.create/);
});

test('catalog steps use the shared finite keepalive through environment dependencies', () => {
  const runtime = fs.readFileSync(runtimePath, 'utf8');
  const worker = fs.readFileSync(workerPath, 'utf8');
  const factoryStart = worker.indexOf('function coupangCatalogImportDependencies');
  const factoryEnd = worker.indexOf('function coupangReviewCollectorDependencies', factoryStart);
  assert.ok(factoryStart >= 0);
  assert.ok(factoryEnd > factoryStart);
  const dependenciesFactory = worker.slice(factoryStart, factoryEnd);

  assert.match(runtime, /dependencies\.keepAlive/);
  assert.match(dependenciesFactory, /keepAlive:\s*\(operation\)\s*=>\s*KidItemWorkerKeepAlive\.during\(operation\)/);
});

test('catalog login retains explicit attention without a legacy session terminal API', () => {
  const runtime = fs.readFileSync(runtimePath, 'utf8');

  assert.match(runtime, /collectionSessions\.attachTab/);
  assert.match(runtime, /collectionSessions\.requireAttention/);
  assert.match(runtime, /await clearAlarm\(dependencies\)/);
  assert.doesNotMatch(runtime, /collectionSessions\.(succeed|fail|restart)\(/);
  assert.doesNotMatch(runtime, /\bactivateTab\s*\(/);
  assert.doesNotMatch(runtime, /active:\s*true/);
  assert.doesNotMatch(runtime, /focused:\s*true/);
});
