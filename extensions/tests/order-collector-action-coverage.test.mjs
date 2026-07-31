import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { MERGED_EXTENSION_VERSION } from './helpers/domain-worker-modules.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const routeRoot = path.join(repoRoot, 'apps/web/src/app/(orders)/order-collection');
const workerPath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/orders/worker.js',
);
const manifestPath = path.join(repoRoot, 'extensions/kiditem-os/manifest.json');
const rocketCollectionPath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/orders/rocket-po-collection.js',
);
const coupangPoSessionPath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/orders/coupang-po-session.js',
);
const webSourceRoot = path.join(repoRoot, 'apps/web/src');
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
  'collectHaebeopOrders',
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
  'collectHaebeopOrders',
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
  // 확장 병합 후 수집 세션 공통 액션은 통합 dispatch 가 처리한다. 웹앱 입장에서는
  // 여전히 확장 하나가 전부 받으므로 두 소유자를 합쳐서 본다.
  const dispatchSource = readFileSync(
    path.join(repoRoot, 'extensions/kiditem-os/background/external-dispatch.js'),
    'utf8',
  );
  for (const match of dispatchSource.matchAll(
    /msg\.action === "([^"]+)"|^\s{4}"([^"]+)",$/gm,
  )) {
    handledActions.add(match[1] ?? match[2]);
  }
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

test('order worker imports failure evidence, session lifecycle, and focused Sellpia producers before dispatch', () => {
  const worker = readFileSync(workerPath, 'utf8');
  // 확장 병합 후 의존 모듈 로드는 통합 서비스워커가 소유한다.
  const entrySource = readFileSync(
    path.join(repoRoot, 'extensions/kiditem-os/background/service-worker.js'),
    'utf8',
  );
  assert.match(
    entrySource,
    /importScripts\([\s\S]*collection-session\.js[\s\S]*interactive-tabs\.js[\s\S]*orders\/collection-failure\.js[\s\S]*orders\/order-collection-lifecycle\.js[\s\S]*orders\/sellpia-inventory\.js[\s\S]*orders\/sellpia-post-processing\.js/,
  );
  assert.doesNotMatch(worker, /^importScripts\(/m);
  assert.match(worker, /browserCollectionSessions:\s*true/);
  assert.match(worker, /collectSellpiaInventoryJsonV1:\s*true/);
  assert.match(worker, /collectSellpiaSaleSummary:\s*true/);
  assert.match(worker, /collectSellpiaSaleSummaryAuthoritativeV1:\s*true/);
  assert.match(worker, /collectSellpiaProductProfit:\s*true/);
  assert.match(worker, /collectSellpiaProductProfitEvidenceV1:\s*true/);
  assert.match(worker, /orderCollectionFailureEvidenceV1:\s*true/);
  assert.doesNotMatch(worker, /collectSellpiaProductStock/);
  assert.match(worker, /msg\?\.action === ["']collectSellpiaInventory["']/);

  // 수집 세션 공통 액션은 통합 dispatch 가 단독으로 처리한다. 도메인 워커가
  // 각자 응답하면 세 리스너가 같은 메시지에 경쟁 응답하게 된다.
  const dispatchSource = readFileSync(
    path.join(repoRoot, 'extensions/kiditem-os/background/external-dispatch.js'),
    'utf8',
  );
  for (const action of [
    'listCollectionSessions',
    'getCollectionSession',
    'cancelCollectionSession',
    'openCollectionAttentionTab',
    'restartCollectionSession',
    'finalizeCollectionSession',
  ]) {
    assert.match(dispatchSource, new RegExp(`["']${action}["']`), action);
    assert.doesNotMatch(
      worker,
      new RegExp(`msg\\?\\.action === ["']${action}["']`),
      action,
    );
  }
  // 도메인은 자기 구현을 레지스트리로 넘긴다.
  assert.match(worker, /KidItemDomains\.register\(/);
  assert.match(worker, /producerPrefixes:\s*\["orders",\s*"inventory"\]/);
});

test('order collector manifest publishes normalized failure evidence and scoped Sellpia invoice selection at version 0.1.95', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.version, MERGED_EXTENSION_VERSION);
  assert.ok(manifest.permissions.includes('storage'));
  assert.ok(manifest.host_permissions.includes('https://*.sellpia.com/*'));
  const worker = readFileSync(workerPath, 'utf8');
  assert.match(worker, /sellpiaOrderFileUploadEvidenceV1:\s*true/);
  assert.match(worker, /sellpiaScopedAutoInvoiceV1:\s*true/);
  assert.match(worker, /collectCoupangShipmentDateSummaryValidatedV1:\s*true/);
});

test('web bridge reaches local, office, and staging KidItem origins', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  const externalMatches = manifest.externally_connectable?.matches ?? [];
  assert.ok(externalMatches.includes('http://localhost:3000/*'));
  assert.ok(externalMatches.includes('http://kiditem-office/*'));
  assert.ok(
    externalMatches.includes('https://staging.merchon.org/*'),
    'staging web origin must be externally connectable for chrome.runtime.sendMessage',
  );

  const hostBridge = (manifest.content_scripts ?? []).find((entry) =>
    (entry.js ?? []).includes('content/host-bridge.js'),
  );
  assert.ok(hostBridge, 'host-bridge content script must be declared');
  assert.ok(hostBridge.matches.includes('http://localhost:3000/*'));
  assert.ok(hostBridge.matches.includes('http://kiditem-office/*'));
  assert.ok(
    hostBridge.matches.includes('https://staging.merchon.org/*'),
    'host-bridge must inject on staging so the web app can discover the extension id',
  );
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
  for (const file of sourceFilesUnder(webSourceRoot)) {
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
      /(?:^|,)\s*runId\s*(?::|[,}])/,
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
