import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workerSource = readFileSync(path.join(
  repoRoot,
  'extensions/order-collector/background/service-worker.js',
), 'utf8');

function extractAsyncFunction(name) {
  const start = workerSource.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, name);
  const next = workerSource.indexOf('\nasync function ', start + 1);
  return workerSource.slice(start, next === -1 ? workerSource.length : next);
}

function injectedContext(overrides = {}) {
  const fileInput = { files: [], dispatchEvent() {} };
  const shopSelect = {
    options: [{ value: '', textContent: '' }, { value: 'shop', textContent: '키드키즈' }],
  };
  const submitButton = { click() {} };
  const elements = {
    search_om_shop: shopSelect,
    userfile: fileInput,
    btn_om_upload: submitButton,
    om_excelformed: null,
  };
  class FakeDataTransfer {
    files = [];
    items = { add: (file) => this.files.push(file) };
  }
  return {
    document: { getElementById: (id) => elements[id] ?? null },
    File: class FakeFile {},
    DataTransfer: FakeDataTransfer,
    Event: class FakeEvent {},
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    setTimeout: (resolve) => resolve(),
    ...overrides,
    elements,
  };
}

test('Sellpia page injection marks every pre-click failure as not_submitted', async () => {
  const context = injectedContext({
    atob() {
      throw new Error('invalid base64');
    },
  });
  const inject = vm.runInNewContext(
    `(${extractAsyncFunction('injectSellpiaOrderFile')})`,
    context,
  );

  const decoded = await inject({
    shopName: null,
    fileName: 'orders.xlsx',
    fileBase64: 'invalid',
  });
  context.atob = (value) => Buffer.from(value, 'base64').toString('binary');
  context.elements.btn_om_upload = null;
  const missingButton = await inject({
    shopName: null,
    fileName: 'orders.xlsx',
    fileBase64: Buffer.from('orders').toString('base64'),
  });

  assert.equal(decoded.outcome, 'not_submitted');
  assert.equal(missingButton.outcome, 'not_submitted');
});

test('Sellpia page injection distinguishes click completion from click uncertainty', async () => {
  const submittedContext = injectedContext();
  const injectSubmitted = vm.runInNewContext(
    `(${extractAsyncFunction('injectSellpiaOrderFile')})`,
    submittedContext,
  );
  const payload = {
    shopName: null,
    fileName: 'orders.xlsx',
    fileBase64: Buffer.from('orders').toString('base64'),
  };

  const submitted = await injectSubmitted(payload);
  const unknownContext = injectedContext();
  unknownContext.elements.btn_om_upload.click = () => {
    throw new Error('click acknowledgement lost');
  };
  const injectUnknown = vm.runInNewContext(
    `(${extractAsyncFunction('injectSellpiaOrderFile')})`,
    unknownContext,
  );
  const unknown = await injectUnknown(payload);

  assert.equal(submitted.outcome, 'submitted');
  assert.equal(unknown.outcome, 'unknown');
});

test('Sellpia service worker separates preflight failure from post-injection uncertainty', async () => {
  const baseContext = {
    findOrCreateSellpiaTab: async () => ({ id: 1, url: 'https://kiditem.sellpia.com/' }),
    waitForTabReady: async () => {},
    withTimeout: async (promise) => promise,
    injectSellpiaOrderFile() {},
    SELLPIA_ORDER_UPLOAD_URL: 'https://kiditem.sellpia.com/order_collect.html?ctype=OM_FILE',
    chrome: {
      scripting: { executeScript: async () => [] },
      tabs: { get: async () => ({ id: 1, url: 'https://kiditem.sellpia.com/' }) },
    },
  };
  const send = vm.runInNewContext(
    `(${extractAsyncFunction('sendOrderFileToSellpia')})`,
    baseContext,
  );

  const preflight = await send({ shopName: null, fileName: null, fileBase64: null });
  baseContext.chrome.scripting.executeScript = async () => {
    throw new Error('response lost');
  };
  const unknown = await send({
    shopName: null,
    fileName: 'orders.xlsx',
    fileBase64: 'b3JkZXJz',
  });

  assert.equal(preflight.outcome, 'not_submitted');
  assert.equal(unknown.outcome, 'unknown');
});
