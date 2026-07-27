import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const formSource = await readFile(
  new URL('../../coupang-ads-scraper/content/wing-registration-fill.js', import.meta.url), 'utf8',
);
const workerSource = await readFile(
  new URL('../../coupang-ads-scraper/background/service-worker.js', import.meta.url), 'utf8',
);
const FORM_URL = 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2';

test('routes category search text only from the sender Wing tab to trusted browser input', () => {
  assert.match(workerSource, /msg\.action === "inputWingCategorySearch"/);
  assert.match(
    workerSource,
    /wingFormRuntimeCompat\s*\.insertText\(\s*sender\?\.tab\?\.id/,
  );
});

function formHarness(identity) {
  let listener = null;
  let queryCalls = 0;
  let clicks = 0;
  let uploads = 0;
  const context = vm.createContext({
    Blob,
    chrome: {
      runtime: {
        lastError: null,
        onMessage: { addListener(next) { listener = next; } },
        sendMessage(_message, callback) { callback?.({ ok: false }); },
      },
    },
    clearInterval,
    clearTimeout,
    console,
    document: {
      body: { innerText: '' },
      querySelector() { queryCalls += 1; return { click() { clicks += 1; } }; },
      querySelectorAll() { queryCalls += 1; return []; },
    },
    fetch: async () => { uploads += 1; return { ok: false, status: 500 }; },
    setInterval,
    setTimeout,
  });
  context.window = context;
  context.location = { href: FORM_URL };
  if (identity !== undefined) context.KidItemWingAccountIdentity = identity;
  vm.runInContext(formSource, context, { filename: 'wing-registration-fill.js' });

  return {
    async send(message) {
      return new Promise((resolve) => {
        listener(message, {}, resolve);
      });
    },
    fill(formSessionId) {
      return this.send({
        action: 'fillWingForm',
        product: {},
        expectedVendorId: 'A00012345',
        ...(formSessionId ? { formSessionId } : {}),
      });
    },
    ready() {
      return this.send({ action: 'wingFormReady', contractVersion: 2 });
    },
    mutations: () => ({ queryCalls, clicks, uploads }),
  };
}

test('content script advertises readiness contract v2 and caches a form session', async () => {
  let identityChecks = 0;
  const harness = formHarness({
    verifyExpectedVendorId: () => {
      identityChecks += 1;
      return { ok: false, error: 'stop after identity evidence' };
    },
  });

  assert.deepEqual(JSON.parse(JSON.stringify(await harness.ready())), {
    ready: true,
    contractVersion: 2,
    url: FORM_URL,
  });
  const first = await harness.fill('session-1');
  const duplicate = await harness.fill('session-1');
  assert.equal(first.error, duplicate.error);
  assert.equal(identityChecks, 1);

  await harness.fill('session-2');
  assert.equal(identityChecks, 2);
});

test('missing WING identity helper stops before any form mutation, upload, or submit', async () => {
  const harness = formHarness(undefined);
  const result = await harness.fill();

  assert.equal(result.ok, false);
  assert.match(result.error, /helper is unavailable/);
  assert.deepEqual(harness.mutations(), { queryCalls: 0, clicks: 0, uploads: 0 });
});

test('mismatched WING identity stops before any form mutation, upload, or submit', async () => {
  const harness = formHarness({
    verifyExpectedVendorId: () => ({ ok: false, error: 'WING vendor does not match expected account.' }),
  });
  const result = await harness.fill();

  assert.equal(result.ok, false);
  assert.match(result.error, /does not match/);
  assert.deepEqual(harness.mutations(), { queryCalls: 0, clicks: 0, uploads: 0 });
});

test('worker response exposes verified fill evidence at the top level', async () => {
  const start = workerSource.indexOf('async function registerToWingForm(message)');
  const end = workerSource.indexOf('\n}\n\n/**', start) + 2;
  assert.ok(start >= 0 && end > start, 'registerToWingForm source must be extractable');
  const sent = [];
  const context = vm.createContext({
    INTERACTIVE_TAB_REASONS: { PRODUCT_EDIT: 'product-edit' },
    interactiveTabs: { createTab: async () => ({ id: 17 }) },
    waitForTabComplete: async () => true,
    wingFormReadiness: { wait: async () => ({ ok: true }) },
    wingFormRuntimeCompat: {
      prepareNavigation: async () => ({ ok: true, status: 'prepared' }),
      ensure: async () => ({ ok: true, status: 'already-compatible' }),
    },
    chrome: {
      tabs: {
        sendMessage: async (tabId, message) => {
          sent.push({ tabId, message });
          return {
            ok: true,
            submission: { attempted: false },
            evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id' },
          };
        },
      },
    },
    setTimeout(callback) { callback(); return 0; },
  });
  vm.runInContext(workerSource.slice(start, end), context, { filename: 'service-worker.registerToWingForm.js' });

  const result = await context.registerToWingForm({
    product: { productName: 'test' },
    executionId: '33333333-3333-4333-8333-333333333333',
    expectedVendorId: 'A00012345',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.evidence, { wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id' });
  assert.equal(sent[0].message.expectedVendorId, 'A00012345');
});

test('manual form fill does not require an execution id before any provider submission', async () => {
  const start = workerSource.indexOf('async function registerToWingForm(message)');
  const end = workerSource.indexOf('\n}\n\n/**', start) + 2;
  const context = vm.createContext({
    INTERACTIVE_TAB_REASONS: { PRODUCT_EDIT: 'product-edit' },
    interactiveTabs: { createTab: async () => ({ id: 18 }) },
    waitForTabComplete: async () => true,
    wingFormReadiness: { wait: async () => ({ ok: true }) },
    wingFormRuntimeCompat: {
      prepareNavigation: async () => ({ ok: true, status: 'prepared' }),
      ensure: async () => ({ ok: true, status: 'already-compatible' }),
    },
    chrome: {
      tabs: {
        sendMessage: async () => ({
          ok: true,
          submission: { attempted: false },
          evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id' },
        }),
      },
    },
    setTimeout(callback) { callback(); return 0; },
  });
  vm.runInContext(workerSource.slice(start, end), context, { filename: 'service-worker.registerToWingForm.js' });

  const result = await context.registerToWingForm({
    product: { productName: 'test' },
    autoSubmit: false,
    expectedVendorId: 'A00012345',
  });

  assert.equal(result.ok, true);
  assert.equal(result.submission.attempted, false);
});

test('bootstraps the Wing runtime before navigation and form fill', async () => {
  const start = workerSource.indexOf('async function registerToWingForm(message)');
  const end = workerSource.indexOf('\n}\n\n/**', start) + 2;
  const order = [];
  const context = vm.createContext({
    INTERACTIVE_TAB_REASONS: { PRODUCT_EDIT: 'product-edit' },
    interactiveTabs: {
      createTab: async (input) => {
        order.push(`create:${input.url}`);
        return { id: 19 };
      },
    },
    waitForTabComplete: async () => {
      order.push('complete');
      return true;
    },
    wingFormReadiness: {
      wait: async () => {
        order.push('ready');
        return { ok: true };
      },
    },
    wingFormRuntimeCompat: {
      prepareNavigation: async (tabId, url) => {
        order.push(`bootstrap:${tabId}:${url}`);
        return { ok: true, status: 'prepared' };
      },
      ensure: async () => {
        order.push('compat');
        return { ok: true, status: 'installed' };
      },
    },
    chrome: {
      tabs: {
        sendMessage: async () => {
          order.push('fill');
          return {
            ok: true,
            submission: { attempted: false },
            evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id' },
          };
        },
      },
    },
    setTimeout(callback) { callback(); return 0; },
  });
  vm.runInContext(workerSource.slice(start, end), context, { filename: 'service-worker.registerToWingForm.js' });

  const result = await context.registerToWingForm({
    product: { productName: 'test' },
    autoSubmit: false,
    expectedVendorId: 'A00012345',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(order, [
    'create:about:blank',
    'bootstrap:19:https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2',
    'complete',
    'compat',
    'ready',
    'fill',
  ]);
});

test('does not mutate the Wing DOM when main-world compatibility cannot be established', async () => {
  const start = workerSource.indexOf('async function registerToWingForm(message)');
  const end = workerSource.indexOf('\n}\n\n/**', start) + 2;
  let fillCalls = 0;
  const context = vm.createContext({
    INTERACTIVE_TAB_REASONS: { PRODUCT_EDIT: 'product-edit' },
    interactiveTabs: { createTab: async () => ({ id: 20 }) },
    waitForTabComplete: async () => true,
    wingFormRuntimeCompat: {
      prepareNavigation: async () => ({ ok: true, status: 'prepared' }),
      ensure: async () => ({ ok: false, error: 'runtime incompatible' }),
    },
    chrome: {
      tabs: {
        sendMessage: async () => {
          fillCalls += 1;
          return { ok: true };
        },
      },
    },
    setTimeout(callback) { callback(); return 0; },
  });
  vm.runInContext(workerSource.slice(start, end), context, { filename: 'service-worker.registerToWingForm.js' });

  const result = await context.registerToWingForm({
    product: { productName: 'test' },
    autoSubmit: false,
    expectedVendorId: 'A00012345',
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /runtime incompatible/);
  assert.equal(fillCalls, 0);
});

test('does not navigate or fill when the early Wing runtime bootstrap fails', async () => {
  const start = workerSource.indexOf('async function registerToWingForm(message)');
  const end = workerSource.indexOf('\n}\n\n/**', start) + 2;
  let ensureCalls = 0;
  let fillCalls = 0;
  const context = vm.createContext({
    INTERACTIVE_TAB_REASONS: { PRODUCT_EDIT: 'product-edit' },
    interactiveTabs: { createTab: async () => ({ id: 21 }) },
    waitForTabComplete: async () => true,
    wingFormRuntimeCompat: {
      prepareNavigation: async () => ({ ok: false, error: 'bootstrap failed' }),
      ensure: async () => {
        ensureCalls += 1;
        return { ok: true };
      },
    },
    chrome: {
      tabs: {
        sendMessage: async () => {
          fillCalls += 1;
          return { ok: true };
        },
      },
    },
    setTimeout(callback) { callback(); return 0; },
  });
  vm.runInContext(workerSource.slice(start, end), context, { filename: 'service-worker.registerToWingForm.js' });

  const result = await context.registerToWingForm({
    product: { productName: 'test' },
    autoSubmit: false,
    expectedVendorId: 'A00012345',
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /bootstrap failed/);
  assert.equal(ensureCalls, 0);
  assert.equal(fillCalls, 0);
});
