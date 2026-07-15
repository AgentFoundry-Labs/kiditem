import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const backgroundRoot = path.join(repoRoot, 'extensions/order-collector/background');
const downloaderPath = path.join(backgroundRoot, 'sellpia-inventory.js');
const lifecyclePath = path.join(backgroundRoot, 'order-collection-lifecycle.js');
const workerPath = path.join(backgroundRoot, 'service-worker.js');
const manifestPath = path.join(repoRoot, 'extensions/order-collector/manifest.json');
const RUN_ID = '0d7f4724-7d5b-4fea-80e3-184dd66884eb';
const PAGE_URL = 'https://kiditem.sellpia.com/product_list_total.html';
const DOWNLOAD_URL = 'https://kiditem.sellpia.com/product_search.down.html';
const FAILURE_CODES = [
  'sellpia_login_required',
  'sellpia_download_contract_drift',
  'sellpia_invalid_workbook',
  'sellpia_background_timeout',
  'sellpia_network_failed',
];
const XLSX_BYTES = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00]);
const XLS_BYTES = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function biffRecord(type, payload = new Uint8Array()) {
  const record = new Uint8Array(4 + payload.byteLength);
  const view = new DataView(record.buffer);
  view.setUint16(0, type, true);
  view.setUint16(2, payload.byteLength, true);
  record.set(payload, 4);
  return record;
}

function rawBiffBof({ version = 0x0500, subtype = 0x0010, size = 8 } = {}) {
  const payload = new Uint8Array(size);
  const view = new DataView(payload.buffer);
  if (size >= 2) view.setUint16(0, version, true);
  if (size >= 4) view.setUint16(2, subtype, true);
  return biffRecord(0x0809, payload);
}

function rawBiffWorksheet() {
  return Uint8Array.from([
    ...rawBiffBof(),
    ...biffRecord(0x0204, Uint8Array.from([0x00, 0x00, 0x00, 0x00, 0x01])),
    ...biffRecord(0x000a),
  ]);
}

function sourceOrFail(filePath) {
  assert.ok(existsSync(filePath), `${path.relative(repoRoot, filePath)} must exist`);
  return readFileSync(filePath, 'utf8');
}

function workbookResponse({
  bytes = XLSX_BYTES,
  contentDisposition = "attachment; filename*=UTF-8''sellpia-option-products.xlsx",
  contentLength = bytes.byteLength,
  contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ok = true,
  status = 200,
  url = DOWNLOAD_URL,
} = {}) {
  return {
    ok,
    status,
    redirected: url !== DOWNLOAD_URL,
    url,
    headers: {
      get(name) {
        const key = String(name).toLowerCase();
        if (key === 'content-disposition') return contentDisposition;
        if (key === 'content-type') return contentType;
        if (key === 'content-length') {
          return contentLength === null ? null : String(contentLength);
        }
        return null;
      },
    },
    body: {
      getReader() {
        let sent = false;
        return {
          async read() {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: bytes };
          },
          async cancel() {},
        };
      },
    },
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

function createPageDocument({ login = false, drift = false } = {}) {
  if (login) {
    return {
      querySelector(selector) {
        return selector === 'input[type="password"]' ? {} : null;
      },
    };
  }
  if (drift) return { querySelector: () => null };

  const downopt = {
    querySelector(selector) {
      return selector === 'option[value="2"]' ? {} : null;
    },
  };
  const form = {
    getAttribute(name) {
      if (name === 'method') return 'post';
      if (name === 'action') return '/product_search.down.html';
      return null;
    },
    querySelector(selector) {
      if (selector === '#downopt[name="downopt"]') return downopt;
      if (selector === '[name="downtype"][value="excel"]') return {};
      if (selector === '#down_act') return {};
      return null;
    },
  };
  const modal = {
    querySelector(selector) {
      return selector === '#downForm' ? form : null;
    },
  };
  return {
    querySelector(selector) {
      if (selector === 'input[type="password"]') return null;
      if (selector === '#div_prod_down') return modal;
      return null;
    },
  };
}

function createMutableLoginDocument(state) {
  const authenticated = createPageDocument();
  return {
    querySelector(selector) {
      if (selector === 'input[type="password"]' && state.login) return {};
      return authenticated.querySelector(selector);
    },
  };
}

function createRuntime({
  existingTab = null,
  document = createPageDocument(),
  fetchImpl = async () => workbookResponse(),
  maxBytes,
  timeoutMs = 100,
} = {}) {
  const source = sourceOrFail(downloaderPath);
  const calls = {
    attachTab: [],
    fetch: [],
    query: [],
    create: [],
    remove: [],
    executeScript: [],
    executeErrors: [],
  };
  const tabs = existingTab ? [existingTab] : [];
  let nextTabId = 71;
  let context;

  const chrome = {
    tabs: {
      async query(query) {
        calls.query.push(structuredClone(query));
        return tabs.map((tab) => ({ ...tab }));
      },
      async create(properties) {
        calls.create.push(structuredClone(properties));
        while (tabs.some((tab) => tab.id === nextTabId)) nextTabId += 1;
        const tab = { id: nextTabId++, windowId: 9, status: 'complete', ...properties };
        tabs.push(tab);
        return { ...tab };
      },
      async get(tabId) {
        return { ...tabs.find((tab) => tab.id === tabId), status: 'complete' };
      },
      async remove(tabId) {
        calls.remove.push(tabId);
        const index = tabs.findIndex((tab) => tab.id === tabId);
        if (index >= 0) tabs.splice(index, 1);
      },
    },
    scripting: {
      async executeScript(details) {
        calls.executeScript.push(details);
        const pageContext = vm.createContext({
          AbortController,
          ArrayBuffer,
          TextDecoder,
          URL,
          URLSearchParams,
          Uint8Array,
          btoa,
          clearTimeout,
          document,
          fetch: async (...args) => {
            calls.fetch.push(args);
            return fetchImpl(...args);
          },
          location: new URL(PAGE_URL),
          setTimeout,
        });
        pageContext.location.href = PAGE_URL;
        const serializedArgs = JSON.stringify(details.args || []);
        try {
          const result = await vm.runInContext(
            `(${details.func.toString()})(...${serializedArgs})`,
            pageContext,
          );
          return [{ result }];
        } catch (error) {
          calls.executeErrors.push(error);
          throw error;
        }
      },
    },
  };
  context = vm.createContext({
    chrome,
    clearTimeout,
    console,
    setTimeout,
    structuredClone,
  });
  vm.runInContext(source, context, { filename: downloaderPath });
  const collector = context.KidItemSellpiaInventory.create({
    chrome,
    ...(maxBytes === undefined ? {} : { maxBytes }),
    timeoutMs,
  });
  const collection = {
    async attachTab(tab, attachment) {
      calls.attachTab.push({ tab: structuredClone(tab), attachment: structuredClone(attachment) });
    },
  };
  return { calls, chrome, collector, collection, tabs };
}

function createLifecycleRuntime({ closeTab = async () => {} } = {}) {
  const source = readFileSync(lifecyclePath, 'utf8');
  const calls = {
    start: [],
    restart: [],
    attachTab: [],
    closedTabs: [],
    attention: [],
    fail: [],
    succeed: [],
  };
  const sessions = new Map();
  const view = (session) => structuredClone(session);
  const sessionManager = {
    async get(runId) {
      return sessions.has(runId) ? view(sessions.get(runId)) : null;
    },
    async start(input) {
      calls.start.push(structuredClone(input));
      const session = {
        ...structuredClone(input),
        status: 'running',
        attempt: 1,
        progress: { current: 0, total: 0, completed: 0, failed: 0, label: null },
        attention: null,
      };
      sessions.set(input.runId, session);
      return view(session);
    },
    async restart(runId, options) {
      calls.restart.push({ runId, options: structuredClone(options) });
      const session = sessions.get(runId);
      if (
        options?.closeManagedTab === true
        && Number.isInteger(session._managedTabId)
        && session._managedTabCloseOnRestart !== false
      ) {
        calls.closedTabs.push(session._managedTabId);
        await closeTab(session._managedTabId);
      }
      delete session._managedTabId;
      delete session._managedWindowId;
      delete session._managedTabCloseOnRestart;
      session.status = 'running';
      session.attempt += 1;
      session.attention = null;
      return view(session);
    },
    async attachTab(runId, attachment) {
      calls.attachTab.push({ runId, attachment: structuredClone(attachment) });
      const session = sessions.get(runId);
      session._managedTabId = attachment.tabId;
      session._managedWindowId = attachment.windowId;
      session._managedTabCloseOnRestart = attachment.closeOnRestart !== false;
      return view(session);
    },
    async progress(runId, progress) {
      const session = sessions.get(runId);
      session.status = 'running';
      session.progress = structuredClone(progress);
      return view(session);
    },
    async requireAttention(runId, attention) {
      calls.attention.push({ runId, attention: structuredClone(attention) });
      const session = sessions.get(runId);
      session.status = 'attention_required';
      session.attention = { ...structuredClone(attention), canOpenTab: false };
      return view(session);
    },
    async fail(runId) {
      calls.fail.push(runId);
      const session = sessions.get(runId);
      session.status = 'failed';
      return view(session);
    },
    async succeed(runId) {
      calls.succeed.push(runId);
      const session = sessions.get(runId);
      session.status = 'succeeded';
      return view(session);
    },
    async cancel(runId, options) {
      const session = sessions.get(runId);
      if (
        options?.closeManagedTab === true
        && Number.isInteger(session?._managedTabId)
        && session._managedTabCloseOnRestart !== false
      ) {
        calls.closedTabs.push(session._managedTabId);
        await closeTab(session._managedTabId);
      }
      if (session) session.status = 'cancelled';
      return session ? view(session) : null;
    },
  };
  const context = vm.createContext({ console, crypto: { randomUUID: () => 'must-not-be-used' } });
  vm.runInContext(source, context, { filename: lifecyclePath });
  const lifecycle = context.KidItemOrderCollectionLifecycle.create({
    sessions: sessionManager,
    producer: 'inventory.sellpia',
    classification: 'background_preferred',
    restartStrategy: 'extension',
    requireRunId: true,
    forceDeferredTerminal: true,
    deferredLabel: 'Sellpia workbook downloaded · import in progress',
    classifyFailure(result) {
      if (result?.errorCode === 'sellpia_login_required') return 'marketplace_login';
      if (result?.errorCode === 'sellpia_background_timeout') return 'background_timeout';
      return null;
    },
  });
  return { calls, lifecycle, sessions };
}

test('declares the exact inventory command, manifest host, module, producer, and dispatch contract', () => {
  const command = {
    action: 'collectSellpiaInventory',
    runId: RUN_ID,
    deferTerminal: true,
  };
  assert.deepEqual(command, {
    action: 'collectSellpiaInventory',
    runId: '0d7f4724-7d5b-4fea-80e3-184dd66884eb',
    deferTerminal: true,
  });

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.ok(manifest.host_permissions.includes('https://*.sellpia.com/*'));
  const source = sourceOrFail(downloaderPath);
  const lifecycle = readFileSync(lifecyclePath, 'utf8');
  const worker = readFileSync(workerPath, 'utf8');
  assert.match(worker, /importScripts\([\s\S]*["']sellpia-inventory\.js["']/);
  assert.match(worker, /collectSellpiaInventory:\s*true/);
  assert.match(worker, /msg\?\.action === ["']collectSellpiaInventory["']/);
  assert.match(worker, /producer:\s*["']inventory\.sellpia["']/);
  assert.match(worker, /forceDeferredTerminal:\s*true/);
  assert.match(lifecycle, /options\.producer/);
  assert.match(source, /https:\/\/kiditem\.sellpia\.com\/product_list_total\.html/);
  assert.match(source, /\/product_search\.down\.html/);
  assert.match(source, /downopt:\s*["']2["']/);
  assert.match(source, /downtype:\s*["']excel["']/);
  assert.match(source, /#div_prod_down/);
  assert.match(source, /#downForm/);
  assert.match(source, /#down_act/);
  for (const code of FAILURE_CODES) assert.match(source, new RegExp(code));
});

test('persists the caller run ID before work and restarts the same inventory producer from zero', async () => {
  const runtime = createLifecycleRuntime();
  const message = { action: 'collectSellpiaInventory', runId: RUN_ID, deferTerminal: true };
  const identity = {
    sourceOrigin: 'https://kiditem.sellpia.com',
    sourceAccountKey: 'kiditem',
  };

  const first = await runtime.lifecycle.run(message, identity, async () => ({ success: true }));
  const restarted = await runtime.lifecycle.run(message, identity, async () => ({ success: true }));

  assert.equal(first.runId, RUN_ID);
  assert.equal(restarted.runId, RUN_ID);
  assert.equal(runtime.calls.start.length, 1);
  assert.deepEqual(runtime.calls.start[0], {
    runId: RUN_ID,
    producer: 'inventory.sellpia',
    classification: 'background_preferred',
    restartStrategy: 'extension',
    inputIdentity: identity,
  });
  assert.deepEqual(runtime.calls.restart, [{
    runId: RUN_ID,
    options: { closeManagedTab: true },
  }]);
  assert.equal(restarted.collectionSession.attempt, 2);
  assert.equal(
    restarted.collectionSession.progress.label,
    'Sellpia workbook downloaded · import in progress',
  );
});

test('hard-forces deferred terminal behavior when the external command omits or falsifies the flag', async () => {
  for (const deferTerminal of [undefined, false]) {
    const runtime = createLifecycleRuntime();
    const message = {
      action: 'collectSellpiaInventory',
      runId: RUN_ID,
      ...(deferTerminal === undefined ? {} : { deferTerminal }),
    };

    const collected = await runtime.lifecycle.run(
      message,
      { sourceOrigin: 'https://kiditem.sellpia.com', sourceAccountKey: 'kiditem' },
      async () => ({ success: true, workbookBase64: 'bounded-test-bytes' }),
    );

    assert.equal(collected.collectionSession.status, 'running');
    assert.equal(collected.collectionSession.progress.current, 1);
    assert.equal(runtime.calls.succeed.length, 0);

    const finalized = await runtime.lifecycle.finalize(
      RUN_ID,
      'succeeded',
      'Sellpia inventory import completed',
    );
    assert.equal(finalized.status, 'succeeded');
    assert.deepEqual(runtime.calls.succeed, [RUN_ID]);
  }
});

test('rejects an invalid inventory run ID before creating a browser session', async () => {
  const runtime = createLifecycleRuntime();

  const result = await runtime.lifecycle.run(
    { action: 'collectSellpiaInventory', runId: 'not-a-claim-token', deferTerminal: true },
    { sourceOrigin: 'https://kiditem.sellpia.com', sourceAccountKey: 'kiditem' },
    async () => ({ success: true }),
  );

  assert.equal(result.success, false);
  assert.equal(result.error, 'Collection run ID is required');
  assert.deepEqual(runtime.calls.start, []);
});

test('rejects same-run restart under a different fixed Sellpia source identity', async () => {
  const runtime = createLifecycleRuntime();
  const message = { action: 'collectSellpiaInventory', runId: RUN_ID, deferTerminal: true };
  await runtime.lifecycle.run(
    message,
    { sourceOrigin: 'https://kiditem.sellpia.com', sourceAccountKey: 'kiditem' },
    async () => ({ success: true }),
  );

  const rejected = await runtime.lifecycle.run(
    message,
    { sourceOrigin: 'https://kiditem.sellpia.com', sourceAccountKey: 'other-account' },
    async () => ({ success: true }),
  );

  assert.equal(rejected.success, false);
  assert.match(rejected.error, /does not belong to this producer input/);
  assert.equal(runtime.calls.restart.length, 0);
});

test('uses caller-supplied Sellpia error classification and fails non-attention errors immediately', async () => {
  for (const [errorCode, reason] of [
    ['sellpia_login_required', 'marketplace_login'],
    ['sellpia_background_timeout', 'background_timeout'],
  ]) {
    const runtime = createLifecycleRuntime();
    const result = await runtime.lifecycle.run(
      { action: 'collectSellpiaInventory', runId: RUN_ID, deferTerminal: true },
      { sourceAccountKey: 'kiditem' },
      async () => ({ success: false, errorCode, error: 'sanitized' }),
    );
    assert.equal(result.collectionSession.status, 'attention_required');
    assert.equal(result.collectionSession.attention.reason, reason);
    assert.equal(result.errorCode, errorCode);
  }

  const immediate = createLifecycleRuntime();
  const result = await immediate.lifecycle.run(
    { action: 'collectSellpiaInventory', runId: RUN_ID, deferTerminal: true },
    { sourceAccountKey: 'kiditem' },
    async () => ({
      success: false,
      errorCode: 'sellpia_invalid_workbook',
      error: 'Sellpia returned an invalid workbook.',
    }),
  );
  assert.equal(result.collectionSession.status, 'failed');
  assert.deepEqual(immediate.calls.fail, [RUN_ID]);
});

test('downloads raw workbook bytes from the fixed POST contract in an inactive created tab', async () => {
  const runtime = createRuntime();

  const result = await runtime.collector.collect(runtime.collection);

  assert.equal(
    result.success,
    true,
    runtime.calls.executeErrors[0]?.stack || JSON.stringify(result),
  );
  assert.equal(result.workbookBase64, Buffer.from(XLSX_BYTES).toString('base64'));
  assert.equal(result.fileName, 'sellpia-option-products.xlsx');
  assert.equal(result.mimeType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(result.size, XLSX_BYTES.byteLength);
  assert.equal(result.sourceOrigin, 'https://kiditem.sellpia.com');
  assert.equal(result.sourceAccountKey, 'kiditem');
  assert.deepEqual(runtime.calls.query, [{ url: ['https://kiditem.sellpia.com/product_list_total.html*'] }]);
  assert.deepEqual(runtime.calls.create, [{ url: PAGE_URL, active: false }]);
  assert.equal(runtime.calls.executeScript[0].target.tabId, 71);
  assert.equal(runtime.calls.fetch.length, 1);
  const [target, options] = runtime.calls.fetch[0];
  assert.equal(target, '/product_search.down.html');
  assert.equal(options.method, 'POST');
  assert.equal(options.body.toString(), 'downopt=2&downtype=excel');
  assert.deepEqual(runtime.calls.attachTab, [{
    tab: { id: 71, windowId: 9, status: 'complete', url: PAGE_URL, active: false },
    attachment: { owned: true },
  }]);
  assert.deepEqual(runtime.calls.remove, [71]);
});

test('persists a newly created inactive tab before readiness checks or page execution', async () => {
  const runtime = createRuntime();
  let releaseAttachment;
  let attachmentStarted;
  const started = new Promise((resolve) => {
    attachmentStarted = resolve;
  });
  const attachmentGate = new Promise((resolve) => {
    releaseAttachment = resolve;
  });
  runtime.collection.attachTab = async (tab, attachment) => {
    runtime.calls.attachTab.push({
      tab: structuredClone(tab),
      attachment: structuredClone(attachment),
    });
    attachmentStarted();
    await attachmentGate;
  };

  const pending = runtime.collector.collect(runtime.collection);
  const attachmentObserved = await Promise.race([
    started.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 50)),
  ]);

  assert.equal(attachmentObserved, true);
  assert.deepEqual(runtime.calls.create, [{ url: PAGE_URL, active: false }]);
  assert.equal(runtime.calls.executeScript.length, 0);
  assert.deepEqual(runtime.calls.attachTab[0].attachment, { owned: true });

  releaseAttachment();
  const result = await pending;
  assert.equal(result.success, true);
  assert.deepEqual(runtime.calls.remove, [71]);
});

test('accepts a bounded workbook when fetch omits the optional content-length header', async () => {
  const runtime = createRuntime({
    fetchImpl: async () => workbookResponse({ contentLength: null }),
  });

  const result = await runtime.collector.collect(runtime.collection);

  assert.equal(result.success, true);
  assert.equal(result.size, XLSX_BYTES.byteLength);
});

test('stops a lengthless response stream as soon as it crosses the workbook byte bound', async () => {
  let nextChunk = 0;
  let cancelled = false;
  let arrayBufferCalled = false;
  const chunks = [XLSX_BYTES, Uint8Array.from([0x00])];
  const response = workbookResponse({ contentLength: null });
  response.body = {
    getReader() {
      return {
        async read() {
          if (nextChunk >= chunks.length) return { done: true, value: undefined };
          return { done: false, value: chunks[nextChunk++] };
        },
        async cancel() {
          cancelled = true;
        },
      };
    },
  };
  response.arrayBuffer = async () => {
    arrayBufferCalled = true;
    throw new Error('unbounded fallback must not run');
  };
  const runtime = createRuntime({
    maxBytes: 8,
    fetchImpl: async () => response,
  });

  const result = await runtime.collector.collect(runtime.collection);

  assert.equal(result.errorCode, 'sellpia_invalid_workbook');
  assert.equal(nextChunk, 2);
  assert.equal(cancelled, true);
  assert.equal(arrayBufferCalled, false);
});

test('reuses an existing Sellpia page without activating, focusing, or closing it', async () => {
  const existingTab = { id: 55, windowId: 4, url: PAGE_URL, active: false, status: 'complete' };
  const runtime = createRuntime({ existingTab });

  const result = await runtime.collector.collect(runtime.collection);

  assert.equal(result.success, true);
  assert.deepEqual(runtime.calls.create, []);
  assert.deepEqual(runtime.calls.remove, []);
  assert.deepEqual(runtime.calls.attachTab, []);
  assert.equal(runtime.calls.executeScript[0].target.tabId, 55);
});

test('never executes in an active matching Sellpia tab and creates a separate inactive tab', async () => {
  const foregroundTab = {
    id: 55,
    windowId: 4,
    url: PAGE_URL,
    active: true,
    status: 'complete',
  };
  const runtime = createRuntime({ existingTab: foregroundTab });

  const result = await runtime.collector.collect(runtime.collection);

  assert.equal(result.success, true);
  assert.deepEqual(runtime.calls.create, [{ url: PAGE_URL, active: false }]);
  assert.equal(runtime.calls.executeScript.length, 1);
  assert.equal(runtime.calls.executeScript[0].target.tabId, 71);
  assert.deepEqual(runtime.calls.attachTab, [{
    tab: { id: 71, windowId: 9, status: 'complete', url: PAGE_URL, active: false },
    attachment: { owned: true },
  }]);
  assert.deepEqual(runtime.calls.remove, [71]);
  assert.deepEqual(runtime.tabs.map((tab) => tab.id), [55]);
});

test('same-run restart closes the owned login tab and creates a fresh inactive managed tab', async () => {
  const pageState = { login: true };
  const browser = createRuntime({ document: createMutableLoginDocument(pageState) });
  const sessions = createLifecycleRuntime({
    closeTab: (tabId) => browser.chrome.tabs.remove(tabId),
  });
  const message = { action: 'collectSellpiaInventory', runId: RUN_ID, deferTerminal: true };
  const identity = {
    sourceOrigin: 'https://kiditem.sellpia.com',
    sourceAccountKey: 'kiditem',
  };

  const attention = await sessions.lifecycle.run(
    message,
    identity,
    (collection) => browser.collector.collect(collection),
  );
  assert.equal(attention.collectionSession.status, 'attention_required');
  assert.deepEqual(browser.tabs.map((tab) => tab.id), [71]);

  pageState.login = false;
  const restarted = await sessions.lifecycle.run(
    message,
    identity,
    (collection) => browser.collector.collect(collection),
  );

  assert.equal(restarted.collectionSession.status, 'running');
  assert.deepEqual(sessions.calls.closedTabs, [71]);
  assert.deepEqual(browser.calls.create, [
    { url: PAGE_URL, active: false },
    { url: PAGE_URL, active: false },
  ]);
  assert.deepEqual(
    sessions.calls.attachTab.map((call) => ({
      tabId: call.attachment.tabId,
      closeOnRestart: call.attachment.closeOnRestart,
    })),
    [
      { tabId: 71, closeOnRestart: true },
      { tabId: 72, closeOnRestart: true },
    ],
  );
  assert.deepEqual(browser.calls.remove, [71, 72]);
  assert.deepEqual(browser.tabs, []);
});

test('parses encoded and quoted workbook filenames without returning response headers', async () => {
  const encoded = createRuntime({
    fetchImpl: async () => workbookResponse({
      bytes: XLS_BYTES,
      contentDisposition: "attachment; filename*=UTF-8''%EC%98%B5%EC%85%98%EC%83%81%ED%92%88.xls",
    }),
  });
  const encodedResult = await encoded.collector.collect(encoded.collection);
  assert.equal(encodedResult.fileName, '옵션상품.xls');
  assert.equal(encodedResult.mimeType, 'application/vnd.ms-excel');
  assert.equal(encodedResult.headers, undefined);

  const quoted = createRuntime({
    fetchImpl: async () => workbookResponse({
      contentDisposition: 'attachment; filename="inventory.xlsx"',
    }),
  });
  const quotedResult = await quoted.collector.collect(quoted.collection);
  assert.equal(quotedResult.fileName, 'inventory.xlsx');
});

test('accepts a fully bounded raw BIFF worksheet stream from the authorized Sellpia contract', async () => {
  const bytes = rawBiffWorksheet();
  const runtime = createRuntime({
    fetchImpl: async () => workbookResponse({
      bytes,
      contentDisposition: 'attachment; filename="sellpia-option-products.xls"',
      contentType: 'application/vnd.ms-excel',
    }),
  });

  const result = await runtime.collector.collect(runtime.collection);

  assert.equal(result.success, true);
  assert.equal(result.fileName, 'sellpia-option-products.xls');
  assert.equal(result.mimeType, 'application/vnd.ms-excel');
  assert.equal(result.size, bytes.byteLength);
  assert.equal(result.workbookBase64, Buffer.from(bytes).toString('base64'));
});

test('rejects prefix-only, truncated, missing-EOF, and structurally invalid raw BIFF streams', async () => {
  const oversizedPayload = new Uint8Array(8_225);
  const invalidStreams = [
    rawBiffBof(),
    Uint8Array.from([...rawBiffBof(), 0x04, 0x02, 0x01]),
    Uint8Array.from([...rawBiffBof(), ...biffRecord(0x0204, Uint8Array.from([1, 2])).subarray(0, 5)]),
    Uint8Array.from([...rawBiffBof(), ...biffRecord(0x0204, Uint8Array.from([1]))]),
    Uint8Array.from([...rawBiffWorksheet(), 0x00]),
    Uint8Array.from([...rawBiffBof({ subtype: 0x0005 }), ...biffRecord(0x0204, Uint8Array.from([1])), ...biffRecord(0x000a)]),
    Uint8Array.from([...rawBiffBof({ version: 0x1234 }), ...biffRecord(0x0204, Uint8Array.from([1])), ...biffRecord(0x000a)]),
    Uint8Array.from([...rawBiffBof(), ...rawBiffBof(), ...biffRecord(0x0204, Uint8Array.from([1])), ...biffRecord(0x000a)]),
    Uint8Array.from([...rawBiffBof(), ...biffRecord(0x0204, oversizedPayload), ...biffRecord(0x000a)]),
    Uint8Array.from([...rawBiffBof(), ...biffRecord(0x000a)]),
  ];

  for (const [index, bytes] of invalidStreams.entries()) {
    const runtime = createRuntime({
      fetchImpl: async () => workbookResponse({
        bytes,
        contentDisposition: 'attachment; filename="sellpia-option-products.xls"',
        contentType: 'application/vnd.ms-excel',
      }),
    });
    const result = await runtime.collector.collect(runtime.collection);
    assert.equal(result.errorCode, 'sellpia_invalid_workbook', `invalid stream ${index}`);
    assert.equal(result.workbookBase64, undefined, `invalid stream ${index}`);
  }
});

test('keeps only a login-blocked inactive tab for explicit attention', async () => {
  const runtime = createRuntime({ document: createPageDocument({ login: true }) });

  const result = await runtime.collector.collect(runtime.collection);

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: false,
    errorCode: 'sellpia_login_required',
    pendingLogin: true,
    error: 'Sellpia login is required.',
  });
  assert.deepEqual(runtime.calls.attachTab, [{
    tab: { id: 71, windowId: 9, status: 'complete', url: PAGE_URL, active: false },
    attachment: { owned: true },
  }]);
  assert.deepEqual(runtime.calls.remove, []);
});

test('rejects HTML/login responses without exposing their body', async () => {
  const html = new TextEncoder().encode('<html>secret login form</html>');
  const runtime = createRuntime({
    fetchImpl: async () => workbookResponse({
      bytes: html,
      contentDisposition: null,
      contentType: 'text/html; charset=utf-8',
    }),
  });

  const result = await runtime.collector.collect(runtime.collection);

  assert.equal(result.errorCode, 'sellpia_login_required');
  assert.equal(JSON.stringify(result).includes('secret login form'), false);
  assert.equal(result.workbookBase64, undefined);
});

test('fails immediately when the observed form contract drifts', async () => {
  let fetchCount = 0;
  const runtime = createRuntime({
    document: createPageDocument({ drift: true }),
    fetchImpl: async () => {
      fetchCount += 1;
      return workbookResponse();
    },
  });

  const result = await runtime.collector.collect(runtime.collection);

  assert.equal(result.errorCode, 'sellpia_download_contract_drift');
  assert.equal(fetchCount, 0);
  assert.deepEqual(runtime.calls.remove, [71]);
});

test('rejects missing download disposition, invalid magic, and over-limit bytes', async () => {
  const missingDisposition = createRuntime({
    fetchImpl: async () => workbookResponse({ contentDisposition: null }),
  });
  assert.equal(
    (await missingDisposition.collector.collect(missingDisposition.collection)).errorCode,
    'sellpia_download_contract_drift',
  );

  const invalidMagic = createRuntime({
    fetchImpl: async () => workbookResponse({ bytes: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]) }),
  });
  assert.equal(
    (await invalidMagic.collector.collect(invalidMagic.collection)).errorCode,
    'sellpia_invalid_workbook',
  );

  const tooLarge = createRuntime({
    maxBytes: 8,
    fetchImpl: async () => workbookResponse({
      bytes: Uint8Array.from([...XLSX_BYTES, 0x00]),
    }),
  });
  assert.equal(
    (await tooLarge.collector.collect(tooLarge.collection)).errorCode,
    'sellpia_invalid_workbook',
  );
});

test('retries network failure once, then returns only the sanitized prefixed failure', async () => {
  let attempts = 0;
  const runtime = createRuntime({
    fetchImpl: async () => {
      attempts += 1;
      throw new Error(`raw network secret ${attempts}`);
    },
  });

  const result = await runtime.collector.collect(runtime.collection);

  assert.equal(attempts, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    success: false,
    errorCode: 'sellpia_network_failed',
    error: 'Sellpia workbook download failed.',
  });
  assert.deepEqual(runtime.calls.remove, [71]);
});

test('maps bounded fetch aborts to background attention without retaining the created tab', async () => {
  const runtime = createRuntime({
    timeoutMs: 5,
    fetchImpl: (_target, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('raw timeout detail');
        error.name = 'AbortError';
        reject(error);
      });
    }),
  });

  const result = await runtime.collector.collect(runtime.collection);

  assert.equal(result.errorCode, 'sellpia_background_timeout');
  assert.equal(result.error, 'Sellpia background download timed out.');
  assert.equal(result.pendingLogin, undefined);
  assert.deepEqual(runtime.calls.attachTab, [{
    tab: { id: 71, windowId: 9, status: 'complete', url: PAGE_URL, active: false },
    attachment: { owned: true },
  }]);
  assert.deepEqual(runtime.calls.remove, [71]);
});
