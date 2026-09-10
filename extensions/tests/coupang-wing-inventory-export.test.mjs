import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(
  new URL('../kiditem-os/content/coupang/wing-inventory-scraper.js', import.meta.url),
  'utf8',
);
const workerSource = fs.readFileSync(
  new URL('../kiditem-os/background/coupang/worker.js', import.meta.url),
  'utf8',
);

test('Wing export transport stays authenticated and tab-bound', () => {
  assert.match(workerSource, /msg\.action === ["']exportWingInventoryWorkbook["']/);
  assert.match(workerSource, /\/api\/channels\/coupang-wing\/inventory-export/);
  assert.match(workerSource, /environmentForTab\(sender\?\.tab\?\.id\)/);
  assert.match(workerSource, /fileName: legacyWingInventoryFileName\(\)/);
  assert.match(workerSource, /function legacyWingInventoryFileName\(\)/);
  assert.doesNotMatch(source, /new Blob\(\['\\uFEFF'/);
});

test('Wing inventory keeps DOM collection in the content script and sends raw rows for server export', async () => {
  const sent = [];
  let listener;
  let downloadedAnchor;
  let downloadedBlob;
  const headers = [
    { innerText: '등록상품ID' },
    { innerText: '상품명' },
    { innerText: '가격' },
  ];
  const link = { href: 'https://wing.coupang.com/products/123' };
  const cells = [
    { innerText: 'P-1', querySelector: () => link },
    { innerText: '상품 하나', querySelector: () => null },
    { innerText: '1,000', querySelector: () => null },
  ];
  const row = { querySelectorAll: () => cells };
  const body = { innerText: '전체 1건', appendChild(anchor) { downloadedAnchor = anchor; }, removeChild() {} };
  const document = {
    body,
    querySelector(selector) {
      return selector === 'table tbody tr' ? row : null;
    },
    querySelectorAll(selector) {
      if (selector === 'table thead th, table thead td') return headers;
      if (selector === 'table tbody tr') return [row];
      return [];
    },
    createElement() {
      return { click() {} };
    },
  };
  const urlApi = class extends URL {};
  urlApi.createObjectURL = (blob) => {
    downloadedBlob = blob;
    return 'blob:server-export';
  };
  urlApi.revokeObjectURL = () => {};
  const context = vm.createContext({
    Blob,
    URL: urlApi,
    atob,
    console,
    document,
    location: {
      href: 'https://wing.coupang.com/vendor-inventory/list?countPerPage=50',
      search: '?countPerPage=50',
    },
    chrome: {
      runtime: {
        lastError: null,
        onMessage: { addListener(next) { listener = next; } },
        sendMessage(message, callback) {
          sent.push(message);
          callback({
            success: true,
            fileBase64: Buffer.from('\uFEFFserver-workbook').toString('base64'),
            fileName: 'wing-inventory_2026-07-31_14.05.xls',
            contentType: 'application/vnd.ms-excel;charset=utf-8',
            total: 1,
          });
        },
      },
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    setTimeout(callback) {
      callback();
      return 1;
    },
    clearTimeout() {},
  });

  vm.runInContext(source, context, { filename: 'wing-inventory-scraper.js' });
  const response = await new Promise((resolve) => {
    assert.equal(listener({ action: 'scrapeInventoryList' }, {}, resolve), true);
  });

  assert.equal(response.success, true);
  assert.equal(response.total, 1);
  const exportMessage = JSON.parse(JSON.stringify(sent[0]));
  assert.equal(exportMessage.action, 'exportWingInventoryWorkbook');
  assert.deepEqual(exportMessage.products, [{ 등록상품ID: 'P-1', 상품명: '상품 하나', 가격: '1,000' }]);
  assert.equal(downloadedAnchor.download, 'wing-inventory_2026-07-31_14.05.xls');
  assert.equal(await downloadedBlob.text(), 'server-workbook');
  assert.deepEqual(
    Array.from(new Uint8Array(await downloadedBlob.arrayBuffer())).slice(0, 3),
    [0xef, 0xbb, 0xbf],
  );
  assert.doesNotMatch(source, /function downloadAsExcel/);
  assert.doesNotMatch(source, /application\/vnd\.ms-excel[^\n]*\uFEFF/);
});
