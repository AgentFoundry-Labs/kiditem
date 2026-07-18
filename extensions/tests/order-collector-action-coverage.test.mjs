import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const routeRoot = path.join(repoRoot, 'apps/web/src/app/(orders)/order-collection');
const workerPath = path.join(
  repoRoot,
  'extensions/order-collector/background/service-worker.js',
);
const manifestPath = path.join(repoRoot, 'extensions/order-collector/manifest.json');
const rocketCollectionPath = path.join(
  repoRoot,
  'extensions/order-collector/background/rocket-po-collection.js',
);
const coupangPoSessionPath = path.join(
  repoRoot,
  'extensions/order-collector/background/coupang-po-session.js',
);
const webAppRoot = path.join(repoRoot, 'apps/web/src/app');
const automaticCollectors = [
  'collectSellpiaDeliTracking',
  'collectIcecreamMallOrders',
  'collectRocketPoRows',
  'listRocketPos',
  'collectKidsnoteOrders',
  'collectKkomangseOrders',
  'collectOnchannelOrders',
  'collectDomeggookOrders',
  'collectKidkidsOrders',
  'collectLotteonOrders',
  'collectGsshopOrders',
  'collectAlwayzOrders',
  'collectKakaoOrders',
  'collectBoriboriOrders',
  'collectTeachervilleOrders',
  'collectArt09Orders',
  'collectCoupangDirectOrders',
];
const runDateActions = new Set([
  'collectKkomangseOrders',
  'collectKidkidsOrders',
  'collectLotteonOrders',
  'collectGsshopOrders',
  'collectAlwayzOrders',
  'collectKakaoOrders',
  'collectBoriboriOrders',
  'collectTeachervilleOrders',
  'collectArt09Orders',
  'collectCoupangDirectOrders',
]);

function sourceFilesUnder(directory) {
  return readdirSync(directory).flatMap((name) => {
    const entry = path.join(directory, name);
    if (statSync(entry).isDirectory()) return sourceFilesUnder(entry);
    return /\.(ts|tsx)$/.test(name) ? [entry] : [];
  });
}

test('order-collection route actions are handled by the extension worker', () => {
  const requestedActions = new Set();
  for (const file of sourceFilesUnder(routeRoot)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/action:\s*['"]([^'"]+)['"]/g)) {
      requestedActions.add(match[1]);
    }
  }

  const worker = readFileSync(workerPath, 'utf8');
  const handledActions = new Set(
    [...worker.matchAll(/msg\?\.action\s*===\s*['"]([^'"]+)['"]/g)].map(
      (match) => match[1],
    ),
  );
  const missingActions = [...requestedActions].filter(
    (action) => !handledActions.has(action),
  );

  assert.deepEqual(missingActions, []);
});

test('order collector manifest grants the exact Kakao seller host', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  assert.ok(manifest.host_permissions.includes('https://shopping-seller.kakao.com/*'));
});

test('every automatic collector explicitly attaches its inactive tab to its own run', () => {
  const worker = readFileSync(workerPath, 'utf8');
  const rocketCollection = readFileSync(rocketCollectionPath, 'utf8');
  const coupangPoSession = readFileSync(coupangPoSessionPath, 'utf8');
  for (const collector of automaticCollectors) {
    const start = worker.indexOf(`async function ${collector}(`);
    assert.notEqual(start, -1, collector);
    const next = worker.indexOf('\nasync function ', start + 1);
    const body = worker.slice(start, next === -1 ? worker.length : next);
    assert.match(body, /\([^)]*collection[^)]*\)/, `${collector} collection argument`);
    if (collector === 'collectRocketPoRows' || collector === 'listRocketPos') {
      const method = collector === 'collectRocketPoRows' ? 'collect' : 'list';
      assert.match(body, new RegExp(`rocketPoCollection\\.${method}`));
      assert.match(rocketCollection, /coupangPoSession\.run/);
      assert.match(
        coupangPoSession,
        /await attachOrderCollectionTab\(collection, tab, created\)/,
      );
    } else if (collector === 'collectCoupangDirectOrders') {
      assert.match(body, /coupangPoSession\.run/);
      assert.match(
        coupangPoSession,
        /await attachOrderCollectionTab\(collection, tab, created\)/,
      );
    } else {
      assert.match(
        body,
        /await attachOrderCollectionTab\(collection, tab, created\)/,
        `${collector} managed tab attachment`,
      );
    }
  }
});

test('order worker imports session lifecycle and focused Sellpia inventory producer before dispatch', () => {
  const worker = readFileSync(workerPath, 'utf8');
  assert.match(worker, /importScripts\([\s\S]*collection-session\.js[\s\S]*interactive-tabs\.js[\s\S]*order-collection-lifecycle\.js[\s\S]*sellpia-inventory\.js/);
  assert.match(worker, /browserCollectionSessions:\s*true/);
  assert.match(worker, /collectSellpiaInventory:\s*true/);
  assert.match(worker, /collectSellpiaInventoryV2:\s*true/);
  assert.match(worker, /collectSellpiaSaleSummary:\s*true/);
  assert.match(worker, /collectSellpiaSaleSummaryAuthoritativeV1:\s*true/);
  assert.match(worker, /collectSellpiaProductProfit:\s*true/);
  assert.doesNotMatch(worker, /collectSellpiaProductStock/);
  assert.match(worker, /msg\?\.action === ["']collectSellpiaInventory["']/);
  for (const action of [
    'listCollectionSessions',
    'getCollectionSession',
    'cancelCollectionSession',
    'openCollectionAttentionTab',
    'restartCollectionSession',
  ]) {
    assert.match(worker, new RegExp(`msg\\?\\.action === ["']${action}["']`), action);
  }
});

test('order collector manifest publishes authoritative Sellpia sales evidence at version 0.1.78', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.version, '0.1.78');
  assert.ok(manifest.permissions.includes('storage'));
  assert.ok(manifest.host_permissions.includes('https://*.sellpia.com/*'));
});

test('Coupang shipment date summary scans its bounded range in concurrent batches', () => {
  const worker = readFileSync(workerPath, 'utf8');
  const start = worker.indexOf('async function scrapeCoupangShipmentDateSummary(');
  const end = worker.indexOf('\nasync function collectCoupangShipmentList(', start);
  const body = worker.slice(start, end);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.match(body, /const PAGE_FETCH_CONCURRENCY = 6;/);
  assert.match(body, /await Promise\.all\(/);
  assert.match(body, /batchStart \+= PAGE_FETCH_CONCURRENCY/);
  assert.doesNotMatch(body, /for \(let page = 1; page <= maxPages; page\+\+\)/);
});

test('every web automatic order message carries its local runId explicitly', () => {
  const automaticActionSet = new Set(automaticCollectors);
  const messages = [];
  for (const file of sourceFilesUnder(webAppRoot)) {
    if (/\.(spec|test)\.(ts|tsx)$/.test(file)) continue;
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/action:\s*['"]([^'"]+)['"]/g)) {
      if (!automaticActionSet.has(match[1])) continue;
      const objectTail = source.slice(match.index, source.indexOf('}', match.index) + 1);
      messages.push({ action: match[1], file, objectTail });
    }
  }

  assert.ok(messages.length >= 16);
  for (const message of messages) {
    assert.match(
      message.objectTail,
      /runId\s*:/,
      `${message.action} in ${path.relative(repoRoot, message.file)}`,
    );
    if (runDateActions.has(message.action)) {
      assert.match(
        message.objectTail,
        /date\s*:/,
        `${message.action} date in ${path.relative(repoRoot, message.file)}`,
      );
    }
  }
});

test('only explicit user actions route focus through the interactive helper', () => {
  const worker = readFileSync(workerPath, 'utf8');
  assert.doesNotMatch(worker, /active:\s*true|focused:\s*true/);
  for (const action of [
    'sendOrderFileToSellpia',
    'openCoupangShipmentPage',
    'clickCoupangShipmentDownloads',
    'uploadOnchTracking',
    'uploadDomeggookTracking',
  ]) {
    assert.match(worker, new RegExp(`msg\\?\\.action === ["']${action}["']`), action);
  }
  for (const [functionName, reason] of [
    ['findOrCreateSellpiaTab', 'ORDER_FILE_UPLOAD'],
    ['openCoupangShipmentPage', 'SHIPMENT_PAGE'],
    ['clickCoupangShipmentDownloads', 'SHIPMENT_DOWNLOAD'],
    ['uploadOnchTracking', 'TRACKING_MUTATION'],
    ['uploadDomeggookTracking', 'TRACKING_MUTATION'],
  ]) {
    const start = worker.indexOf(`async function ${functionName}(`);
    const next = worker.indexOf('\nasync function ', start + 1);
    const body = worker.slice(start, next === -1 ? worker.length : next);
    assert.notEqual(start, -1, functionName);
    assert.match(body, new RegExp(`INTERACTIVE_TAB_REASONS\\.${reason}`), functionName);
  }
});
