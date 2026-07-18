import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(
  new URL(
    '../../coupang-ads-scraper/content/wing-registration-fill.js',
    import.meta.url,
  ),
  'utf8',
);

function createHarness() {
  let listener = null;
  const categoryInput = {};
  const document = {
    body: { innerText: '' },
    querySelector(selector) {
      if (selector.includes('placeholder="카테고리명 입력"')) return categoryInput;
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  const context = vm.createContext({
    Blob,
    chrome: {
      runtime: {
        lastError: null,
        onMessage: {
          addListener(next) {
            listener = next;
          },
        },
        sendMessage(_message, callback) {
          callback?.({ ok: false });
        },
      },
    },
    clearInterval,
    clearTimeout,
    console,
    document,
    fetch: async () => ({ ok: false, status: 404 }),
    setInterval,
    setTimeout,
  });
  context.window = context;
  vm.runInContext(source, context, { filename: 'wing-registration-fill.js' });

  return {
    async fill(product) {
      return new Promise((resolve) => {
        const isAsync = listener?.({ action: 'fillWingForm', product }, {}, resolve);
        assert.equal(isAsync, true);
      });
    },
  };
}

function createDirectUploadHarness({
  uploadPayload = {
    success: true,
    message: 'vendor_inventory/abcd/detail.jpg',
  },
  uploadStatus = 200,
  uploadThrows = false,
  htmlSaveCompletes = true,
} = {}) {
  let listener = null;
  let htmlSaveClicks = 0;
  let productSaveClicks = 0;
  let appliedHtml = null;
  let htmlSave = null;
  const fetchCalls = [];
  const categoryInput = {};
  let now = 0;

  class FakeDate extends Date {
    static now() {
      now += 1000;
      return now;
    }
  }

  class FakeFile extends Blob {
    constructor(parts, name, options) {
      super(parts, options);
      this.name = name;
    }
  }

  class FakeFormData {
    constructor() {
      this.parts = [];
    }

    append(name, value, filename) {
      this.parts.push({ name, value, filename });
    }
  }

  class FakeEvent {
    constructor(type, options = {}) {
      this.type = type;
      this.bubbles = Boolean(options.bubbles);
    }
  }

  class FakeTextArea {
    constructor() {
      this._value = '';
      this.tagName = 'TEXTAREA';
      this.isConnected = true;
      this.offsetParent = {};
    }

    get value() {
      return this._value;
    }

    set value(next) {
      this._value = String(next);
    }

    dispatchEvent(event) {
      if (event.type === 'input') htmlSave?.setDisabled(false);
    }

    getClientRects() {
      return [{}];
    }
  }

  const productSave = {
    offsetParent: {},
    textContent: '상품등록',
    click() {
      productSaveClicks += 1;
    },
  };
  const textarea = new FakeTextArea();
  const htmlTab = {
    checked: false,
  };
  const htmlTabLabel = {
    click() {
      htmlTab.checked = true;
    },
  };
  htmlSave = {
    _disabledAttribute: true,
    className: '',
    getAttribute(name) {
      if (name === 'disabled' && this._disabledAttribute) return 'disabled';
      return null;
    },
    hasAttribute(name) {
      return name === 'disabled' && this._disabledAttribute;
    },
    setDisabled(next) {
      this._disabledAttribute = next;
    },
    click() {
      htmlSaveClicks += 1;
      appliedHtml = textarea.value;
      if (htmlSaveCompletes) this.setDisabled(true);
    },
  };
  const section = {
    querySelector(selector) {
      if (selector === '#tab-content-2') return htmlTab;
      if (selector === '#tab-content-2 + label') return htmlTabLabel;
      if (selector === '.html-area-content textarea') return textarea;
      if (selector === 'a.applyHtml') return htmlSave;
      return null;
    },
  };
  const faq = {
    closest(selector) {
      return selector === '.form-section' ? section : null;
    },
  };
  const document = {
    body: { innerText: '' },
    querySelector(selector) {
      if (selector.includes('placeholder="카테고리명 입력"')) return categoryInput;
      if (selector === 'a[data-faq-id="264"]') return faq;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'button') return [productSave];
      return [];
    },
  };

  const immediateTimer = (callback) => {
    queueMicrotask(callback);
    return 1;
  };
  const context = vm.createContext({
    Blob,
    Date: FakeDate,
    Event: FakeEvent,
    File: FakeFile,
    FormData: FakeFormData,
    HTMLTextAreaElement: FakeTextArea,
    URL,
    chrome: {
      runtime: {
        lastError: null,
        onMessage: {
          addListener(next) {
            listener = next;
          },
        },
        sendMessage() {},
      },
    },
    clearInterval() {},
    clearTimeout() {},
    console,
    document,
    fetch: async (url, init) => {
      fetchCalls.push({ url, init });
      if (url === 'http://localhost:9000/kiditem/detail.jpg') {
        return {
          ok: true,
          status: 200,
          blob: async () => new Blob(['detail'], { type: 'image/jpeg' }),
        };
      }
      if (url === '/tenants/seller-web/file/resize/uploadV2') {
        if (uploadThrows) throw new Error('network failed');
        return {
          ok: uploadStatus >= 200 && uploadStatus < 300,
          status: uploadStatus,
          json: async () => uploadPayload,
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    setInterval: immediateTimer,
    setTimeout: immediateTimer,
  });
  context.window = context;
  context.location = { href: 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2' };
  vm.runInContext(source, context, { filename: 'wing-registration-fill.js' });

  return {
    async fill(detailImageUrls = ['http://localhost:9000/kiditem/detail.jpg']) {
      return new Promise((resolve) => {
        const isAsync = listener?.(
          {
            action: 'fillWingForm',
            product: {
              categoryCell: '',
              detailImageUrls,
            },
          },
          {},
          resolve,
        );
        assert.equal(isAsync, true);
      });
    },
    getHtmlSaveClicks() {
      return htmlSaveClicks;
    },
    getAppliedHtml() {
      return appliedHtml;
    },
    getProductSaveClicks() {
      return productSaveClicks;
    },
    getFetchCalls() {
      return fetchCalls;
    },
  };
}

test('reports a failure when a requested detail-page image cannot be applied', async () => {
  const result = await createHarness().fill({
    categoryCell: '',
    detailImageUrls: ['http://localhost:9000/kiditem/detail.jpg'],
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /쿠팡 CDN 이미지 기반 HTML로 적용하지 못했습니다/);
  assert.ok(result.steps.includes('detailHtmlFailed'));
});

test('does not require a detail upload when no saved detail page was supplied', async () => {
  const result = await createHarness().fill({
    categoryCell: '',
    detailImageUrls: [],
  });

  assert.equal(result.ok, true);
  assert.equal(result.error, undefined);
});

test('uploads once through uploadV2, then saves exact centered HTML with the CDN URL', async () => {
  const harness = createDirectUploadHarness();
  const result = await harness.fill();

  assert.equal(result.ok, true);
  assert.equal(harness.getHtmlSaveClicks(), 1);
  assert.equal(
    harness.getAppliedHtml(),
    '<center> <img src="https://image.coupangcdn.com/image/vendor_inventory/abcd/detail.jpg"> </center>',
  );
  assert.doesNotMatch(harness.getAppliedHtml(), /localhost:9000/);
  assert.equal(harness.getProductSaveClicks(), 0);
  assert.ok(result.steps.includes('detailHtml:1'));
  const [sourceFetch, uploadFetch] = harness.getFetchCalls();
  assert.equal(harness.getFetchCalls().length, 2);
  assert.equal(sourceFetch.url, 'http://localhost:9000/kiditem/detail.jpg');
  assert.equal(sourceFetch.init, undefined);
  assert.equal(uploadFetch.url, '/tenants/seller-web/file/resize/uploadV2');
  assert.equal(uploadFetch.init.method, 'POST');
  assert.equal(uploadFetch.init.credentials, 'same-origin');
  assert.equal(uploadFetch.init.headers, undefined);
  assert.equal(uploadFetch.init.body.parts.length, 1);
  assert.equal(uploadFetch.init.body.parts[0].name, 'multipartFile');
  assert.equal(uploadFetch.init.body.parts[0].filename, 'detail.jpg');
  assert.equal(uploadFetch.init.body.parts[0].value.name, 'detail.jpg');
});

test('fails closed when uploadV2 returns a non-success response', async () => {
  for (const scenario of [
    { uploadStatus: 500, step: 'detailCdnUploadHttp:500' },
    {
      uploadPayload: { success: false, message: 'vendor_inventory/abcd/detail.jpg' },
      step: 'detailCdnUploadRejected',
    },
    { uploadThrows: true, step: 'detailCdnUploadNetworkFailed' },
  ]) {
    const harness = createDirectUploadHarness(scenario);
    const result = await harness.fill();

    assert.equal(result.ok, false);
    assert.equal(harness.getHtmlSaveClicks(), 0);
    assert.equal(harness.getProductSaveClicks(), 0);
    assert.ok(result.steps.includes(scenario.step));
  }
});

test('fails when HTML Save never returns to disabled after the revision attempt', async () => {
  const harness = createDirectUploadHarness({ htmlSaveCompletes: false });
  const result = await harness.fill();

  assert.equal(result.ok, false);
  assert.equal(harness.getHtmlSaveClicks(), 1);
  assert.equal(harness.getProductSaveClicks(), 0);
  assert.ok(result.steps.includes('detailHtmlNotApplied'));
});

test('rejects URL, traversal, query, and multiple-path upload messages', async () => {
  for (const message of [
    'https://image.coupangcdn.com/image/vendor_inventory/abcd/detail.jpg',
    '/vendor_inventory/abcd/detail.jpg',
    ' vendor_inventory/abcd/detail.jpg ',
    'vendor_inventory/../secret.jpg',
    'vendor_inventory/abcd/detail.jpg?x=1',
    ['vendor_inventory/abcd/part-1.jpg', 'vendor_inventory/abcd/part-2.jpg'],
  ]) {
    const harness = createDirectUploadHarness({
      uploadPayload: { success: true, message },
    });
    const result = await harness.fill();

    assert.equal(result.ok, false);
    assert.equal(harness.getHtmlSaveClicks(), 0);
    assert.equal(harness.getAppliedHtml(), null);
    assert.ok(result.steps.includes('detailCdnUploadInvalidPath'));
  }
});

test('rejects multiple source images before any upload call', async () => {
  const harness = createDirectUploadHarness();
  const result = await harness.fill([
    'http://localhost:9000/kiditem/detail-1.jpg',
    'http://localhost:9000/kiditem/detail-2.jpg',
  ]);

  assert.equal(result.ok, false);
  assert.match(result.error, /긴 이미지 한 장이어야 합니다/);
  assert.equal(harness.getHtmlSaveClicks(), 0);
  assert.equal(harness.getFetchCalls().length, 0);
  assert.ok(result.steps.includes('detailSourceMultiple:2'));
});
