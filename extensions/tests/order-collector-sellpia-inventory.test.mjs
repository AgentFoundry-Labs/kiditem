import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const backgroundRoot = path.join(repoRoot, 'extensions/order-collector/background');
const collectorPath = path.join(backgroundRoot, 'sellpia-inventory.js');
const collectionSessionPath = path.join(backgroundRoot, 'collection-session.js');
const lifecyclePath = path.join(backgroundRoot, 'order-collection-lifecycle.js');
const workerPath = path.join(backgroundRoot, 'service-worker.js');
const manifestPath = path.join(repoRoot, 'extensions/order-collector/manifest.json');
const RUN_ID = '0d7f4724-7d5b-4fea-80e3-184dd66884eb';
const PAGE_URL = 'https://kiditem.sellpia.com/product_list_total.html';
const SNAPSHOT_URL = 'https://kiditem.sellpia.com/product_search.ajax.html';

const RAW_ROWS = [
  {
    product_code: '92',
    option_code: '2',
    p_title: '둘째',
    option_title: '',
    barcode: '',
    stock_cnt: '4',
    buy_price: '',
    sale_price: '2,000',
  },
  {
    product_code: '92',
    option_code: '1',
    p_title: '첫째',
    option_title: '블루',
    barcode: '8801234567890',
    stock_cnt: '39',
    buy_price: '1,000',
    sale_price: '2,000',
  },
];

function sourceOrFail(filePath) {
  assert.ok(existsSync(filePath), `${path.relative(repoRoot, filePath)} must exist`);
  return readFileSync(filePath, 'utf8');
}

function responseFromBytes(bytes, {
  contentLength = bytes.byteLength,
  ok = true,
  status = 200,
  url = SNAPSHOT_URL,
  chunks = [bytes],
} = {}) {
  let cancelled = false;
  return {
    ok,
    status,
    redirected: url !== SNAPSHOT_URL,
    url,
    headers: {
      get(name) {
        return String(name).toLowerCase() === 'content-length' && contentLength !== null
          ? String(contentLength)
          : null;
      },
    },
    body: {
      getReader() {
        let index = 0;
        return {
          async read() {
            if (index >= chunks.length) return { done: true, value: undefined };
            return { done: false, value: chunks[index++] };
          },
          async cancel() {
            cancelled = true;
          },
        };
      },
    },
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
    wasCancelled() {
      return cancelled;
    },
  };
}

function snapshotResponse(rows = RAW_ROWS, options = {}) {
  return responseFromBytes(new TextEncoder().encode(JSON.stringify(rows)), options);
}

function pageDocument(state = { login: false }) {
  return {
    querySelector(selector) {
      return selector === 'input[type="password"]' && state.login ? {} : null;
    },
  };
}

function createRuntime({
  existingTab = null,
  document = pageDocument(),
  fetchImpl = async () => snapshotResponse(),
  maxBytes,
  maxRows,
  timeoutMs = 100,
} = {}) {
  const calls = {
    attachTab: [],
    detachTab: [],
    events: [],
    fetch: [],
    query: [],
    create: [],
    remove: [],
    update: [],
    windowUpdate: [],
    executeScript: [],
  };
  const storage = {};
  const tabs = existingTab ? [existingTab] : [];
  let nextTabId = 71;

  const chrome = {
    tabs: {
      async query(query) {
        const patterns = Array.isArray(query?.url) ? query.url : [query?.url];
        if (!patterns.includes(`${PAGE_URL}*`)) return [];
        calls.query.push(structuredClone(query));
        return tabs.map((tab) => ({ ...tab }));
      },
      async create(properties) {
        calls.events.push('create');
        calls.create.push(structuredClone(properties));
        const tab = {
          id: nextTabId++,
          windowId: 9,
          status: 'complete',
          ...properties,
        };
        tabs.push(tab);
        return { ...tab };
      },
      async get(tabId) {
        const tab = tabs.find((candidate) => candidate.id === tabId);
        if (!tab) throw new Error(`No tab with id ${tabId}`);
        return { ...tab, status: 'complete' };
      },
      async remove(tabId) {
        calls.remove.push(tabId);
        const index = tabs.findIndex((tab) => tab.id === tabId);
        if (index < 0) throw new Error(`No tab with id ${tabId}`);
        tabs.splice(index, 1);
      },
      async update(tabId, properties) {
        const tab = tabs.find((candidate) => candidate.id === tabId);
        if (!tab) throw new Error(`No tab with id ${tabId}`);
        calls.update.push({ tabId, properties: structuredClone(properties) });
        Object.assign(tab, properties);
        return { ...tab };
      },
    },
    windows: {
      async update(windowId, properties) {
        calls.windowUpdate.push({ windowId, properties: structuredClone(properties) });
      },
    },
    storage: {
      local: {
        async get(key) {
          return { [key]: structuredClone(storage[key]) };
        },
        async set(values) {
          Object.assign(storage, structuredClone(values));
        },
      },
    },
    scripting: {
      async executeScript(details) {
        calls.events.push('execute');
        calls.executeScript.push(details);
        const pageContext = vm.createContext({
          AbortController,
          ArrayBuffer,
          TextDecoder,
          URL,
          URLSearchParams,
          Uint8Array,
          clearTimeout,
          document,
          fetch: async (...args) => {
            calls.fetch.push(args);
            return fetchImpl(...args);
          },
          location: new URL(PAGE_URL),
          setTimeout,
        });
        const serializedArgs = JSON.stringify(details.args || []);
        const result = await vm.runInContext(
          `(${details.func.toString()})(...${serializedArgs})`,
          pageContext,
        );
        return [{ result }];
      },
    },
  };

  const context = vm.createContext({
    chrome,
    clearTimeout,
    console,
    setTimeout,
    structuredClone,
  });
  vm.runInContext(sourceOrFail(collectorPath), context, { filename: collectorPath });
  const collector = context.KidItemSellpiaInventory.create({
    chrome,
    ...(maxBytes === undefined ? {} : { maxBytes }),
    ...(maxRows === undefined ? {} : { maxRows }),
    timeoutMs,
  });
  const collection = {
    async attachTab(tab, attachment) {
      calls.events.push('attach');
      calls.attachTab.push({ tab: structuredClone(tab), attachment: structuredClone(attachment) });
    },
    async detachTab(tab, attachment) {
      calls.events.push('detach');
      calls.detachTab.push({ tab: structuredClone(tab), attachment: structuredClone(attachment) });
      if (attachment?.owned !== false) await chrome.tabs.remove(tab.id);
    },
  };
  return { calls, chrome, collector, collection, storage, tabs };
}

function createRealLifecycle(browser) {
  const context = vm.createContext({
    chrome: browser.chrome,
    console,
    crypto: { randomUUID: () => 'must-not-be-used' },
    structuredClone,
  });
  vm.runInContext(sourceOrFail(collectionSessionPath), context, {
    filename: collectionSessionPath,
  });
  vm.runInContext(sourceOrFail(lifecyclePath), context, { filename: lifecyclePath });
  let timestamp = 100;
  const sessions = context.KidItemCollectionSession.create({
    chrome: browser.chrome,
    storageKey: 'collectionSessions',
    webUrlPatterns: ['http://localhost:3000/*'],
    now: () => timestamp++,
  });
  const lifecycle = context.KidItemOrderCollectionLifecycle.create({
    sessions,
    producer: 'inventory.sellpia',
    classification: 'background_preferred',
    restartStrategy: 'extension',
    requireRunId: true,
    forceDeferredTerminal: true,
    deferredLabel: 'Sellpia snapshot collected · import in progress',
    classifyFailure(result) {
      if (result?.errorCode === 'sellpia_login_required') return 'marketplace_login';
      if (result?.errorCode === 'sellpia_background_timeout') return 'background_timeout';
      return null;
    },
  });
  return { lifecycle, sessions };
}

function inventoryMessage() {
  return { action: 'collectSellpiaInventory', runId: RUN_ID, deferTerminal: false };
}

function inventoryIdentity() {
  return {
    sourceOrigin: 'https://kiditem.sellpia.com',
    sourceAccountKey: 'kiditem',
  };
}

test('declares the JSON capability, fixed endpoint, full-snapshot fields, and no Excel path', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const source = sourceOrFail(collectorPath);
  const worker = sourceOrFail(workerPath);

  assert.ok(manifest.host_permissions.includes('https://*.sellpia.com/*'));
  assert.match(worker, /importScripts\([\s\S]*["']sellpia-inventory\.js["']/);
  assert.match(worker, /collectSellpiaInventoryJsonV1:\s*true/);
  assert.doesNotMatch(worker, /collectSellpiaInventoryV2:\s*true/);
  assert.match(worker, /msg\?\.action === ["']collectSellpiaInventory["']/);
  assert.match(worker, /producer:\s*["']inventory\.sellpia["']/);
  assert.match(worker, /forceDeferredTerminal:\s*true/);
  assert.match(source, /https:\/\/kiditem\.sellpia\.com\/product_list_total\.html/);
  assert.match(source, /\/product_search\.ajax\.html/);
  assert.match(source, /mode:\s*["']soldout_manager["']/);
  assert.match(source, /soldout_include:\s*["']Y["']/);
  assert.match(source, /limit:\s*["']0["']/);
  assert.doesNotMatch(source, /product_search\.down\.html|downtype|workbookBase64|btoa\(/);
});

test('collects and normalizes a deterministic full JSON snapshot without downloading Excel', async () => {
  const runtime = createRuntime();

  const result = await runtime.collector.collect(runtime.collection);

  assert.equal(result.success, true, JSON.stringify(result));
  assert.deepEqual(JSON.parse(JSON.stringify(result.snapshot)), {
    source: 'sellpia_product_search',
    version: 1,
    rowCount: 2,
    rows: [
      {
        productCode: '92',
        optionCode: '1',
        name: '첫째',
        optionName: '블루',
        barcode: '8801234567890',
        currentStock: 39,
        purchasePrice: 1000,
        salePrice: 2000,
      },
      {
        productCode: '92',
        optionCode: '2',
        name: '둘째',
        optionName: null,
        barcode: null,
        currentStock: 4,
        purchasePrice: null,
        salePrice: 2000,
      },
    ],
  });
  const [url, request] = runtime.calls.fetch[0];
  assert.equal(url, '/product_search.ajax.html');
  assert.equal(request.method, 'POST');
  assert.equal(request.body.get('mode'), 'soldout_manager');
  assert.equal(request.body.get('soldout_include'), 'Y');
  assert.equal(request.body.get('limit'), '0');
});

test('keeps an identity-only row and lets backend quality policy report missing descriptive fields', async () => {
  const runtime = createRuntime({
    fetchImpl: async () => snapshotResponse([{
      product_code: 'NO-OPTION',
      option_code: null,
      p_title: null,
      option_title: null,
      barcode: null,
      stock_cnt: '0',
      buy_price: null,
      sale_price: null,
    }]),
  });

  const result = await runtime.collector.collect(runtime.collection);

  assert.equal(result.success, true, JSON.stringify(result));
  assert.deepEqual(JSON.parse(JSON.stringify(result.snapshot.rows[0])), {
    productCode: 'NO-OPTION',
    optionCode: '',
    name: '',
    optionName: null,
    barcode: null,
    currentStock: 0,
    purchasePrice: null,
    salePrice: null,
  });
});

test('rejects empty, duplicate, malformed, and over-limit full snapshots', async () => {
  const cases = [
    { rows: [], code: 'sellpia_invalid_workbook' },
    { rows: [RAW_ROWS[0], RAW_ROWS[0]], code: 'sellpia_invalid_workbook' },
    { rows: [{ ...RAW_ROWS[0], stock_cnt: '-1' }], code: 'sellpia_invalid_workbook' },
    { rows: 'not-json', code: 'sellpia_invalid_workbook' },
  ];
  for (const { rows, code } of cases) {
    const runtime = createRuntime({
      maxRows: 1,
      fetchImpl: async () => snapshotResponse(rows),
    });
    const result = await runtime.collector.collect(runtime.collection);
    assert.equal(result.errorCode, code, JSON.stringify(result));
  }

  const malformed = new TextEncoder().encode('{bad json');
  const runtime = createRuntime({
    fetchImpl: async () => responseFromBytes(malformed),
  });
  assert.equal(
    (await runtime.collector.collect(runtime.collection)).errorCode,
    'sellpia_download_contract_drift',
  );
});

test('stops a lengthless response stream as soon as it crosses the byte bound', async () => {
  const first = new Uint8Array(40).fill(0x20);
  const second = new Uint8Array(40).fill(0x20);
  const response = responseFromBytes(new Uint8Array(80), {
    contentLength: null,
    chunks: [first, second],
  });
  const runtime = createRuntime({ maxBytes: 64, fetchImpl: async () => response });

  const result = await runtime.collector.collect(runtime.collection);

  assert.equal(result.errorCode, 'sellpia_invalid_workbook');
  assert.equal(response.wasCancelled(), true);
});

test('attaches a created inactive tab before execution and detaches it after success', async () => {
  const runtime = createRuntime();

  const result = await runtime.collector.collect(runtime.collection);

  assert.equal(result.success, true);
  assert.deepEqual(runtime.calls.create, [{ url: PAGE_URL, active: false }]);
  assert.deepEqual(runtime.calls.events, ['create', 'attach', 'execute', 'detach']);
  assert.equal(runtime.tabs.length, 0);
});

test('reuses only an existing inactive exact page and never activates or closes it', async () => {
  const existingTab = { id: 41, windowId: 5, url: PAGE_URL, active: false, status: 'complete' };
  const runtime = createRuntime({ existingTab });

  const result = await runtime.collector.collect(runtime.collection);

  assert.equal(result.success, true);
  assert.equal(runtime.calls.create.length, 0);
  assert.equal(runtime.calls.attachTab.length, 0);
  assert.equal(runtime.calls.detachTab.length, 0);
  assert.equal(runtime.calls.update.length, 0);
  assert.equal(runtime.calls.windowUpdate.length, 0);
  assert.equal(runtime.tabs[0].id, existingTab.id);
});

test('creates a separate inactive managed tab when the only matching page is active', async () => {
  const activeTab = { id: 51, windowId: 6, url: PAGE_URL, active: true, status: 'complete' };
  const runtime = createRuntime({ existingTab: activeTab });

  const result = await runtime.collector.collect(runtime.collection);

  assert.equal(result.success, true);
  assert.deepEqual(runtime.calls.create, [{ url: PAGE_URL, active: false }]);
  assert.equal(runtime.calls.executeScript[0].target.tabId, 71);
  assert.deepEqual(runtime.tabs, [activeTab]);
});

test('keeps only a login-blocked created tab and never exposes response bytes', async () => {
  const secret = '<html><input type="password" value="secret-cookie">';
  const runtime = createRuntime({
    fetchImpl: async () => responseFromBytes(new TextEncoder().encode(secret)),
  });

  const result = await runtime.collector.collect(runtime.collection);

  assert.equal(result.errorCode, 'sellpia_login_required');
  assert.equal(result.pendingLogin, true);
  assert.equal(JSON.stringify(result).includes('secret-cookie'), false);
  assert.equal(runtime.calls.detachTab.length, 0);
  assert.equal(runtime.tabs.length, 1);
});

test('retries a network failure once and returns only a sanitized failure', async () => {
  let attempts = 0;
  const runtime = createRuntime({
    fetchImpl: async () => {
      attempts += 1;
      throw new Error('secret upstream detail');
    },
  });

  const result = await runtime.collector.collect(runtime.collection);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: false,
    errorCode: 'sellpia_network_failed',
    error: 'Sellpia inventory collection failed.',
  });
  assert.equal(attempts, 2);
  assert.equal(JSON.stringify(result).includes('secret upstream detail'), false);
});

test('maps bounded fetch aborts to background attention without retaining the tab', async () => {
  const runtime = createRuntime({
    fetchImpl: async (_url, request) => new Promise((_, reject) => {
      request.signal.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      }, { once: true });
    }),
    timeoutMs: 5,
  });

  const result = await runtime.collector.collect(runtime.collection);

  assert.equal(result.errorCode, 'sellpia_background_timeout');
  assert.equal(runtime.calls.detachTab.length, 1);
  assert.equal(runtime.tabs.length, 0);
});

test('requires the caller run ID, preserves login ownership, restarts cleanly, and defers success', async () => {
  const state = { login: true };
  const browser = createRuntime({ document: pageDocument(state) });
  const { lifecycle } = createRealLifecycle(browser);
  const collect = (collection) => browser.collector.collect(collection);

  const invalid = await lifecycle.run(
    { action: 'collectSellpiaInventory', runId: 'invalid' },
    inventoryIdentity(),
    collect,
  );
  assert.equal(invalid.success, false);
  assert.equal(browser.tabs.length, 0);

  const login = await lifecycle.run(inventoryMessage(), inventoryIdentity(), collect);
  assert.equal(login.collectionSession.status, 'attention_required');
  assert.equal(login.collectionSession.attention.reason, 'marketplace_login');
  assert.equal(browser.tabs.length, 1);
  const loginTabId = browser.tabs[0].id;

  state.login = false;
  const restarted = await lifecycle.run(inventoryMessage(), inventoryIdentity(), collect);
  assert.equal(restarted.success, true);
  assert.equal(restarted.runId, RUN_ID);
  assert.equal(restarted.collectionSession.status, 'running');
  assert.equal(restarted.collectionSession.progress.label, 'Sellpia snapshot collected · import in progress');
  assert.ok(browser.calls.remove.includes(loginTabId));
  assert.equal(browser.tabs.length, 0);

  const finalized = await lifecycle.finalize(
    RUN_ID,
    'succeeded',
    'Sellpia inventory import completed',
  );
  assert.equal(finalized.status, 'succeeded');
});
