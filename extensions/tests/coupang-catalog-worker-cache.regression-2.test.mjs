import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const extensionRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../kiditem-os',
);
const collectorPath = path.join(extensionRoot, 'shared/coupang-catalog-collector.js');
const serviceWorkerPath = path.join(extensionRoot, 'background/coupang/worker.js');

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
  // 확장 병합 후 importScripts 는 통합 서비스워커가 소유한다. 캐시 무효화용
  // revision 과 도메인 워커의 계약 검사가 어긋나면 낡은 수집기가 실린다.
  const entrySource = fs.readFileSync(
    path.join(extensionRoot, 'background/service-worker.js'),
    'utf8',
  );
  const importRevision = entrySource.match(
    /coupang-catalog-collector\.js\?revision=(\d+)/,
  )?.[1];

  assert.equal(typeof collector.contractRevision, 'number');
  assert.equal(importRevision, String(collector.contractRevision));
  assert.match(
    serviceWorker,
    /KidItemCoupangCatalog\.contractRevision\s*!==\s*COUPANG_CATALOG_CONTRACT_REVISION/,
  );
});
