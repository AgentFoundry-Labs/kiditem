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

/**
 * 옵션 일괄입력 + 상품정보제공고시 하네스.
 *
 * 라이브 실증: 옵션 행을 **선택하지 않으면** 일괄입력이 조용히 무시되어 판매가/재고가
 * 빈 채로 남는다. 그래서 `선택 → 일괄입력 → 저장` 순서가 계약이다.
 */
function createOptionAndNoticeHarness({ rowCount = 1, cascade = true } = {}) {
  let listener = null;
  const events = [];

  const checkbox = (kind) => ({
    type: 'checkbox',
    checked: false,
    click() {
      this.checked = !this.checked;
      events.push(`${kind}:${this.checked}`);
    },
  });

  const selectAll = checkbox('selectAll');
  const rows = Array.from({ length: rowCount }, () => checkbox('row'));
  selectAll.click = function click() {
    this.checked = !this.checked;
    events.push(`selectAll:${this.checked}`);
    if (cascade) for (const row of rows) row.checked = this.checked;
  };

  const noticeRows = Array.from({ length: 5 }, () => checkbox('noticeRow'));
  const noticeReferAll = {
    type: 'checkbox',
    checked: false,
    click() {
      this.checked = !this.checked;
      events.push('noticeReferAll');
      for (const row of noticeRows) row.checked = this.checked;
    },
  };

  let noticeCurrent = '선택하세요';
  let noticeExpanded = false;
  const noticeCollapse = {
    get innerText() {
      return noticeCurrent;
    },
    get textContent() {
      return noticeCurrent;
    },
    click() {
      noticeExpanded = true;
      events.push('noticeExpand');
    },
  };
  const noticeOptions = ['의류', '어린이제품', '기타 재화'].map((label) => ({
    textContent: label,
    innerText: label,
    click() {
      noticeCurrent = label;
      events.push(`noticePick:${label}`);
    },
  }));

  const noticeSection = {
    querySelector(selector) {
      if (selector === 'ul.selection-collapse li.init.option') return noticeCollapse;
      if (selector === 'ul.selection-expand') return noticeExpanded ? noticeExpand : null;
      if (selector.includes('sc-common-check')) return noticeReferAll;
      return null;
    },
    closest() {
      return noticeRoot;
    },
  };
  const noticeExpand = {
    querySelectorAll(selector) {
      return selector === 'li.option' ? noticeOptions : [];
    },
  };
  const noticeRoot = {
    querySelectorAll(selector) {
      return selector.includes('notice-category-input-wrapper') ? noticeRows : [];
    },
  };

  const optionRoot = {
    querySelector(selector) {
      return selector.includes('option-pane-table-head') ? selectAll : null;
    },
    querySelectorAll(selector) {
      return selector.includes('option-pane-table-content') ? rows : [];
    },
  };

  const numberInputs = [];
  const dialogSave = {
    textContent: '저장',
    click() {
      events.push('dialogSave');
    },
  };
  const dialogRoot = {
    parentElement: null,
    querySelectorAll(selector) {
      return selector === 'button' ? [dialogSave] : [];
    },
  };

  const makeBulkButton = (label) => ({
    textContent: label,
    click() {
      events.push(`open:${label}`);
      // setReactValue 가 프로토타입 세터를 쓰므로 실제 인풋과 같은 프로토타입을 준다.
      const input = Object.create(FakeInput.prototype);
      Object.assign(input, {
        type: 'number',
        tagName: 'INPUT',
        parentElement: dialogRoot,
        dispatchEvent() {},
      });
      numberInputs.push(input);
    },
  });

  const buttons = [makeBulkButton('판매가 일괄입력'), makeBulkButton('재고수량 일괄입력')];
  const categoryInput = {};
  const document = {
    body: { innerText: '' },
    querySelector(selector) {
      if (selector.includes('placeholder="카테고리명 입력"')) return categoryInput;
      if (selector === '.option-content') return optionRoot;
      if (selector === '.notice-category-option-section') return noticeSection;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'button') return buttons;
      if (selector === 'input[type="number"]') return numberInputs;
      return [];
    },
  };

  const immediateTimer = (callback) => {
    queueMicrotask(callback);
    return 1;
  };
  let now = 0;
  class FakeDate extends Date {
    static now() {
      now += 200;
      return now;
    }
  }
  // setReactValue 는 프로토타입의 value 세터를 꺼내 쓴다. 인스턴스 필드로는 안 잡힌다.
  class FakeInput {}
  Object.defineProperty(FakeInput.prototype, 'value', {
    configurable: true,
    get() {
      return this._value ?? '';
    },
    set(next) {
      this._value = String(next);
    },
  });
  const context = vm.createContext({
    Blob,
    Date: FakeDate,
    Event: class {
      constructor(type) {
        this.type = type;
      }
    },
    HTMLInputElement: FakeInput,
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
    fetch: async () => ({ ok: false, status: 404 }),
    setInterval: immediateTimer,
    setTimeout: immediateTimer,
  });
  context.window = context;
  vm.runInContext(source, context, { filename: 'wing-registration-fill.js' });

  return {
    async fill(variant) {
      return new Promise((resolve) => {
        listener?.(
          {
            action: 'fillWingForm',
            product: { categoryCell: '', detailImageUrls: [], variants: [variant] },
          },
          {},
          resolve,
        );
      });
    },
    events,
    rows,
    noticeRows,
    getNoticeCategory: () => noticeCurrent,
    getBulkValues: () => numberInputs.map((input) => input.value),
  };
}

const VARIANT = { purchaseOptions: [], salePrice: 4000, stock: 999 };

test('selects the option rows before running either bulk fill', async () => {
  const harness = createOptionAndNoticeHarness();
  const result = await harness.fill(VARIANT);

  assert.equal(result.ok, true);
  // 선택이 두 일괄입력보다 먼저 와야 한다. 순서가 뒤집히면 값이 조용히 사라진다.
  const order = harness.events.filter((e) => e.startsWith('selectAll') || e.startsWith('open:'));
  assert.deepEqual(order, [
    'selectAll:true',
    'open:판매가 일괄입력',
    'open:재고수량 일괄입력',
  ]);
  assert.deepEqual(harness.rows.map((row) => row.checked), [true]);
  assert.deepEqual(harness.getBulkValues(), ['4000', '999']);
  assert.ok(result.steps.includes('salePrice:4000'));
  assert.ok(result.steps.includes('stock:999'));
});

test('falls back to per-row checkboxes when select-all does not cascade', async () => {
  const harness = createOptionAndNoticeHarness({ rowCount: 2, cascade: false });
  const result = await harness.fill(VARIANT);

  assert.deepEqual(harness.rows.map((row) => row.checked), [true, true]);
  assert.ok(result.steps.includes('optionSelect:rows:2'));
  assert.ok(result.steps.includes('salePrice:4000'));
});

test('skips both bulk fills when there is no option row to select', async () => {
  const harness = createOptionAndNoticeHarness({ rowCount: 0 });
  const result = await harness.fill(VARIANT);

  assert.ok(result.steps.includes('optionSelect:noRows'));
  assert.ok(result.steps.includes('bulkFillSkipped:noSelection'));
  assert.equal(harness.events.filter((e) => e.startsWith('open:')).length, 0);
});

test('pins the notice category to 기타 재화 and checks 전체 상품 상세페이지 참조', async () => {
  // 프리셋의 `어린이제품` 을 그대로 쓰지 않는다 — 카테고리별 고시 스키마 매핑이 없어서
  // 어느 상품에나 유효한 `기타 재화` + 전체 상세페이지 참조로 고정한다.
  const harness = createOptionAndNoticeHarness();
  const result = await harness.fill(VARIANT);

  assert.equal(harness.getNoticeCategory(), '기타 재화');
  assert.deepEqual(harness.noticeRows.map((row) => row.checked), [true, true, true, true, true]);
  assert.ok(result.steps.includes('noticeCategory:기타 재화'));
  assert.ok(result.steps.includes('noticeReferAll:5'));
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * autoSubmit(상품등록까지 자동 실행) 하네스 — **파괴적 경로**.
 *
 * 이 옵트인이 켜졌을 때만 폼 하단의 제출 버튼을 누른다. 아래 스펙들이 고정하는 계약:
 *   1) autoSubmit 미지정/false 면 제출 버튼을 **찾지도 누르지도 않는다**
 *   2) '페이지 별점주기' 위젯의 `등록`(#report-rating-trigger)을 제출 버튼으로 오인하지 않는다
 *   3) 임시저장/판매요청을 누르지 않는다
 *   4) 완료 안내를 못 보면 성공으로 보고하지 않는다(status:'unknown')
 * ─────────────────────────────────────────────────────────────────────────────
 */
function createSubmitHarness({
  autoSubmitLabel = '상품등록',
  succeeds = true,
  registeredProductId = '16311428128',
  disabled = false,
} = {}) {
  let listener = null;
  const clicks = [];
  let bodyText = '';

  const makeButton = (textContent, extra = {}) => ({
    textContent,
    offsetParent: {},
    parentElement: null,
    disabled: false,
    hasAttribute: () => false,
    click() {
      clicks.push(textContent);
      if (textContent === autoSubmitLabel && succeeds) {
        bodyText = `상품이 등록되었습니다. 등록상품ID ${registeredProductId}`;
      }
    },
    ...extra,
  });

  // ⚠️ 실제 WING 페이지에 함께 존재하는 버튼들. 제출 대상은 오직 하나여야 한다.
  const ratingWidget = { id: 'report-rating-trigger', className: 'rating-widget', parentElement: null };
  const ratingRegister = makeButton('등록', { parentElement: ratingWidget });
  const tempSave = makeButton('임시저장');
  const sellRequest = makeButton('판매요청');
  const submit = makeButton(autoSubmitLabel, {
    disabled,
    hasAttribute: (name) => name === 'disabled' && disabled,
  });
  const buttons = [ratingRegister, tempSave, sellRequest, submit];

  const document = {
    get body() {
      return { innerText: bodyText };
    },
    querySelector(selector) {
      if (selector.includes('placeholder="카테고리명 입력"')) return {};
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'button') return buttons;
      return [];
    },
  };

  const immediateTimer = (callback) => {
    queueMicrotask(callback);
    return 1;
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
    clearInterval() {},
    clearTimeout() {},
    console,
    document,
    fetch: async () => ({ ok: false, status: 404 }),
    setInterval: immediateTimer,
    setTimeout: immediateTimer,
  });
  context.window = context;
  context.location = { href: 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2' };
  vm.runInContext(source, context, { filename: 'wing-registration-fill.js' });

  return {
    async fill(message) {
      return new Promise((resolve) => {
        const isAsync = listener?.(
          { action: 'fillWingForm', product: { categoryCell: '', detailImageUrls: [] }, ...message },
          {},
          resolve,
        );
        assert.equal(isAsync, true);
      });
    },
    getClicks() {
      return clicks;
    },
  };
}

test('never touches a submit button unless autoSubmit is explicitly true', async () => {
  // 미지정 / false / truthy 하지만 true 가 아닌 값 — 전부 제출하지 않는다.
  for (const message of [{}, { autoSubmit: false }, { autoSubmit: 'yes' }, { autoSubmit: 1 }]) {
    const harness = createSubmitHarness();
    const result = await harness.fill(message);

    assert.equal(result.ok, true);
    assert.deepEqual(harness.getClicks(), [], `autoSubmit=${JSON.stringify(message)} clicked a button`);
    assert.equal(result.submission.attempted, false);
    assert.equal(result.submission.clicked, undefined);
    assert.ok(!result.steps.some((step) => step.startsWith('submit:')));
  }
});

test('submits and reports the registered product id when autoSubmit is on', async () => {
  const harness = createSubmitHarness();
  const result = await harness.fill({ autoSubmit: true });

  assert.equal(result.ok, true);
  // 별점 위젯의 '등록', 임시저장, 판매요청은 절대 눌리지 않는다.
  assert.deepEqual(harness.getClicks(), ['상품등록']);
  assert.equal(result.submission.ok, true);
  assert.equal(result.submission.status, 'registered');
  assert.equal(result.submission.externalListingId, '16311428128');
  assert.ok(result.steps.includes('submit:click:상품등록'));
});

test('submits the 수정 및 검수 요청 button on the edit screen', async () => {
  const harness = createSubmitHarness({ autoSubmitLabel: '수정 및 검수 요청' });
  const result = await harness.fill({ autoSubmit: true });

  assert.deepEqual(harness.getClicks(), ['수정 및 검수 요청']);
  assert.equal(result.submission.ok, true);
});

test('never mistakes the 별점주기 위젯 등록 button for the submit button', async () => {
  // 제출 버튼이 아예 없는 화면. 별점 위젯의 '등록'만 남아 있어도 누르면 안 된다.
  const harness = createSubmitHarness({ autoSubmitLabel: '__none__' });
  const result = await harness.fill({ autoSubmit: true });

  assert.deepEqual(harness.getClicks(), []);
  assert.equal(result.submission.clicked, false);
  assert.equal(result.submission.status, 'no_button');
  assert.ok(result.steps.includes('submit:noButton'));
});

test('does not click a disabled submit button', async () => {
  const harness = createSubmitHarness({ disabled: true });
  const result = await harness.fill({ autoSubmit: true });

  assert.deepEqual(harness.getClicks(), []);
  assert.equal(result.submission.status, 'no_button');
});

test('reports status unknown rather than guessing success', async () => {
  const harness = createSubmitHarness({ succeeds: false });
  const result = await harness.fill({ autoSubmit: true });

  assert.deepEqual(harness.getClicks(), ['상품등록']);
  assert.equal(result.submission.ok, false);
  assert.equal(result.submission.status, 'unknown');
  assert.equal(result.submission.externalListingId, null);
  assert.ok(result.steps.includes('submit:unconfirmed'));
});
