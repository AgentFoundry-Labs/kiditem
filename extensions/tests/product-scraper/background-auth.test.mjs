import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import {
  SOURCING_WORKER_MODULES,
  installExternalDispatch,
  MERGED_EXTENSION_VERSION,
} from '../helpers/domain-worker-modules.mjs';

const backgroundPath = path.resolve('extensions/kiditem-os/background/sourcing/worker.js');
const backgroundSource = fs.readFileSync(backgroundPath, 'utf8');
const environmentContextPath = path.resolve('extensions/kiditem-os/background/environment-context.js');
const environmentContextSource = fs.readFileSync(environmentContextPath, 'utf8');
const collectionSessionPath = path.resolve('extensions/kiditem-os/background/collection-session.js');
const collectionSessionSource = fs.readFileSync(collectionSessionPath, 'utf8');
const interactiveTabsPath = path.resolve('extensions/kiditem-os/background/interactive-tabs.js');
const interactiveTabsSource = fs.readFileSync(interactiveTabsPath, 'utf8');
const trendCollectorPath = path.resolve('extensions/kiditem-os/background/sourcing/1688-trend-collector.js');
const trendCollectorSource = fs.readFileSync(trendCollectorPath, 'utf8');
const liveCommerceCollectorPath = path.resolve('extensions/kiditem-os/background/sourcing/live-commerce-collector.js');
const liveCommerceCollectorSource = fs.readFileSync(liveCommerceCollectorPath, 'utf8');
const manifest = JSON.parse(
  fs.readFileSync(path.resolve('extensions/kiditem-os/manifest.json'), 'utf8'),
);

function createStorage(initial = {}, notify = () => {}) {
  const values = { ...initial };
  return {
    values,
    get(keys, cb) {
      let result;
      if (keys == null) {
        result = { ...values };
      } else if (typeof keys === 'string') {
        result = { [keys]: values[keys] };
      } else if (Array.isArray(keys)) {
        result = Object.fromEntries(keys.map((key) => [key, values[key]]));
      } else {
        result = Object.fromEntries(
          Object.entries(keys).map(([key, fallback]) => [
            key,
            values[key] === undefined ? fallback : values[key],
          ]),
        );
      }
      if (cb) cb(result);
      else return Promise.resolve(result);
    },
    set(next, cb) {
      const changes = Object.fromEntries(
        Object.entries(next).map(([key, value]) => [
          key,
          { oldValue: values[key], newValue: value },
        ]),
      );
      Object.assign(values, next);
      notify(changes, 'local');
      if (cb) cb();
      else return Promise.resolve();
    },
    remove(keys, cb) {
      const changes = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        changes[key] = { oldValue: values[key], newValue: undefined };
        delete values[key];
      }
      notify(changes, 'local');
      if (cb) cb();
      else return Promise.resolve();
    },
  };
}

function loadBackground(initialStorage = {}, plannedResponses = []) {
  const storageChangeListeners = [];
  const storage = createStorage(initialStorage, (changes, areaName) => {
    for (const listener of storageChangeListeners) listener(changes, areaName);
  });
  const externalListeners = [];
  const runtimeListeners = [];
  const connectListeners = [];
  const installListeners = [];
  const fetchCalls = [];
  const dispatchedEvents = [];
  const tabUrls = new Map();

  const context = {
    crypto: { randomUUID },
    AbortController,
    chrome: {
      runtime: {
        id: 'product-scraper-extension',
        getManifest: () => ({ version: '2.0.0' }),
        onInstalled: { addListener: (listener) => installListeners.push(listener) },
        onConnect: { addListener: (listener) => connectListeners.push(listener) },
        onMessage: { addListener: (listener) => runtimeListeners.push(listener) },
        onMessageExternal: { addListener: (listener) => externalListeners.push(listener) },
        lastError: null,
      },
      scripting: {
        executeScript: async ({ args }) => {
          if (Array.isArray(args) && typeof args[0] === 'string') {
            dispatchedEvents.push(args[0]);
          }
          return [];
        },
      },
      storage: {
        local: storage,
        onChanged: {
          addListener: (listener) => storageChangeListeners.push(listener),
          removeListener: (listener) => {
            const index = storageChangeListeners.indexOf(listener);
            if (index >= 0) storageChangeListeners.splice(index, 1);
          },
        },
      },
      tabs: {
        get: async (id) => ({ url: tabUrls.get(id) || 'https://detail.1688.com/offer/607635921546.html' }),
        query: async () => [{ id: 3000, url: 'http://localhost:3000/dashboard' }],
        sendMessage: (tabId, message, callback) => {
          callback?.({ ok: true });
          if (message.type === 'TRIGGER_EXTRACT') queueMicrotask(() => {
            for (const listener of runtimeListeners) listener({ type: 'PRODUCT_DATA', attemptId: message.attemptId,
              data: { source_url: tabUrls.get(tabId), source_platform: '1688', page_type: 'search', total_found: 0 } },
            { tab: { id: tabId } }, () => {});
          });
        },
      },
    },
    console,
    clearTimeout,
    fetch: async (url, init) => {
      fetchCalls.push({ url, init });
      const planned = plannedResponses.shift() ?? { status: 200 };
      const status = planned.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => planned.body ?? '',
        json: async () => planned.json ?? (url.endsWith('/attempts')
          ? { attemptId: randomUUID(), attemptToken: randomUUID(), state: 'RUNNING' }
          : { state: 'COMPLETE' }),
      };
    },
    Headers,
    setTimeout,
    setInterval,
    clearInterval,
    URL,
  };

  vm.createContext(context);
  // 소싱 워커는 더 이상 importScripts 를 호출하지 않는다. 통합 서비스워커가
  // 공용 모듈과 도메인 모듈을 싣고 마지막에 도메인 워커를 싣는 순서를 재현한다.
  const sourcingRoot = path.dirname(backgroundPath);
  context.importScripts = (...files) => {
    for (const file of files) {
      const filename = path.join(sourcingRoot, file);
      vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
    }
  };
  context.importScripts(...SOURCING_WORKER_MODULES);
  vm.runInContext(backgroundSource, context, { filename: backgroundPath });
  installExternalDispatch(context, context.chrome);

  return {
    context,
    connectListeners,
    externalListeners,
    dispatchedEvents,
    fetchCalls,
    installListeners,
    storage: storage.values,
    storageApi: storage,
    runtimeListeners,
    tabUrls,
  };
}

function collectProduct(env, product, environmentId) {
  const tabId = env.tabUrls.size + 1;
  env.tabUrls.set(tabId, product.source_url);
  return new Promise((resolve) => {
    for (const listener of env.runtimeListeners) listener({ type: 'COLLECT_CURRENT', tabId, environmentId }, {}, resolve);
  });
}

function sendExternal(listeners, message, sender = { url: 'http://localhost:3000/product-pipeline/collected-products' }) {
  const all = Array.isArray(listeners) ? listeners : [listeners];
  return new Promise((resolve) => {
    let settled = false;
    const sendResponse = (response) => {
      if (settled) return;
      settled = true;
      resolve(response);
    };
    for (const listener of all) listener(message, sender, sendResponse);
  });
}

async function waitForCallCount(calls, count) {
  const deadline = Date.now() + 1000;
  while (calls.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  assert.equal(calls.length, count);
}

test('stores the local KidItem session token in its environment profile', async () => {
  const env = loadBackground({
    kiditem_sourcing_ingest_token: 'legacy-token',
    kiditem_sourcing_ingest_token_expires_at: '2026-05-21T12:30:00.000Z',
  });

  // 통합 확장은 소싱 도메인 리스너와 통합 dispatch 리스너를 함께 등록한다.
  assert.equal(env.externalListeners.length, 2);
  const response = await sendExternal(env.externalListeners, {
    action: 'setAuthToken',
    token: 'token-from-web',
  });

  assert.equal(response?.success, true);
  assert.equal(
    env.storage.kiditem_environment_profiles_v1.local.accessToken,
    'token-from-web',
  );
  assert.equal(env.storage.kiditem_auth_token, undefined);
  assert.equal(env.storage.kiditem_sourcing_ingest_token, undefined);
  assert.equal(env.storage.kiditem_sourcing_ingest_token_expires_at, undefined);
});

test('clears only the sender environment profile on sign-out', async () => {
  const env = loadBackground({
    kiditem_environment_profiles_v1: {
      local: { accessToken: 'local-token', updatedAt: 1 },
      office: { accessToken: 'office-token', updatedAt: 2 },
    },
    kiditem_sourcing_ingest_token: 'legacy-token',
  });

  const response = await sendExternal(env.externalListeners, {
    action: 'clearAuthToken',
  });

  assert.equal(response?.success, true);
  assert.equal(env.storage.kiditem_environment_profiles_v1.local, undefined);
  assert.equal(
    env.storage.kiditem_environment_profiles_v1.office.accessToken,
    'office-token',
  );
});

test('advertises the logged-in Chrome trend and live-commerce collector capabilities', async () => {
  const env = loadBackground();

  const response = await sendExternal(env.externalListeners, { action: 'ping' });

  assert.equal(response?.success, true);
  assert.equal(response?.capabilities?.sourcing1688TrendCollector, true);
  assert.equal(response?.capabilities?.sourcingLiveCommerceCollector, true);
  assert.equal(response?.capabilities?.browserCollectionSessions, true);
  assert.equal(response?.capabilities?.kiditemEnvironmentProfilesV1, true);
  assert.equal(manifest.version, MERGED_EXTENSION_VERSION);
});

test('manifest connects the office web origin to the host bridge and API permission', () => {
  assert.ok(manifest.externally_connectable.matches.includes('http://kiditem-office/*'));
  assert.ok(manifest.host_permissions.includes('http://kiditem-office/*'));
  const hostBridge = manifest.content_scripts.find((entry) =>
    entry.js?.some((file) => file.endsWith('host-bridge.js')),
  );
  assert.ok(hostBridge?.matches.includes('http://kiditem-office/*'));
});

// 확장 병합 후 의존 모듈 로드는 통합 서비스워커가 소유한다. 소싱 워커는
// 최상위에서 이 모듈의 전역을 바로 쓰므로 로드 순서가 뒤집히면 부팅이 깨진다.
test('통합 서비스워커가 공용 모듈과 소싱 모듈을 소싱 워커보다 먼저 싣는다', () => {
  const entrySource = fs.readFileSync(
    path.resolve('extensions/kiditem-os/background/service-worker.js'),
    'utf8',
  );
  const at = (file) => entrySource.indexOf(`"${file}"`);

  assert.ok(at('domain-registry.js') >= 0);
  assert.ok(at('environment-context.js') > at('domain-registry.js'));
  assert.ok(at('collection-session.js') > at('environment-context.js'));
  assert.ok(at('interactive-tabs.js') > at('collection-session.js'));
  assert.ok(at('worker-globals.js') > at('interactive-tabs.js'));
  assert.ok(at('sourcing/url-policy.js') > at('worker-globals.js'));
  assert.ok(at('sourcing/1688-trend-collector.js') > at('worker-globals.js'));
  assert.ok(at('sourcing/1688-trend-collector.js') > at('sourcing/url-policy.js'));
  assert.ok(
    at('sourcing/live-commerce-collector.js') > at('sourcing/1688-trend-collector.js'),
  );
  assert.ok(at('sourcing/worker.js') > at('sourcing/live-commerce-collector.js'));

  // 세 도메인이 하나의 세션 저장소를 공유하고, 인스턴스는 공용 전역이 소유한다.
  const globalsSource = fs.readFileSync(
    path.resolve('extensions/kiditem-os/background/worker-globals.js'),
    'utf8',
  );
  assert.match(globalsSource, /KidItemCollectionSession\.create\(/);
  assert.match(globalsSource, /storageKey:\s*["']kiditem_collection_sessions["']/);
  assert.doesNotMatch(backgroundSource, /KidItemCollectionSession\.create\(/);
});

// 세 도메인 워커가 각자 응답하면 같은 메시지에 경쟁 응답이 된다. 공통 액션은
// external-dispatch.js 만 처리하고, 소싱 워커는 자기 액션만 남긴다.
test('수집 세션 공통 액션은 통합 dispatch 가 단독으로 처리하고 1688은 direct source-owner action으로 등록한다', () => {
  const dispatchSource = fs.readFileSync(
    path.resolve('extensions/kiditem-os/background/external-dispatch.js'),
    'utf8',
  );
  for (const action of [
    'listCollectionSessions',
    'getCollectionSession',
    'cancelCollectionSession',
    'openCollectionAttentionTab',
  ]) {
    assert.match(dispatchSource, new RegExp(`["']${action}["']`), action);
    assert.doesNotMatch(
      backgroundSource,
      new RegExp(`msg\\.action === ["']${action}["']`),
      action,
    );
  }
  assert.doesNotMatch(backgroundSource, /msg\.action === ["']ping["']/);
  for (const legacyAction of [
    'start1688TrendCollection',
    'get1688TrendCollectionStatus',
    'cancel1688TrendCollection',
    'startTiktokCcCollection',
    'getTiktokCcCollectionStatus',
    'cancelTiktokCcCollection',
    'collectLiveCommerceUrl',
  ]) {
    assert.doesNotMatch(
      backgroundSource,
      new RegExp(`msg\\.action === ["']${legacyAction}["']`),
      legacyAction,
    );
  }
  assert.match(backgroundSource, /collectSourcing1688Trends:\s*\{/);
  assert.doesNotMatch(backgroundSource, /"sourcing\.collect_1688_trends": runSourcing1688TrendOperation/);
  assert.match(backgroundSource, /collectSourcingTiktokCcTrends:\s*\{/);
  assert.match(backgroundSource, /validate:\s*parseSourcingTiktokCcTrendStart/);
  assert.doesNotMatch(
    backgroundSource,
    /"sourcing\.collect_tiktok_cc_trends": runSourcingTiktokCcTrendOperation/,
  );
  assert.doesNotMatch(backgroundSource, /function runSourcingTiktokCcTrendOperation\(/);
  assert.match(backgroundSource, /collectSourcingLiveCommerce:\s*\{/);
  assert.match(backgroundSource, /validate:\s*parseSourcingLiveCommerceStart/);
  assert.doesNotMatch(backgroundSource, /"sourcing\.collect_live_commerce_url": runSourcingLiveCommerceOperation/);
  assert.doesNotMatch(backgroundSource, /function runSourcingLiveCommerceOperation\(/);
});

test('accepts a heartbeat port that keeps long 1688 trend runs alive', () => {
  const env = loadBackground();
  const messageListeners = [];

  assert.equal(env.connectListeners.length, 1);
  env.connectListeners[0]({
    name: 'kiditem-1688-trend-keepalive',
    onMessage: { addListener: (listener) => messageListeners.push(listener) },
  });

  assert.equal(messageListeners.length, 1);
});

test('stores office auth and routes requests to the office API origin', async () => {
  const env = loadBackground();

  const response = await sendExternal(
    env.externalListeners,
    { action: 'setAuthToken', token: 'office-token' },
    { url: 'http://kiditem-office/product-pipeline/collected-products' },
  );

  assert.equal(response?.success, true);
  await collectProduct(env,
    { source_url: 'https://detail.1688.com/offer/607635921546.html' },
    'office',
  );
  assert.equal(
    env.fetchCalls[0].url,
    'http://kiditem-office/api/sourcing/extension/product-data/attempts',
  );
  assert.equal(
    new Headers(env.fetchCalls[0].init.headers).get('authorization'),
    'Bearer office-token',
  );
});

test('rejects auth tokens sent from non-KidItem web origins', async () => {
  const env = loadBackground();

  const response = await sendExternal(
    env.externalListeners,
    { action: 'setAuthToken', token: 'token-from-web' },
    { url: 'http://evil.localhost:3000/product-pipeline/collected-products' },
  );

  assert.equal(response?.success, false);
  assert.equal(env.storage.kiditem_environment_profiles_v1, undefined);
});

test('sends the stored token as Bearer auth to the sourcing ingest API', async () => {
  const env = loadBackground({
    kiditem_environment_profiles_v1: {
      local: { accessToken: 'stored-token', updatedAt: 1 },
    },
  });

  await collectProduct(env,
    { source_url: 'https://detail.1688.com/offer/607635921546.html' },
    'local',
  );

  assert.equal(env.fetchCalls.length, 2);
  const headers = new Headers(env.fetchCalls[0].init.headers);
  assert.equal(headers.get('content-type'), 'application/json');
  assert.equal(headers.get('authorization'), 'Bearer stored-token');
});

test('ignores ambiguous legacy API bases and tokens', async () => {
  const env = loadBackground({
    apiBase: 'https://evil.example/api/sourcing/extension',
    kiditem_auth_token: 'stored-token',
  });

  const result = await collectProduct(env,
    { source_url: 'https://detail.1688.com/offer/607635921546.html' },
    'local',
  );

  assert.equal(result.ok, false);
  assert.match(result.error, /로그인/);
  assert.equal(env.fetchCalls.length, 0);
});

test('requests web resync and retries once after 401 with a changed token', async () => {
  const env = loadBackground(
    {
      kiditem_environment_profiles_v1: {
        local: { accessToken: 'expired-token', updatedAt: 1 },
      },
    },
    [{ status: 401 }, { status: 200 }],
  );

  const pending = collectProduct(env,
    { source_url: 'https://detail.1688.com/offer/607635921546.html' },
    'local',
  );
  await waitForCallCount(env.fetchCalls, 1);
  await sendExternal(env.externalListeners, {
    action: 'setAuthToken',
    token: 'rotated-token',
  });
  const result = await pending;

  assert.equal(result.ok, true);
  assert.equal(env.fetchCalls.length, 3);
  assert.equal(
    new Headers(env.fetchCalls[1].init.headers).get('authorization'),
    'Bearer rotated-token',
  );
  assert.deepEqual(env.dispatchedEvents, ['kiditem:extension-auth-required']);
});

test('coalesces concurrent 401 refresh signals and retries each request once', async () => {
  const env = loadBackground(
    {
      kiditem_environment_profiles_v1: {
        local: { accessToken: 'expired-token', updatedAt: 1 },
      },
    },
    [{ status: 401 }, { status: 401 }, { status: 200 }, { status: 200 }],
  );

  const first = collectProduct(env,
    { source_url: 'https://detail.1688.com/offer/1.html' },
    'local',
  );
  const second = collectProduct(env,
    { source_url: 'https://detail.1688.com/offer/2.html' },
    'local',
  );
  await waitForCallCount(env.fetchCalls, 2);
  await sendExternal(env.externalListeners, {
    action: 'setAuthToken',
    token: 'rotated-token',
  });
  const results = await Promise.all([first, second]);

  assert.deepEqual(results.map((result) => result.ok), [true, true]);
  assert.equal(env.fetchCalls.length, 6);
  assert.deepEqual(env.dispatchedEvents, ['kiditem:extension-auth-required']);
});

test('fails closed when the selected environment is not authenticated', async () => {
  const env = loadBackground();
  const result = await collectProduct(env,
    { source_url: 'https://detail.1688.com/offer/1.html' },
    'local',
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /로그인/);
  assert.equal(env.fetchCalls.length, 0);
});
