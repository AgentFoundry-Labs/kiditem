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
  if (identity !== undefined) context.KidItemWingAccountIdentity = identity;
  vm.runInContext(formSource, context, { filename: 'wing-registration-fill.js' });

  return {
    async fill() {
      return new Promise((resolve) => {
        assert.equal(listener({ action: 'fillWingForm', product: {}, expectedVendorId: 'A00012345' }, {}, resolve), true);
      });
    },
    mutations: () => ({ queryCalls, clicks, uploads }),
  };
}

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
