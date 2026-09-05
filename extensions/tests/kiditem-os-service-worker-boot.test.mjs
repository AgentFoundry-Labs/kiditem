import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// 주문수집 / 쿠팡 / 소싱 세 확장을 kiditem-os 하나로 합치면서 세 도메인 워커가
// 하나의 서비스워커 전역 스코프를 공유하게 됐다. 이 조합은 아래 세 가지로
// 조용히 깨질 수 있고, 셋 다 Chrome 에 올려야만 드러난다:
//
//   - 두 도메인이 같은 이름을 최상위에 선언 -> 워커 전체가 SyntaxError
//   - importScripts 순서가 어긋남 -> 최상위에서 전역을 쓰다 ReferenceError
//   - 도메인이 KidItemDomains 등록을 빠뜨림 -> ping capabilities 누락
//
// 그래서 실제 진입점을 그대로 실행해 부팅을 검증한다.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const backgroundRoot = path.join(repoRoot, 'extensions/kiditem-os/background');
const entryPath = path.join(backgroundRoot, 'service-worker.js');
const manifest = JSON.parse(
  readFileSync(path.join(repoRoot, 'extensions/kiditem-os/manifest.json'), 'utf8'),
);

function createFakeChrome() {
  const storage = {};
  const createdTabs = [];
  const externalMessageListeners = [];
  const connectExternalListeners = [];
  const noopEvent = () => ({ addListener() {}, removeListener() {} });
  return {
    storage,
    createdTabs,
    externalMessageListeners,
    connectExternalListeners,
    chrome: {
      runtime: {
        id: 'kiditem-os-test',
        lastError: null,
        getManifest: () => manifest,
        onInstalled: noopEvent(),
        onStartup: noopEvent(),
        onConnect: noopEvent(),
        onMessage: noopEvent(),
        onMessageExternal: {
          addListener: (listener) => externalMessageListeners.push(listener),
        },
        onConnectExternal: {
          addListener: (listener) => connectExternalListeners.push(listener),
        },
      },
      alarms: { create() {}, clear() {}, onAlarm: noopEvent() },
      storage: {
        local: {
          async get(key, callback) {
            const result = key == null ? { ...storage }
              : typeof key === 'string' ? { [key]: storage[key] }
              : Array.isArray(key) ? Object.fromEntries(key.map((k) => [k, storage[k]]))
              : Object.fromEntries(
              Object.entries(key).map(([k, fallback]) => [
                k,
                storage[k] === undefined ? fallback : storage[k],
              ]),
            );
            callback?.(result);
            return result;
          },
          async set(values, callback) {
            Object.assign(storage, values);
            callback?.();
          },
          async remove(keys, callback) {
            for (const key of Array.isArray(keys) ? keys : [keys]) {
              delete storage[key];
            }
            callback?.();
          },
        },
        onChanged: noopEvent(),
      },
      tabs: {
        async create(properties) {
          createdTabs.push(properties);
          return { id: 1, windowId: 1, ...properties };
        },
        async get(id) {
          return { id, windowId: 1, url: 'https://example.test/' };
        },
        async query() {
          return [];
        },
        async remove() {},
        async update(id, properties) {
          return { id, windowId: 1, ...properties };
        },
        sendMessage() {},
        onRemoved: noopEvent(),
        onUpdated: noopEvent(),
      },
      windows: {
        async create() {
          return { id: 1, tabs: [{ id: 1 }] };
        },
        async get() {
          return { id: 1 };
        },
        async remove() {},
        async update() {},
        onRemoved: noopEvent(),
      },
      scripting: { async executeScript() { return []; } },
      cookies: { async getAll() { return []; }, async remove() {} },
      sidePanel: { setPanelBehavior() {}, async open() {} },
      action: { onClicked: noopEvent() },
      debugger: { async attach() {}, async detach() {}, async sendCommand() {}, onEvent: noopEvent() },
    },
  };
}

function bootServiceWorker() {
  const fake = createFakeChrome();
  let context;
  const sandbox = {
    AbortController,
    Blob,
    FormData,
    Headers,
    // Node 전역에는 없지만 쿠팡 이미지 페치 모듈이 생성자로 주입받는다.
    FileReader: class {
      readAsDataURL() {
        this.result = 'data:,';
        this.onload?.();
      }
    },
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
    atob,
    btoa,
    chrome: fake.chrome,
    clearInterval,
    clearTimeout,
    console,
    crypto,
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' }),
    setInterval,
    setTimeout,
    structuredClone,
    // 실제 서비스워커의 importScripts 와 같은 기준(서비스워커 위치)으로 푼다.
    importScripts(...files) {
      for (const file of files) {
        const filename = path.join(backgroundRoot, file.split('?')[0]);
        vm.runInContext(readFileSync(filename, 'utf8'), context, { filename });
      }
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  context = vm.createContext(sandbox);
  vm.runInContext(readFileSync(entryPath, 'utf8'), context, { filename: entryPath });
  return { fake, context };
}

test('통합 서비스워커가 세 도메인을 모두 싣고 부팅한다', () => {
  const { fake, context } = bootServiceWorker();

  // 도메인 워커 3개 + 통합 dispatch = 외부 리스너 4개.
  assert.equal(fake.externalMessageListeners.length, 4);
  assert.ok(context.KidItemDomains);
});

test('브라우저 Operation runtime 인스턴스를 하나만 만들고 공용 dispatch에 보관한다', () => {
  const source = readFileSync(entryPath, 'utf8');
  assert.equal(
    source.match(/KidItemOperationRuntimeClient\.create\(/g)?.length,
    1,
  );
  assert.match(source, /const browserOperationRuntime\s*=\s*KidItemOperationRuntimeClient\.create/);
  assert.match(source, /operationRuntime:\s*browserOperationRuntime/);
  assert.match(source, /browserOperationRuntime\.install\(\)/);
});

test('wakeOperationRuntime에는 공용 dispatch만 즉시 응답한다', async () => {
  const { fake } = bootServiceWorker();
  const responses = [];
  let keptAlive = 0;

  for (const listener of fake.externalMessageListeners) {
    const result = listener(
      { action: 'wakeOperationRuntime' },
      { url: 'http://localhost:3000/sourcing-ai/wing-catalog' },
      (response) => responses.push(response),
    );
    if (result === true) keptAlive += 1;
  }

  assert.equal(keptAlive, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(responses)), [
    { success: true, accepted: true },
  ]);
  await Promise.resolve();
});

test('ping 이 세 도메인의 capabilities 를 합쳐 한 번만 응답한다', async () => {
  const { fake } = bootServiceWorker();

  const responses = [];
  for (const listener of fake.externalMessageListeners) {
    listener(
      { action: 'ping' },
      { url: 'http://localhost:3000/order-collection' },
      (response) => responses.push(response),
    );
  }

  assert.equal(responses.length, 1, 'ping 에 두 곳 이상이 응답하면 안 된다');
  const [response] = responses;
  assert.equal(response.success, true);
  assert.equal(response.version, manifest.version);
  for (const capability of [
    // 주문수집
    'orderCollectionIcecreamMall',
    'coupangShipmentSummarySourceOwnerV1',
    'collectSellpiaInventoryJsonV1',
    'collectSellpiaManualMatchV1',
    'collectSellpiaManualMatchPortV1',
    'orderCollectionFailureEvidenceV1',
    // 쿠팡
    'profitabilityAdvertisingSourceOwnerV1',
    'coupangCatalogSnapshot',
    'wingFormPortV1',
    'coupangKeywordRank',
    // 소싱
    'sourcingProductScraper',
    'sourcing1688TrendCollector',
    // 공통
    'browserCollectionSessions',
    'kiditemEnvironmentProfilesV1',
  ]) {
    assert.equal(response.capabilities[capability], true, capability);
  }
});

test('세 도메인이 서로 겹치지 않는 producer 접두사를 등록한다', () => {
  const { context } = bootServiceWorker();
  const domains = context.KidItemDomains;

  const expected = {
    'orders.mall': 'cancelCollectionSession',
    'orders.sellpia_manual_match': 'cancelCollectionSession',
    'inventory.sellpia': 'cancelCollectionSession',
    'advertising.ad_sync': 'cancelCollectionSession',
    'channels.coupang_catalog': 'cancelCollectionSession',
    'dashboard.wing_sales': 'cancelCollectionSession',
    'sourcing.1688_trend': 'cancelCollectionSession',
  };
  for (const [producer, operation] of Object.entries(expected)) {
    const domain = domains.forProducer(producer);
    assert.ok(domain, producer);
    assert.equal(typeof domain[operation], 'function', `${producer}.${operation}`);
  }
  assert.equal(domains.forProducer('unknown.thing'), null);
});

test('승인된 KidItem web origin도 retired Coupang source bridge를 직접 시작할 수 없다', () => {
  const { fake, context } = bootServiceWorker();

  for (const action of [
    'searchWingCatalogProducts',
    'searchCoupangKeywordSuggestions',
  ]) {
    let keptAlive = 0;
    for (const listener of fake.externalMessageListeners) {
      const result = listener(
        { action, keyword: '문구', maxPages: 1 },
        { url: 'http://localhost:3000/sourcing-ai/wing-catalog' },
        () => {},
      );
      if (result === true) keptAlive += 1;
    }
    assert.equal(keptAlive, 0, `${action}: direct source-owner action만 source work를 시작한다`);
  }

  assert.deepEqual(fake.createdTabs, []);
  assert.equal(
    context.KidItemDomains.runOperation('sourcing.collect_wing_catalog_batch'),
    null,
  );
  assert.equal(
    context.KidItemDomains.runOperation('sourcing.collect_keyword_suggestions'),
    null,
  );
  assert.equal(
    typeof context.KidItemDomains.forExternalAction('collectSourcingKeywordSuggestions')?.handle,
    'function',
  );
  assert.equal(
    context.KidItemDomains.capabilities().sourcingKeywordSuggestionSourceOwnerV1,
    true,
  );
});

test('수익성 광고비 수집은 공용 dispatch의 직접 source-owner action으로만 등록된다', () => {
  const { context } = bootServiceWorker();
  assert.equal(
    typeof context.KidItemDomains.forExternalAction('collectAdvertisingProfitability')?.handle,
    'function',
  );
  assert.equal(context.KidItemDomains.forExternalAction('advertising.refresh_profitability_spend'), null);
});

test('외부 장기 실행 포트를 공용 dispatch 하나가 소유 도메인으로 전달한다', () => {
  const { fake } = bootServiceWorker();
  assert.equal(fake.connectExternalListeners.length, 1);
  const [dispatch] = fake.connectExternalListeners;

  for (const name of ['kiditem-wing-form-v1', 'kiditem-sellpia-manual-match-v1']) {
    const messageListeners = [];
    let disconnected = 0;
    dispatch({
      name,
      sender: { url: 'http://kiditem-office/product-hub/matching' },
      onMessage: { addListener: (listener) => messageListeners.push(listener) },
      postMessage() {},
      disconnect() { disconnected += 1; },
    });
    assert.equal(messageListeners.length, 1, name);
    assert.equal(disconnected, 0, name);
  }

  let unknownDisconnected = 0;
  dispatch({
    name: 'unknown-port',
    sender: { url: 'http://kiditem-office/product-hub/matching' },
    disconnect() { unknownDisconnected += 1; },
  });
  assert.equal(unknownDisconnected, 1);
});

test('수집 세션 공통 액션에 도메인 워커가 경쟁 응답하지 않는다', async () => {
  const { fake } = bootServiceWorker();

  for (const action of [
    'listCollectionSessions',
    'getCollectionSession',
    'cancelCollectionSession',
    'openCollectionAttentionTab',
  ]) {
    const responses = [];
    let keptAlive = 0;
    for (const listener of fake.externalMessageListeners) {
      const result = listener(
        { action, runId: '11111111-1111-4111-8111-111111111111' },
        { url: 'http://localhost:3000/order-collection' },
        (response) => responses.push(response),
      );
      if (result === true) keptAlive += 1;
    }
    assert.equal(keptAlive, 1, `${action}: 응답을 여는 리스너는 하나여야 한다`);
    assert.equal(responses.length, 0, `${action}: 동기 응답이 있으면 안 된다`);
  }
});

test('도메인 고유 액션은 소유 워커만 받고 retired sourcing bridge는 받지 않는다', () => {
  const { fake, context } = bootServiceWorker();

  let orderKeptAlive = 0;
  for (const listener of fake.externalMessageListeners) {
    const result = listener(
      { action: 'collectKakaoOrders', date: '2026-07-15' },
      { url: 'http://localhost:3000/order-collection' },
      () => {},
    );
    if (result === true) orderKeptAlive += 1;
  }
  assert.equal(orderKeptAlive, 1, 'collectKakaoOrders: 소유 워커 하나만 처리해야 한다');

  let sourcingBridgeKeptAlive = 0;
  for (const listener of fake.externalMessageListeners) {
    const result = listener(
      {
        action: 'start1688TrendCollection',
        runId: '11111111-1111-4111-8111-111111111111',
        keywords: ['테스트'],
      },
      { url: 'http://localhost:3000/sourcing-ai/decision-center' },
      () => {},
    );
    if (result === true) sourcingBridgeKeptAlive += 1;
  }
  assert.equal(sourcingBridgeKeptAlive, 0, 'retired sourcing bridge는 외부 액션을 열면 안 된다');
  assert.equal(
    typeof context.KidItemDomains.forExternalAction('collectSourcing1688Trends')?.handle,
    'function',
    '1688 source collection is owned by one explicit external action',
  );
  assert.equal(
    context.KidItemDomains.runOperation('sourcing.collect_1688_trends'),
    null,
    'retired 1688 Operation must not claim browser work',
  );
  const tiktokAction = context.KidItemDomains.forExternalAction('collectSourcingTiktokCcTrends');
  assert.equal(
    typeof tiktokAction?.handle,
    'function',
    'TikTok source collection is owned by one explicit external action',
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(tiktokAction.validate({
      action: 'collectSourcingTiktokCcTrends',
      idempotencyKey: 'tiktok-direct-dispatch-key',
      maxItems: 12,
      region: 'KR',
    }))),
    { idempotencyKey: 'tiktok-direct-dispatch-key', maxItems: 12, region: 'KR' },
  );
  for (const invalid of [
    { action: 'collectSourcingTiktokCcTrends', idempotencyKey: 'key', maxItems: 101 },
    { action: 'collectSourcingTiktokCcTrends', idempotencyKey: 'key', region: 'K1' },
    { action: 'collectSourcingTiktokCcTrends', idempotencyKey: 'key', unexpected: true },
  ]) {
    assert.throws(() => tiktokAction.validate(invalid), /Invalid TikTok source collection request/);
  }
  assert.equal(
    context.KidItemDomains.runOperation('sourcing.collect_tiktok_cc_trends'),
    null,
    'retired TikTok Operation must not claim browser work',
  );
  const liveCommerceAction = context.KidItemDomains.forExternalAction('collectSourcingLiveCommerce');
  assert.equal(
    typeof liveCommerceAction?.handle,
    'function',
    'Live Commerce collection is owned by one explicit external action',
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(liveCommerceAction.validate({
      action: 'collectSourcingLiveCommerce',
      idempotencyKey: 'live-commerce-direct-dispatch-key',
      url: 'https://live.douyin.com/123?token=keep#private',
    }))),
    {
      idempotencyKey: 'live-commerce-direct-dispatch-key',
      url: 'https://live.douyin.com/123?token=keep#private',
    },
  );
  for (const invalid of [
    { action: 'collectSourcingLiveCommerce', idempotencyKey: 'key' },
    { action: 'collectSourcingLiveCommerce', idempotencyKey: 'key', url: 'http://live.douyin.com/123' },
    { action: 'collectSourcingLiveCommerce', idempotencyKey: 'key', url: 'https://live.douyin.com/123', unexpected: true },
  ]) {
    assert.throws(() => liveCommerceAction.validate(invalid), /Invalid Live Commerce source collection request/);
  }
  assert.equal(
    context.KidItemDomains.runOperation('sourcing.collect_live_commerce_url'),
    null,
    'retired Live Commerce Operation must not claim browser work',
  );
});

test('shipment summary uses one authenticated owner responder without accepting a page-owned plan', async () => {
  const { fake, context } = bootServiceWorker();
  const action = 'collectCoupangShipmentDateSummary';
  const attemptId = '11111111-1111-4111-8111-111111111111';
  const contract = context.KidItemDomains.forExternalAction(action);
  assert.equal(typeof contract?.handle, 'function');
  for (const invalid of [
    { action, runId: attemptId },
    { action, attemptId, maxPages: 60 },
    { action, attemptId, attemptToken: 'caller-token' },
  ]) assert.throws(() => contract.validate(invalid), /Invalid shipment summary attempt/);

  let keptAlive = 0;
  const responses = [];
  await new Promise((resolve) => {
    for (const listener of fake.externalMessageListeners) {
      if (listener({ action, attemptId },
        { url: 'http://localhost:3000/coupang-shipments' },
        (response) => { responses.push(response); resolve(); }) === true) keptAlive += 1;
    }
  });
  assert.equal(keptAlive, 1);
  assert.equal(responses.length, 1);
  assert.equal(responses[0].success, false);
  assert.match(responses[0].error, /login is required/);
  assert.deepEqual(fake.createdTabs, []);
});

test('1688 direct source action reaches its owner through the external dispatcher', async () => {
  const { fake } = bootServiceWorker();
  const responses = [];
  let keptAlive = 0;

  for (const listener of fake.externalMessageListeners) {
    const result = listener(
      { action: 'collectSourcing1688Trends', idempotencyKey: '1688-direct-dispatch-key' },
      { url: 'http://localhost:3000/sourcing-ai/decision-center' },
      (response) => responses.push(response),
    );
    if (result === true) keptAlive += 1;
  }

  assert.equal(keptAlive, 1, 'direct source action must have one async owner');
  for (let index = 0; index < 10 && responses.length === 0; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(responses.length, 1);
  assert.equal(responses[0].success, false);
  assert.equal(responses[0].terminalState, 'RUNNING');
  assert.match(responses[0].error, /로그인/);
  assert.deepEqual(fake.createdTabs, []);
});

test('TikTok direct source action reaches its owner through the external dispatcher', async () => {
  const { fake } = bootServiceWorker();
  const responses = [];
  let keptAlive = 0;

  for (const listener of fake.externalMessageListeners) {
    const result = listener(
      {
        action: 'collectSourcingTiktokCcTrends',
        idempotencyKey: 'tiktok-direct-dispatch-key',
        maxItems: 12,
        region: 'KR',
      },
      { url: 'http://localhost:3000/sourcing-ai/decision-center' },
      (response) => responses.push(response),
    );
    if (result === true) keptAlive += 1;
  }

  assert.equal(keptAlive, 1, 'direct source action must have one async owner');
  for (let index = 0; index < 10 && responses.length === 0; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(responses.length, 1);
  assert.equal(responses[0].success, false);
  assert.equal(responses[0].terminalState, 'RUNNING');
  assert.match(responses[0].error, /로그인/);
  assert.deepEqual(fake.createdTabs, []);
});

test('Live Commerce direct source action reaches its owner through the external dispatcher', async () => {
  const { fake } = bootServiceWorker();
  const responses = [];
  let keptAlive = 0;

  for (const listener of fake.externalMessageListeners) {
    const result = listener(
      {
        action: 'collectSourcingLiveCommerce',
        idempotencyKey: 'live-commerce-direct-dispatch-key',
        url: 'https://live.douyin.com/123',
      },
      { url: 'http://localhost:3000/sourcing-ai/market' },
      (response) => responses.push(response),
    );
    if (result === true) keptAlive += 1;
  }

  assert.equal(keptAlive, 1, 'direct source action must have one async owner');
  for (let index = 0; index < 10 && responses.length === 0; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(responses.length, 1);
  assert.equal(responses[0].success, false);
  assert.equal(responses[0].terminalState, 'RUNNING');
  assert.match(responses[0].error, /로그인/);
  assert.deepEqual(fake.createdTabs, []);
});
