import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(
  new URL('../../coupang-ads-scraper/background/wing-form-readiness.js', import.meta.url),
  'utf8',
);

function load() {
  const context = vm.createContext({ console });
  context.globalThis = context;
  vm.runInContext(source, context, { filename: 'wing-form-readiness.js' });
  return context.KidItemWingFormReadiness;
}

const FORM_URL = 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2';
const plain = (value) => JSON.parse(JSON.stringify(value));

test('waits for the versioned receiver and never sends a fill message', async () => {
  const readiness = load();
  const messages = [];
  let attempt = 0;
  const sleeps = [];
  const helper = readiness.create({
    sendMessage: async (tabId, message) => {
      messages.push({ tabId, message });
      attempt += 1;
      if (attempt < 3) throw new Error('Could not establish connection. Receiving end does not exist.');
      return { ready: true, contractVersion: 2, url: FORM_URL };
    },
    sleep: async (milliseconds) => { sleeps.push(milliseconds); },
    maxAttempts: 5,
    intervalMs: 200,
  });

  const result = await helper.wait(42, FORM_URL);

  assert.deepEqual(plain(result), {
    ok: true,
    tabId: 42,
    attempts: 3,
    contractVersion: 2,
  });
  assert.deepEqual(sleeps, [200, 200]);
  assert.equal(messages.every(({ message }) => message.action === 'wingFormReady'), true);
});

test('returns bounded retryable evidence when the receiver never appears', async () => {
  const readiness = load();
  let now = 0;
  const helper = readiness.create({
    sendMessage: async () => { throw new Error('Receiving end does not exist.'); },
    sleep: async (milliseconds) => { now += milliseconds; },
    now: () => now,
    maxAttempts: 4,
    timeoutMs: 1_000,
    intervalMs: 250,
  });

  assert.deepEqual(plain(await helper.wait(7, FORM_URL)), {
    ok: false,
    code: 'wing_form_content_not_ready',
    retryable: true,
    tabId: 7,
    attempts: 4,
  });
});

test('rejects the wrong contract version or URL without filling', async () => {
  const readiness = load();
  const wrongVersion = readiness.create({
    sendMessage: async () => ({ ready: true, contractVersion: 1, url: FORM_URL }),
  });
  assert.deepEqual(plain(await wrongVersion.wait(8, FORM_URL)), {
    ok: false,
    code: 'wing_form_contract_incompatible',
    retryable: false,
    tabId: 8,
    attempts: 1,
    detectedContractVersion: 1,
  });

  const wrongPage = readiness.create({
    sendMessage: async () => ({
      ready: true,
      contractVersion: 2,
      url: 'https://wing.coupang.com/vendor-inventory/list',
    }),
  });
  assert.deepEqual(plain(await wrongPage.wait(9, FORM_URL)), {
    ok: false,
    code: 'wing_form_wrong_page',
    retryable: false,
    tabId: 9,
    attempts: 1,
  });
});

test('reports a closed tab as terminal readiness evidence', async () => {
  const readiness = load();
  const helper = readiness.create({
    sendMessage: async () => { throw new Error('No tab with id: 10.'); },
  });

  assert.deepEqual(plain(await helper.wait(10, FORM_URL)), {
    ok: false,
    code: 'wing_form_tab_closed',
    retryable: false,
    tabId: 10,
    attempts: 1,
  });
});
