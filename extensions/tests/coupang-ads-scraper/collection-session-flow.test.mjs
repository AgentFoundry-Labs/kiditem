import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { MERGED_EXTENSION_VERSION } from '../helpers/domain-worker-modules.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const extensionRoot = path.join(repoRoot, 'extensions/kiditem-os');
const worker = fs.readFileSync(
  path.join(extensionRoot, 'background/coupang/worker.js'),
  'utf8',
);
const sourceOwnerManifest = fs.readFileSync(
  path.join(extensionRoot, 'background/source-owner-manifest.js'),
  'utf8',
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8'),
);

// 확장 병합 후 의존 모듈 로드는 통합 서비스워커가, 도메인 공용 전역은
// worker-globals.js 가 소유한다.
test('loads the canonical session manager and focus owners before collector runtimes', () => {
  const entry = fs.readFileSync(
    path.join(extensionRoot, 'background/service-worker.js'),
    'utf8',
  );
  const at = (file) => entry.indexOf(`"${file}"`);

  assert.ok(at('collection-session.js') >= 0);
  assert.ok(at('interactive-tabs.js') > at('collection-session.js'));
  assert.ok(at('worker-globals.js') > at('interactive-tabs.js'));
  assert.ok(at('coupang/worker.js') > at('worker-globals.js'));
  // KID-354: the Wing catalog runs in the TypeScript operation runtime, not as an old module.
  assert.equal(at('coupang/coupang-catalog-import.js'), -1);
  // KID-373: advertising collection is the runtime kind `advertising.ad_report`;
  // the old window, admission, collector and source owners are gone.
  for (const retired of [
    'coupang/collection-window.js',
    'coupang/collection-start.js',
    'coupang/ad-center-collector.js',
    'coupang/ad-collector-delay.js',
    'coupang/ad-campaign-source-owner.js',
    'coupang/ad-keyword-source-owner.js',
    'coupang/profitability-source-owner.js',
    // KID-365: the collection-run controller had no consumer after the window producers left.
    'coupang/collection-runs.js',
  ]) {
    assert.equal(at(retired), -1, retired);
    assert.equal(fs.existsSync(path.join(extensionRoot, 'background', retired)), false, retired);
  }
  assert.doesNotMatch(worker, /^importScripts\(/m);

  const globals = fs.readFileSync(
    path.join(extensionRoot, 'background/worker-globals.js'),
    'utf8',
  );
  assert.match(globals, /storageKey:\s*["']kiditem_collection_sessions["']/);
  // KidItem 웹 origin 표는 새 런타임 core 한 곳이다(KID-366, `extensions/src/core/environment.ts`).
  assert.doesNotMatch(globals, /KIDITEM_WEB_URL_PATTERNS/);
  // 쿠팡 도메인은 requiresAuth 가 달라 자기 환경 컨텍스트를 따로 만든다.
  assert.match(worker, /const adsEnvironmentContext = KidItemEnvironmentContext\.create\(/);

  // Wing 트래픽·아이템위너는 서비스워커의 실행 kind다(KID-362) — Wing 전체에 싣던 content script는 없다.
  const scripts = (manifest.content_scripts ?? []).flatMap((entry) => entry.js ?? []);
  assert.ok(!scripts.includes('content/coupang/wing-unified.js'));
  assert.ok(!scripts.includes('content/coupang/wing-read-api.js'));
});

// 세 도메인 워커가 각자 응답하면 같은 메시지에 경쟁 응답이 된다. 공통 액션은
// external-dispatch.js 만 처리하고, 쿠팡 워커는 source-owner 액션만 남긴다.
test('retires the generic scrape ingress before producer actions', () => {
  const dispatchSource = fs.readFileSync(
    path.join(extensionRoot, 'background/external-dispatch.js'),
    'utf8',
  );
  assert.equal(worker.indexOf('msg.action === "scrapeTargets"'), -1);
  assert.equal(worker.indexOf('msg.action === "getBatchScrapeStatus"'), -1);
  assert.equal(worker.indexOf('msg.action === "cancelBatchScrape"'), -1);
  assert.equal(worker.indexOf('msg.action === "triggerAutoScrape"'), -1);
  assert.doesNotMatch(worker, /function autoScrape\(/);
  assert.doesNotMatch(worker, /alarmName\(["']auto-scrape["']/);
  assert.match(worker, /KidItemDomains\.register\(/);
  // KID-365: the Coupang domain owns no collection session producer.
  assert.doesNotMatch(worker, /producerPrefixes/);
  for (const action of [
    'listCollectionSessions',
    'getCollectionSession',
    'cancelCollectionSession',
    'openCollectionAttentionTab',
  ]) {
    assert.match(dispatchSource, new RegExp(`["']${action}["']`));
    assert.doesNotMatch(worker, new RegExp(`msg\\.action === ["']${action}["']`));
  }
  // 취소는 producer별 source owner가 server FAILED를 커밋한 뒤 local control을 정리한다.
  assert.doesNotMatch(worker, /collectionRuns\s*\n?\s*\.cancel\(/);
  assert.match(worker, /Collection producer source owner does not support cancellation/);
  assert.doesNotMatch(worker, /restartCollectionSession/);
  assert.doesNotMatch(worker, /function handleScrapeTargets\(/);
  assert.doesNotMatch(worker, /function prepareScrapeTargets\(/);
  assert.doesNotMatch(worker, /FromPopup|monthlyScrape|beginSourceOwnerAttempt/);
});

test('opens no browser collection from a web start and exposes no ad collection action (KID-373)', () => {
  assert.doesNotMatch(worker, /startCollection|collectionStartV1|SourceOwnerV1/);
  assert.doesNotMatch(worker, /manualSync|collectProfitabilitySlice|collectCampaigns|collectKeywords/);
  for (const retired of [
    'collectAdvertisingWingTraffic',
    'collectAdvertisingWingItemwinner',
    'collectAdvertisingCampaigns',
    'collectAdvertisingKeywords',
    'collectAdvertisingProfitability',
    'cancelAdvertisingCampaigns',
    'cancelAdvertisingKeywords',
    'cancelAdvertisingWingTraffic',
    'cancelAdvertisingWingItemwinner',
  ]) {
    assert.doesNotMatch(worker, new RegExp(`\\b${retired}:`), retired);
  }
});

test('retires the advertising account-day KPI owner from every extension surface', () => {
  const retired = /ad-account-daily-kpi|ad_account_daily_kpi|accountDailyKpi|account_daily_kpi|account-daily-kpis|coupang_ads_daily|dashboard\.coupang_ads|accountDailySync|계정 일별/i;
  const read = (file) => fs.readFileSync(path.join(extensionRoot, file), 'utf8');
  const surfaces = {
    'background/service-worker.js': read('background/service-worker.js'),
    'background/source-owner-manifest.js': sourceOwnerManifest,
    'background/coupang/worker.js': worker,
    'popup/popup.js': read('popup/popup.js'),
    'popup/popup.html': read('popup/popup.html'),
    'manifest.json': JSON.stringify(manifest),
  };
  for (const [name, text] of Object.entries(surfaces)) {
    assert.doesNotMatch(text, retired, name);
  }
  assert.equal(
    fs.existsSync(path.join(extensionRoot, 'background/coupang/ad-account-daily-kpi-source-owner.js')),
    false,
  );
});

// 승인된 광고 액션 실행은 런타임 kind `advertising.ad_action`(claim)이다 — 광고센터 content script와 옛 워커 실행 경로는 없다(KID-386).
test('approved ad actions run only as the runtime ad_action kind, with no ad-center content script or worker path', () => {
  assert.equal(fs.existsSync(path.join(extensionRoot, 'content/coupang/ads-report.js')), false);
  assert.equal(fs.existsSync(path.join(extensionRoot, 'utils/dom.js')), false);
  const contentScripts = manifest.content_scripts.flatMap((entry) => entry.js);
  assert.ok(!contentScripts.some((file) => /ads-report|utils\/dom/.test(file)), 'manifest content script');
  assert.ok(manifest.host_permissions.includes('https://advertising.coupang.com/*'), 'runtime still reaches the ad center');
  assert.doesNotMatch(worker, /ExecuteAdActions|QueuedAdActions|ExecuteActions=|AD_ACTION_URL/);
  const interactiveTabs = fs.readFileSync(path.join(extensionRoot, 'background/interactive-tabs.js'), 'utf8');
  assert.doesNotMatch(interactiveTabs, /AD_MUTATION/);
});

test('lists no Coupang browser session producer and still advertises the capability', () => {
  // KID-365: the Wing catalog is a runtime kind; neither Coupang producer has a session writer.
  for (const producer of ['dashboard.coupang_products', 'channels.coupang_catalog']) {
    assert.doesNotMatch(sourceOwnerManifest, new RegExp(producer.replace('.', '\\.')));
  }
  assert.doesNotMatch(sourceOwnerManifest, /"advertising\./);
  assert.match(worker, /browserCollectionSessions:\s*true/);
  assert.equal(manifest.version, MERGED_EXTENSION_VERSION);
  // 윙 상품등록 포트(`kiditem-wing-form-v1`)는 런타임 실행 kind `channels.registration`으로 옮겼다(KID-256).
  assert.doesNotMatch(worker, /kiditem-wing-form-v1|registerToWingForm|registerRepresentativeImage|openAndEditProduct/);
  const dispatchSource = fs.readFileSync(
    path.join(extensionRoot, 'background/external-dispatch.js'),
    'utf8',
  );
  assert.match(dispatchSource, /onConnectExternal\?\.addListener\(handlePort\)/);
});

test('automatic collectors contain no direct focus primitives', () => {
  for (const [name, source] of [
    ['service worker', worker],
  ]) {
    assert.doesNotMatch(source, /active:\s*true/, `${name} activates a tab directly`);
    assert.doesNotMatch(source, /focused:\s*true/, `${name} focuses a window directly`);
    assert.doesNotMatch(source, /\bactivateTab\s*\(/, `${name} uses legacy activateTab`);
  }
});

test('automatic collectors never reuse or navigate a user-active tab', () => {
  assert.match(worker, /before\?\.active && options\.allowActive !== true/);
  assert.match(worker, /throw new Error\(["']active user tab is collection-protected["']\)/);
  assert.doesNotMatch(worker, /\.catch\(\(\) => reusableTab\)/);
});

test('legacy batch controls are no longer exposed beside source-owner cancellation', () => {
  assert.doesNotMatch(worker, /function cancelBatchScrape\(/);
  assert.doesNotMatch(worker, /function autoScrape\(/);
  assert.match(worker, /cancelCollectionSession: async \(\) => \{/);
  assert.doesNotMatch(worker, /collectionWindowFor\(environmentId\)\.cancelRun/);
  assert.doesNotMatch(worker, /collectionSessions\.remove/);
});

test('keyword and competitor collection run only as runtime operation kinds (KID-362)', () => {
  assert.doesNotMatch(worker, /runCoupangCompetitorSellerCatalog/);
  assert.doesNotMatch(worker, /startCoupangCompetitorSellerCatalogCollection/);
  for (const action of ['collectAdvertisingCompetitorCatalog', 'collectAdvertisingSellerIdentities', 'collectAdvertisingWingRankBatch', 'collectAdvertisingKeywordSerpBatch', 'collectAdvertisingTrackedWingProducts']) {
    assert.doesNotMatch(worker, new RegExp(`${action}:\\s*\\{`), action);
  }
  assert.doesNotMatch(worker, /advertising\.collect_competitor_catalog/);
});

test('interactive focus helper requires a deliberate user-action reason', async () => {
  const helperPath = path.join(extensionRoot, 'background/interactive-tabs.js');
  const calls = { create: [], update: [], focus: [] };
  const chrome = {
    runtime: { lastError: null },
    tabs: {
      create(properties, callback) {
        calls.create.push(properties);
        callback({ id: 41, windowId: 7 });
      },
      update(tabId, properties, callback) {
        calls.update.push({ tabId, properties });
        callback({ id: tabId, windowId: 7 });
      },
    },
    windows: {
      update(windowId, properties, callback) {
        calls.focus.push({ windowId, properties });
        callback({ id: windowId });
      },
    },
  };
  const context = vm.createContext({ chrome, console });
  vm.runInContext(fs.readFileSync(helperPath, 'utf8'), context, {
    filename: helperPath,
  });
  const interactive = context.KidItemInteractiveTabs.create({ chrome });
  const reason = context.KidItemInteractiveTabs.reasons.PRODUCT_EDIT;

  await assert.rejects(
    interactive.createTab({ url: 'https://wing.coupang.com', reason: 'batch' }),
    /interactive reason/i,
  );
  const tab = await interactive.createTab({
    url: 'https://wing.coupang.com',
    reason,
  });
  await interactive.focusTab(tab.id, reason);

  assert.deepEqual(JSON.parse(JSON.stringify(calls.create)), [
    { url: 'https://wing.coupang.com', active: true },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.update)), [
    { tabId: 41, properties: { active: true } },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls.focus)), [
    { windowId: 7, properties: { focused: true } },
  ]);
});
