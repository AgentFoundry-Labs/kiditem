import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workerSource = readFileSync(path.join(
  repoRoot,
  'extensions/kiditem-os/background/orders/worker.js',
), 'utf8');

function extractAsyncFunction(name) {
  const start = workerSource.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, name);
  const next = workerSource.indexOf('\nasync function ', start + 1);
  return workerSource.slice(start, next === -1 ? workerSource.length : next);
}

function injectedContext(overrides = {}) {
  const fileInput = { files: [], dispatchEvent() {} };
  let pendingCount = 0;
  const shopSelect = {
    options: [{ value: '', textContent: '' }, { value: 'shop', textContent: '키드키즈' }],
  };
  const submitButton = { click() { pendingCount = 2; } };
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
    document: {
      getElementById: (id) => elements[id] ?? null,
      querySelectorAll: () => [],
    },
    window: {
      dataView: {
        getLength: () => pendingCount,
        getItems: () => [],
      },
      jQuery: { active: 0 },
    },
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
  const noGridContext = injectedContext();
  let clickedWithoutGrid = false;
  noGridContext.window.dataView = null;
  noGridContext.elements.btn_om_upload.click = () => {
    clickedWithoutGrid = true;
  };
  const injectWithoutGrid = vm.runInNewContext(
    `(${extractAsyncFunction('injectSellpiaOrderFile')})`,
    noGridContext,
  );
  const missingGrid = await injectWithoutGrid({
    shopName: null,
    fileName: 'orders.xlsx',
    fileBase64: Buffer.from('orders').toString('base64'),
  });

  assert.equal(decoded.outcome, 'not_submitted');
  assert.equal(missingButton.outcome, 'not_submitted');
  assert.equal(missingGrid.outcome, 'not_submitted');
  assert.equal(clickedWithoutGrid, false);
});

test('Sellpia page injection requires accepted rows after the upload click', async () => {
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
  assert.equal(submitted.acceptedRows, 2);
  assert.equal(unknown.outcome, 'unknown');
});

test('Sellpia page injection uses the visible SlickGrid pager when dataView is unavailable', async () => {
  const context = injectedContext();
  let pendingCount = 0;
  context.window.dataView = null;
  context.document.querySelector = (selector) => (
    selector === '#pager .slick-pager-status'
      ? { get textContent() { return `전체 ${pendingCount.toLocaleString('en-US')} 개`; } }
      : null
  );
  context.elements.btn_om_upload.click = () => {
    pendingCount = 1_234;
  };
  const inject = vm.runInNewContext(
    `(${extractAsyncFunction('injectSellpiaOrderFile')})`,
    context,
  );

  const result = await inject({
    shopName: null,
    fileName: 'orders.xlsx',
    fileBase64: Buffer.from('orders').toString('base64'),
  });

  assert.equal(result.outcome, 'submitted');
  assert.equal(result.acceptedRows, 1_234);
  assert.equal(result.pendingRows, 1_234);
});

test('Sellpia page injection accepts newly queued rows when the result dialog also lists duplicates', async () => {
  const context = injectedContext();
  context.window.getComputedStyle = () => ({
    display: 'block',
    visibility: 'visible',
    opacity: '1',
  });
  context.document.querySelectorAll = () => [{
    hidden: false,
    textContent: '일부 주문접수에 실패했습니다. 이미 수집된 주문',
  }];
  const inject = vm.runInNewContext(
    `(${extractAsyncFunction('injectSellpiaOrderFile')})`,
    context,
  );

  const result = await inject({
    shopName: null,
    fileName: 'orders.xlsx',
    fileBase64: Buffer.from('orders').toString('base64'),
  });

  assert.equal(result.outcome, 'submitted');
  assert.equal(result.acceptedRows, 2);
  assert.equal(result.pendingRows, 2);
});

test('Sellpia page injection returns only order identities newly accepted by this upload', async () => {
  const context = injectedContext();
  let items = [{ group_no: 'provider_OLDER-1' }];
  context.window.dataView.getLength = () => items.length;
  context.window.dataView.getItems = () => items;
  context.elements.btn_om_upload.click = () => {
    items = [
      ...items,
      { group_no: 'provider_ORDER-NEW' },
      { group_no: 'provider_ORDER-NEW' },
    ];
  };
  const inject = vm.runInNewContext(
    `(${extractAsyncFunction('injectSellpiaOrderFile')})`,
    context,
  );

  const result = await inject({
    shopName: null,
    fileName: 'orders.xlsx',
    fileBase64: Buffer.from('orders').toString('base64'),
    targetOrderNumbers: ['OLDER-1', 'ORDER-NEW'],
  });

  assert.deepEqual(Array.from(result.acceptedTargetOrderNumbers), ['ORDER-NEW']);
});

test('Sellpia page injection stays unknown when the click produces no acceptance evidence', async () => {
  const context = injectedContext();
  context.elements.btn_om_upload.click = () => {};
  const inject = vm.runInNewContext(
    `(${extractAsyncFunction('injectSellpiaOrderFile')})`,
    context,
  );

  const result = await inject({
    shopName: null,
    fileName: 'orders.xlsx',
    fileBase64: Buffer.from('orders').toString('base64'),
  });

  assert.equal(result.outcome, 'unknown');
  assert.match(result.error, /접수 결과/);
});

test('Sellpia service worker separates preflight failure from post-injection uncertainty', async () => {
  let injection = null;
  const baseContext = {
    findOrCreateSellpiaTab: async () => ({ id: 1, url: 'https://kiditem.sellpia.com/' }),
    waitForTabReady: async () => {},
    withTimeout: async (promise) => promise,
    injectSellpiaOrderFile() {},
    sellpiaPostProcessing: {
      normalizeTargetOrderNumbers: (value) => Array.isArray(value) ? value : [],
    },
    sellpiaInvoiceTargets: {
      remember: async (_environmentId, value) => value,
    },
    // 셀피아 조회로도 판정하지 못한 경우(=null): 불확실 상태를 그대로 유지해야 한다.
    verifySellpiaOrderReceipt: async () => null,
    SELLPIA_ORDER_UPLOAD_URL: 'https://kiditem.sellpia.com/order_collect.html?ctype=OM_FILE',
    chrome: {
      scripting: {
        executeScript: async (input) => {
          injection = input;
          return [];
        },
      },
      tabs: { get: async () => ({ id: 1, url: 'https://kiditem.sellpia.com/' }) },
    },
  };
  const send = vm.runInNewContext(
    `(${extractAsyncFunction('sendOrderFileToSellpia')})`,
    baseContext,
  );

  const preflight = await send({
    shopName: null,
    fileName: null,
    fileBase64: null,
    targetOrderNumbers: ['ORDER-1'],
    environmentId: 'local',
  });
  await send({
    shopName: null,
    fileName: 'orders.xlsx',
    fileBase64: 'b3JkZXJz',
    targetOrderNumbers: ['ORDER-1'],
    environmentId: 'local',
  });
  assert.equal(injection.world, 'MAIN');
  assert.deepEqual(
    Array.from(injection.args[0].targetOrderNumbers),
    ['ORDER-1'],
  );
  baseContext.chrome.scripting.executeScript = async () => {
    throw new Error('response lost');
  };
  const unknown = await send({
    shopName: null,
    fileName: 'orders.xlsx',
    fileBase64: 'b3JkZXJz',
    targetOrderNumbers: ['ORDER-1'],
    environmentId: 'local',
  });

  assert.equal(preflight.outcome, 'not_submitted');
  assert.equal(unknown.outcome, 'unknown');
});

test('Sellpia lookup resolves an uncertain submit instead of asking the operator', async () => {
  const context = (verify) => ({
    findOrCreateSellpiaTab: async () => ({ id: 1, url: 'https://kiditem.sellpia.com/' }),
    waitForTabReady: async () => {},
    withTimeout: async () => { throw new Error('response lost'); },
    injectSellpiaOrderFile() {},
    sellpiaPostProcessing: {
      normalizeTargetOrderNumbers: (value) => (Array.isArray(value) ? value : []),
    },
    sellpiaInvoiceTargets: { remember: async (_environmentId, value) => value },
    verifySellpiaOrderReceipt: verify,
    SELLPIA_ORDER_UPLOAD_URL: 'https://kiditem.sellpia.com/order_collect.html?ctype=OM_FILE',
    chrome: {
      scripting: { executeScript: async () => [] },
      tabs: { get: async () => ({ id: 1, url: 'https://kiditem.sellpia.com/' }) },
    },
  });
  const payload = {
    shopName: null,
    fileName: 'orders.xlsx',
    fileBase64: 'b3JkZXJz',
    targetOrderNumbers: ['ORDER-1'],
    environmentId: 'local',
  };

  // 셀피아에서 전부 확인되면 접수로 확정한다.
  const accepted = await vm.runInNewContext(
    `(${extractAsyncFunction('sendOrderFileToSellpia')})`,
    context(async () => ({
      success: true,
      requestedCount: 1,
      foundCount: 1,
      missingCount: 0,
      found: [{ orderNo: 'ORDER-1', receiver: '홍길동' }],
    })),
  )(payload);
  assert.equal(accepted.outcome, 'submitted');
  assert.equal(accepted.verifiedBySellpiaLookup, true);
  assert.deepEqual(accepted.acceptedTargetOrderNumbers, ['ORDER-1']);

  // 한 건도 없으면 미접수로 확정해 안전하게 재전송할 수 있어야 한다.
  const missing = await vm.runInNewContext(
    `(${extractAsyncFunction('sendOrderFileToSellpia')})`,
    context(async () => ({
      success: true,
      requestedCount: 1,
      foundCount: 0,
      missingCount: 1,
      found: [],
      missing: ['ORDER-1'],
    })),
  )(payload);
  assert.equal(missing.outcome, 'not_submitted');

  // 일부만 들어간 경우는 중복 위험이 있으므로 확정하지 않는다.
  const partial = await vm.runInNewContext(
    `(${extractAsyncFunction('sendOrderFileToSellpia')})`,
    context(async () => ({
      success: true,
      requestedCount: 2,
      foundCount: 1,
      missingCount: 1,
      found: [{ orderNo: 'ORDER-1', receiver: '홍길동' }],
    })),
  )(payload);
  assert.equal(partial.outcome, 'unknown');
  assert.match(partial.error, /중복/);
});
