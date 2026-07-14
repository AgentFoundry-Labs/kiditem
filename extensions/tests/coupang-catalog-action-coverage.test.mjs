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

test('service worker exposes the resumable Coupang catalog import actions', () => {
  const worker = fs.readFileSync(workerPath, 'utf8');
  for (const action of [
    'startCoupangCatalogImport',
    'getCoupangCatalogImportStatus',
    'cancelCoupangCatalogImport',
  ]) {
    assert.match(worker, new RegExp(`msg\\.action === ["']${action}["']`));
  }
  assert.match(worker, /coupangCatalogSnapshot:\s*true/);
});

test('runtime uploads all three durable chunk kinds and finalizes through the API', () => {
  const runtime = fs.readFileSync(runtimePath, 'utf8');

  assert.match(runtime, /discovery_page/);
  assert.match(runtime, /product_details/);
  assert.match(runtime, /manifest_confirmation/);
  assert.match(runtime, /\/finalize/);
  assert.match(runtime, /chrome\.alarms\.create/);
});
