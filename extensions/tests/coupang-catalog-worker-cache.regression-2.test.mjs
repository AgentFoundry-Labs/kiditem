import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const extensionRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../coupang-ads-scraper',
);
const collectorPath = path.join(extensionRoot, 'shared/coupang-catalog-collector.js');
const serviceWorkerPath = path.join(extensionRoot, 'background/service-worker.js');

function loadCollector() {
  const context = { TextEncoder, URL, crypto };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(collectorPath, 'utf8'), context, {
    filename: collectorPath,
  });
  return context.KidItemCoupangCatalog;
}

// Regression: ISSUE-002 — Chrome kept the old imported collector after an unpacked reload
// Found by /qa on 2026-07-17
// Report: .gstack/qa-reports/qa-report-kiditem-local-2026-07-17.md
test('pins the service worker import cache key to the collector contract revision', () => {
  const collector = loadCollector();
  const serviceWorker = fs.readFileSync(serviceWorkerPath, 'utf8');
  const importRevision = serviceWorker.match(
    /coupang-catalog-collector\.js\?revision=(\d+)/,
  )?.[1];

  assert.equal(typeof collector.contractRevision, 'number');
  assert.equal(importRevision, String(collector.contractRevision));
  assert.match(
    serviceWorker,
    /KidItemCoupangCatalog\.contractRevision\s*!==\s*COUPANG_CATALOG_CONTRACT_REVISION/,
  );
});
