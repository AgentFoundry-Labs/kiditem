import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const backgroundRoot = path.join(repoRoot, 'extensions/order-collector/background');
const sessionModulePath = path.join(backgroundRoot, 'coupang-po-session.js');
const workerPath = path.join(backgroundRoot, 'service-worker.js');
const rocketModulePath = path.join(backgroundRoot, 'rocket-po-collection.js');
const BOOTSTRAP_URL = 'https://supplier.coupang.com/scm/purchase/order/list';

function loadSessionModule() {
  assert.equal(
    existsSync(sessionModulePath),
    true,
    'Coupang PO session module must exist before Rocket collectors can use it',
  );
  const sandbox = { URL, console };
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(readFileSync(sessionModulePath, 'utf8'), context, {
    filename: sessionModulePath,
  });
  return context.KidItemCoupangPoSession;
}

function createHarness({ tabs, finalCreatedUrl, finalCreatedUrls, executeResults }) {
  const calls = { create: [], attach: [], detach: [], execute: [] };
  let nextTabId = 100;
  const chrome = {
    tabs: {
      async query() {
        return tabs.map((tab) => ({ ...tab }));
      },
      async create(properties) {
        calls.create.push({ ...properties });
        return { id: nextTabId++, windowId: 7, ...properties };
      },
      async get(tabId) {
        const existing = tabs.find((tab) => tab.id === tabId);
        return existing
          ? { ...existing }
          : {
            id: tabId,
            windowId: 7,
            url: finalCreatedUrls?.[tabId - 100] ?? finalCreatedUrl ?? BOOTSTRAP_URL,
          };
      },
    },
  };
  const collection = {
    runId: '11111111-1111-4111-8111-111111111111',
    async detachTab(tab, options) {
      calls.detach.push({ tab: { ...tab }, options: { ...options } });
    },
  };
  const session = loadSessionModule().create({
    chrome,
    async attachOrderCollectionTab(receivedCollection, tab, created) {
      calls.attach.push({ receivedCollection, tab: { ...tab }, created });
    },
    async waitForTabReady() {},
  });
  let executeIndex = 0;
  const execute = async (tab) => {
    calls.execute.push({ ...tab });
    const result = executeResults[executeIndex];
    executeIndex += 1;
    return result;
  };
  return { calls, collection, execute, session };
}

test('dashboard-only state creates an inactive managed PO bootstrap tab before collection', async () => {
  const harness = createHarness({
    tabs: [{ id: 1, active: true, url: 'https://supplier.coupang.com/dashboard/KR' }],
    finalCreatedUrl: 'https://supplier.coupang.com/po-web/purchase/order/list',
    executeResults: [{ success: true, pos: [] }],
  });

  const result = await harness.session.run(harness.collection, harness.execute);

  assert.equal(result.success, true);
  assert.deepEqual(harness.calls.create, [{ url: BOOTSTRAP_URL, active: false }]);
  assert.equal(harness.calls.execute.length, 1);
  assert.equal(harness.calls.execute[0].id, 100);
  assert.equal(harness.calls.attach.length, 1);
  assert.equal(harness.calls.attach[0].created, true);
  assert.deepEqual(
    harness.calls.detach.map(({ tab, options }) => ({ id: tab.id, owned: options.owned })),
    [{ id: 100, owned: true }],
  );
});

test('an existing PO tab is reused but a session failure retries once in a new managed tab', async () => {
  const harness = createHarness({
    tabs: [{ id: 9, active: false, url: 'https://supplier.coupang.com/po-web/purchase/order/list' }],
    finalCreatedUrl: 'https://supplier.coupang.com/po-web/purchase/order/list',
    executeResults: [
      { success: false, errorCode: 'coupang_po_session_required' },
      { success: true, pos: [] },
    ],
  });

  const result = await harness.session.run(harness.collection, harness.execute);

  assert.equal(result.success, true);
  assert.deepEqual(harness.calls.execute.map((tab) => tab.id), [9, 100]);
  assert.equal(harness.calls.create.length, 1);
  assert.equal(harness.calls.attach[0].created, false);
  assert.equal(harness.calls.attach[1].created, true);
});

test('a failed created PO tab is released before the one fresh-tab retry', async () => {
  const harness = createHarness({
    tabs: [{ id: 1, active: true, url: 'https://supplier.coupang.com/dashboard/KR' }],
    finalCreatedUrl: 'https://supplier.coupang.com/po-web/purchase/order/list',
    executeResults: [
      { success: false, errorCode: 'coupang_po_session_required' },
      { success: true, pos: [] },
    ],
  });

  const result = await harness.session.run(harness.collection, harness.execute);

  assert.equal(result.success, true);
  assert.deepEqual(harness.calls.create, [
    { url: BOOTSTRAP_URL, active: false },
    { url: BOOTSTRAP_URL, active: false },
  ]);
  assert.deepEqual(
    harness.calls.detach.map(({ tab, options }) => ({ id: tab.id, owned: options.owned })),
    [
      { id: 100, owned: true },
      { id: 101, owned: true },
    ],
  );
});

test('a bootstrap redirect back to the dashboard blocks collection with a structured session error', async () => {
  const harness = createHarness({
    tabs: [{ id: 1, active: true, url: 'https://supplier.coupang.com/dashboard/KR' }],
    finalCreatedUrl: 'https://supplier.coupang.com/dashboard/KR',
    executeResults: [{ success: true, pos: [{ poSeq: 1 }] }],
  });

  const result = await harness.session.run(harness.collection, harness.execute);

  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'coupang_po_session_required');
  assert.equal(result.pendingLogin, true);
  assert.equal(harness.calls.execute.length, 0);
});

test('a first bootstrap redirect retries once in a fresh tab after Coupang initializes SSO', async () => {
  const harness = createHarness({
    tabs: [{ id: 1, active: true, url: 'https://supplier.coupang.com/dashboard/KR' }],
    finalCreatedUrls: [
      'https://supplier.coupang.com/dashboard/KR',
      'https://supplier.coupang.com/po-web/purchase/order/list',
    ],
    executeResults: [{ success: true, pos: [] }],
  });

  const result = await harness.session.run(harness.collection, harness.execute);

  assert.equal(result.success, true);
  assert.deepEqual(harness.calls.execute.map((tab) => tab.id), [101]);
  assert.deepEqual(harness.calls.create, [
    { url: BOOTSTRAP_URL, active: false },
    { url: BOOTSTRAP_URL, active: false },
  ]);
  assert.deepEqual(
    harness.calls.detach.map(({ tab, options }) => ({ id: tab.id, owned: options.owned })),
    [
      { id: 100, owned: true },
      { id: 101, owned: true },
    ],
  );
});

test('a failed fresh-tab retry returns only the public session error and retains that tab', async () => {
  const harness = createHarness({
    tabs: [{ id: 9, active: false, url: 'https://supplier.coupang.com/po-web/purchase/order/list' }],
    finalCreatedUrl: 'https://supplier.coupang.com/dashboard/KR',
    executeResults: [{ success: false, errorCode: 'coupang_po_session_required' }],
  });

  const result = await harness.session.run(harness.collection, harness.execute);

  assert.equal(result.success, false);
  assert.equal(result.pendingLogin, true);
  assert.equal(result.errorCode, 'coupang_po_session_required');
  assert.equal(Object.hasOwn(result, 'tab'), false);
  assert.equal(Object.hasOwn(result, 'result'), false);
  assert.deepEqual(
    harness.calls.detach.map(({ tab, options }) => ({ id: tab.id, owned: options.owned })),
    [{ id: 9, owned: false }],
  );
  assert.equal(harness.calls.attach.at(-1).tab.id, 100);
  assert.equal(harness.calls.attach.at(-1).created, true);
});

test('Rocket summary and detail collection share the extracted PO session boundary', () => {
  const workerSource = readFileSync(workerPath, 'utf8');
  const rocketSource = readFileSync(rocketModulePath, 'utf8');

  assert.match(workerSource, /importScripts\([\s\S]*coupang-po-session\.js[\s\S]*rocket-po-collection\.js/);
  assert.match(workerSource, /KidItemCoupangPoSession\.create/);
  assert.match(rocketSource, /coupangPoSession\.run/);
  assert.match(rocketSource, /world:\s*["']MAIN["']/);
  assert.match(rocketSource, /async function scrapeRocketPoList/);
  assert.match(workerSource, /async function collectCoupangDirectOrders[\s\S]*coupangPoSession\.run/);
  assert.doesNotMatch(workerSource, /findOrCreateCoupangSupplierTab/);
  assert.doesNotMatch(workerSource, /findOrCreateCoupangPoTab/);
  assert.doesNotMatch(workerSource, /async function scrapeRocketPoList/);
});
