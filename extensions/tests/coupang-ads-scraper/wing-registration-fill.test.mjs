import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(
  new URL(
    '../../kiditem-os/content/coupang/wing-registration-fill.js',
    import.meta.url,
  ),
  'utf8',
);

function createHarness() {
  let listener = null;
  let now = 0;
  class FakeDate extends Date {
    static now() {
      now += 1000;
      return now;
    }
  }
  const immediateTimer = (callback) => {
    queueMicrotask(callback);
    return 1;
  };
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
    Date: FakeDate,
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
  context.KidItemWingAccountIdentity = { verifyExpectedVendorId: () => ({ ok: true, vendorId: 'A00012345', source: 'dom:data-vendor-id' }) };
  vm.runInContext(source, context, { filename: 'wing-registration-fill.js' });

  return {
    async fill(product) {
      return new Promise((resolve) => {
        const isAsync = listener?.({ action: 'fillWingForm', product, expectedVendorId: 'A00012345' }, {}, resolve);
        assert.equal(isAsync, true);
      });
    },
  };
}

function createCategorySearchHarness() {
  let listener = null;
  let now = 0;
  let suggestionVisible = false;
  let suggestionClicked = false;
  const editCommands = [];
  const trustedInputRequests = [];
  class FakeDate extends Date {
    static now() {
      now += 1000;
      return now;
    }
  }
  class FakeInput {
    focus() {}
    select() {}
    dispatchEvent() {}
  }
  Object.defineProperty(FakeInput.prototype, 'value', {
    configurable: true,
    get() {
      return this._value ?? '';
    },
    set(next) {
      this._value = String(next);
    },
  });
  const categoryInput = Object.assign(Object.create(FakeInput.prototype), {
    tagName: 'INPUT',
  });
  const suggestion = {
    offsetParent: {},
    textContent: '생활용품>생활소품>열쇠고리/키홀더',
    click() {
      suggestionClicked = true;
    },
  };
  const document = {
    body: { innerText: '' },
    execCommand(command, _showUi, value) {
      editCommands.push({ command, value });
      if (command !== 'insertText') return false;
      categoryInput.value = value;
      suggestionVisible = true;
      return true;
    },
    querySelector(selector) {
      if (selector.includes('placeholder="카테고리명 입력"')) return categoryInput;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'li,div,span,button,a' && suggestionVisible) {
        return [suggestion];
      }
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
    Event,
    HTMLInputElement: FakeInput,
    chrome: {
      runtime: {
        lastError: null,
        onMessage: { addListener(next) { listener = next; } },
        sendMessage(message, callback) {
          if (message?.action === 'inputWingCategorySearch') {
            trustedInputRequests.push(message);
            categoryInput.value = message.value;
            suggestionVisible = true;
            callback?.({ ok: true });
            return;
          }
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
  context.KidItemWingAccountIdentity = {
    verifyExpectedVendorId: () => ({
      ok: true,
      vendorId: 'A00012345',
      source: 'dom:data-vendor-id',
    }),
  };
  vm.runInContext(source, context, { filename: 'wing-registration-fill.js' });

  return {
    async fill() {
      return new Promise((resolve) => {
        listener?.({
          action: 'fillWingForm',
          expectedVendorId: 'A00012345',
          product: {
            categoryCell: '[64687] 생활용품>생활소품>열쇠고리/키홀더',
            detailImageUrls: [],
            variants: [],
          },
        }, {}, resolve);
      });
    },
    editCommands,
    trustedInputRequests,
    wasSuggestionClicked: () => suggestionClicked,
  };
}

function createDirectUploadHarness({
  uploadPayload = {
    success: true,
    message: 'vendor_inventory/abcd/detail.jpg',
  },
  uploadStatus = 200,
  uploadThrows = false,
  htmlSavePersists = true,
  imageTabCanSwitch = true,
  sourceFetchNeverSettles = false,
} = {}) {
  let listener = null;
  let htmlSaveClicks = 0;
  let imageTabClicks = 0;
  let productSaveClicks = 0;
  let appliedHtml = null;
  let persistedHtml = null;
  let htmlSave = null;
  let activeDetailTab = 'image';
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
  const imageTabLabel = {
    click() {
      imageTabClicks += 1;
      if (imageTabCanSwitch) activeDetailTab = 'image';
    },
  };
  const htmlTabLabel = {
    click() {
      activeDetailTab = 'html';
      htmlTab.checked = true;
      textarea.value = persistedHtml ?? '';
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
      if (htmlSavePersists) {
        persistedHtml = textarea.value.replace('<center> <img', '<center>\n<img');
        textarea.value = persistedHtml;
      }
    },
  };
  const section = {
    querySelector(selector) {
      if (selector === '#tab-content-0 + label') return imageTabLabel;
      if (selector === '#tab-content-2') return htmlTab;
      if (selector === '#tab-content-2 + label') return htmlTabLabel;
      if (selector === '.html-area-content textarea') {
        return activeDetailTab === 'html' ? textarea : null;
      }
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
  const harnessTimer = (callback, delay) => {
    if (!sourceFetchNeverSettles && delay >= 8000) return 1;
    return immediateTimer(callback);
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
        if (sourceFetchNeverSettles) return new Promise(() => {});
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
    setTimeout: harnessTimer,
  });
  context.window = context;
  context.KidItemWingAccountIdentity = { verifyExpectedVendorId: () => ({ ok: true, vendorId: 'A00012345', source: 'dom:data-vendor-id' }) };
  context.location = { href: 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2' };
  vm.runInContext(source, context, { filename: 'wing-registration-fill.js' });

  return {
    async fill(detailImageUrls = ['http://localhost:9000/kiditem/detail.jpg']) {
      return new Promise((resolve) => {
        const isAsync = listener?.(
          {
            action: 'fillWingForm',
            expectedVendorId: 'A00012345',
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
    getImageTabClicks() {
      return imageTabClicks;
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

  assert.equal(result.ok, true, result.steps.join(','));
  assert.equal(result.error, undefined);
});

test('requests trusted browser input so Wing renders the exact category suggestion', async () => {
  const harness = createCategorySearchHarness();

  const result = await harness.fill();

  assert.deepEqual(JSON.parse(JSON.stringify(harness.trustedInputRequests)), [
    { action: 'inputWingCategorySearch', value: '열쇠고리/키홀더' },
  ]);
  assert.deepEqual(harness.editCommands, []);
  assert.equal(harness.wasSuggestionClicked(), true);
  assert.ok(result.steps.includes('category:생활용품>생활소품>열쇠고리/키홀더'));
  assert.ok(!result.steps.includes('categoryNoSuggestion'));
});

test('uploads once through uploadV2, then saves exact centered HTML with the CDN URL', async () => {
  const harness = createDirectUploadHarness();
  const result = await harness.fill();

  assert.equal(result.ok, true, result.steps.join(','));
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

test('fails closed instead of hanging when the source image request never settles', async () => {
  const harness = createDirectUploadHarness({ sourceFetchNeverSettles: true });
  const result = await Promise.race([
    harness.fill(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('source image timeout was not enforced')), 100),
    ),
  ]);

  assert.equal(result.ok, false);
  assert.equal(harness.getHtmlSaveClicks(), 0);
  assert.equal(harness.getProductSaveClicks(), 0);
  assert.ok(result.steps.includes('detailFetchFailed'));
});

test('accepts persisted HTML even when the WING Save control remains enabled', async () => {
  const harness = createDirectUploadHarness();
  const result = await harness.fill();

  assert.equal(result.ok, true, result.steps.join(','));
  assert.equal(harness.getHtmlSaveClicks(), 1);
  assert.ok(result.steps.includes('detailHtml:1'));
});

test('accepts normalized saved HTML without requiring the WING image tab to switch', async () => {
  const harness = createDirectUploadHarness({ imageTabCanSwitch: false });
  const result = await harness.fill();

  assert.equal(result.ok, true, result.steps.join(','));
  assert.equal(harness.getHtmlSaveClicks(), 1);
  assert.equal(harness.getImageTabClicks(), 0);
  assert.ok(result.steps.includes('detailHtml:1'));
});

test('fails when the WING editor does not acknowledge the saved HTML', async () => {
  const harness = createDirectUploadHarness({ htmlSavePersists: false });
  const result = await harness.fill();

  assert.equal(result.ok, false);
  assert.equal(harness.getHtmlSaveClicks(), 1);
  assert.equal(harness.getProductSaveClicks(), 0);
  assert.ok(result.steps.includes('detailHtmlNotPersisted'));
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
function createOptionAndNoticeHarness({
  rowCount = 1,
  cascade = true,
  optionCreationAvailable = true,
  optionCreationMode = 'legacy',
  generatedRowCount = 0,
  dynamicRequiredOptionTypes = ['색상', '수량'],
  vendorCodeInputAvailable = true,
  // 라이브 formV2 는 판매자상품코드 입력칸에 placeholder/name/aria-label 을 주지 않아
  // 직접 셀렉터로는 잡히지 않는다. 그때 열 위치로 찾아내는 경로를 켠다.
  vendorCodeColumnOnly = false,
} = {}) {
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
  /**
   * 옵션 행 한 줄.
   *
   * 라이브 구조(2026-09-10 실측): 행은 `.option-pane-table-row` 이고 그 안에
   * 체크박스가 있다. 행을 담는 상자 이름(`-content` → `-body`)은 쿠팡이 바꾼다.
   * 그래서 하네스도 상자가 아니라 행으로 준다.
   */
  const asDataRow = (box) => ({
    className: 'option-pane-table-row',
    closest: () => null,
    querySelector: (selector) => (selector.includes('checkbox') ? box : null),
    querySelectorAll: () => [],
  });
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

  // ⭐ 라이브 실측(formV2, 2026-07) 옵션표 구조를 그대로 본뜬다.
  //    헤더 셀 16개 중 4개(2, 8, 9, 10)가 다른 헤더 셀 **안에 중첩**돼 있고
  //    (옵션명 2열 묶음, 자동가격조정 3열 묶음), 본문 행은 13셀이다.
  //    그래서 헤더 인덱스(판매자상품코드 = 12)를 본문 셀에 그대로 쓰면 어긋난다.
  //    본문에서의 실제 위치는 9다.
  const COLUMN_X = [
    [0, 40], [40, 300], [300, 380], [380, 520], [520, 660], [660, 800],
    [800, 940], [940, 1080], [1080, 1220], [1738, 1913], [1913, 2050],
    [2050, 2190], [2190, 2230],
  ];
  const rectOf = ([left, right]) => () => ({ left, right, width: right - left, top: 0, bottom: 30 });
  // FakeInput 은 아래에서 선언되므로 입력칸은 처음 조회될 때 만든다.
  const textCell = (range) => {
    const cell = {
      className: 'option-pane-table-cell',
      getBoundingClientRect: rectOf(range),
      querySelector: (sel) => {
        if (!sel.includes('input')) return null;
        if (!cell._input) {
          cell._input = Object.assign(Object.create(FakeInput.prototype), {
            type: 'text', tagName: 'INPUT', dispatchEvent() {},
          });
        }
        return cell._input;
      },
    };
    return cell;
  };
  const plainCell = (range) => ({
    className: 'option-pane-table-cell',
    getBoundingClientRect: rectOf(range),
    querySelector: () => null,
  });
  const columnCells = COLUMN_X.map((range, index) =>
    [3, 4, 8, 9, 10, 11].includes(index) ? textCell(range) : plainCell(range));
  // 실제 본문 행에는 체크박스가 있다. 없으면 행을 못 찾아 일괄입력이 조용히 무시된다.
  const columnRowCheck = checkbox('row');
  const columnBodyRow = {
    className: 'option-pane-table-row',
    closest: () => null,
    querySelector: (selector) => (selector.includes('checkbox') ? columnRowCheck : null),
    querySelectorAll: () => columnCells,
  };
  const headCell = (text, range, nested) => ({
    textContent: text,
    getBoundingClientRect: rectOf(range),
    contains: (other) => nested.includes(other),
  });
  const nestedOptionName = headCell('옵션명', [40, 300], []);
  const nestedAuto = [
    headCell('자동가격조정', [940, 1080], []),
    headCell('최저가', [940, 1010], []),
    headCell('설정 가격', [1010, 1080], []),
  ];
  const headCells = [
    headCell('', COLUMN_X[0], []),
    headCell('옵션명', COLUMN_X[1], [nestedOptionName]),
    nestedOptionName,
    headCell('노출상태', COLUMN_X[2], []),
    headCell('정상가 (원)', COLUMN_X[3], []),
    headCell('판매가 (원)', COLUMN_X[4], []),
    headCell('단위당가격(원)', COLUMN_X[5], []),
    headCell('자동가격조정 최저가 설정 가격', COLUMN_X[6], nestedAuto),
    ...nestedAuto,
    headCell('재고수량', COLUMN_X[8], []),
    headCell('판매자상품코드 업체(셀러)에서 자체적으로 관리하는 상품코드', COLUMN_X[9], []),
    headCell('모델 번호', COLUMN_X[10], []),
    headCell('상품 바코드', COLUMN_X[11], []),
    headCell('삭제', COLUMN_X[12], []),
  ];

  const optionRoot = {
    querySelector(selector) {
      return selector.includes('option-pane-table-head') ? selectAll : null;
    },
    querySelectorAll(selector) {
      if (vendorCodeColumnOnly && selector.includes('option-pane-table-head')) return headCells;
      if (selector.includes('option-pane-table-row')) {
        return vendorCodeColumnOnly ? [columnBodyRow] : rows.map(asDataRow);
      }
      return [];
    },
  };

  const optionCreation = { offsetParent: {} };
  const generateItems = {
    id: 'generateItems',
    disabled: false,
    hasAttribute: () => false,
    click() {
      events.push('generateItems');
      while (rows.length < generatedRowCount) rows.push(checkbox('row'));
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
  let vendorCodeInput = null;
  const document = {
    body: { innerText: '' },
    querySelector(selector) {
      if (selector.includes('placeholder="카테고리명 입력"')) return categoryInput;
      if (selector === '.option-content') return optionRoot;
      if (selector === '.notice-category-option-section') return noticeSection;
      if (selector.includes('판매자상품코드') || selector.includes('업체상품코드')) {
        return vendorCodeInput;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'button') return buttons;
      if (selector === 'input[type="number"]') return numberInputs;
      if (selector.includes('판매자상품코드') || selector.includes('업체상품코드')) {
        return vendorCodeInput ? [vendorCodeInput] : [];
      }
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
  if (vendorCodeInputAvailable) {
    vendorCodeInput = Object.assign(Object.create(FakeInput.prototype), {
      tagName: 'INPUT',
      placeholder: '업체상품코드 입력',
      offsetParent: {},
      dispatchEvent(event) {
        events.push(`vendorCode:${event.type}`);
      },
    });
  }
  const dynamicAppliedOptions = new Map();
  const makeOptionInput = (optionType, placeholder) => {
    const input = Object.create(FakeInput.prototype);
    let container = null;
    Object.assign(input, {
      tagName: 'INPUT',
      placeholder,
      offsetParent: {},
      dispatchEvent(event) {
        events.push(`optionInput:${optionType}:${event.type}`);
      },
      focus() {},
      blur() {},
      closest() {
        return optionCreationMode === 'dynamic' ? container : null;
      },
    });
    const row = {
      get textContent() {
        const value = dynamicAppliedOptions.get(optionType);
        return value ? `${optionType} ${value}` : optionType;
      },
      querySelector(selector) {
        if (selector === '.attribute-type') return { textContent: optionType };
        if (selector.includes(`placeholder="${placeholder}"`)) return input;
        return null;
      },
      querySelectorAll(selector) {
        return selector === 'input' ? [input] : [];
      },
    };
    const addButton = {
      textContent: '추가',
      click() {
        dynamicAppliedOptions.set(optionType, input.value);
        events.push(`optionAdd:${optionType}`);
        input.value = '';
        if (dynamicRequiredOptionTypes.every((type) => dynamicAppliedOptions.has(type))) {
          while (rows.length < generatedRowCount) rows.push(checkbox('row'));
        }
      },
    };
    container = {
      parentElement: null,
      querySelectorAll(selector) {
        return selector === 'button' ? [addButton] : [];
      },
    };
    return { input, row };
  };
  const colorOption = makeOptionInput('색상', '옵션값 입력');
  const weightOption = makeOptionInput('개당 중량', '숫자만 입력');
  const quantityOption = makeOptionInput('수량', '숫자만 입력');
  const dynamicOptionCreation = {
    offsetParent: {},
    querySelectorAll(selector) {
      return selector.includes('.attribute')
        ? [colorOption.row, weightOption.row, quantityOption.row]
        : [];
    },
  };

  const originalQuerySelector = document.querySelector.bind(document);
  document.querySelector = (selector) => {
    if (selector === '.dynamic-option-form-pane') {
      return optionCreationAvailable && optionCreationMode === 'dynamic'
        ? dynamicOptionCreation
        : null;
    }
    if (selector === '.option-creation') {
      return optionCreationAvailable && optionCreationMode === 'legacy'
        ? optionCreation
        : null;
    }
    if (selector === '#generateItems') {
      return optionCreationAvailable && optionCreationMode === 'legacy'
        ? generateItems
        : null;
    }
    if (selector.includes('placeholder="옵션값 입력"')) return colorOption.input;
    if (selector.includes('placeholder="숫자만 입력"')) return quantityOption.input;
    return originalQuerySelector(selector);
  };
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
  context.KidItemWingAccountIdentity = { verifyExpectedVendorId: () => ({ ok: true, vendorId: 'A00012345', source: 'dom:data-vendor-id' }) };
  vm.runInContext(source, context, { filename: 'wing-registration-fill.js' });

  return {
    async fill(variant) {
      return new Promise((resolve) => {
        listener?.(
          {
            action: 'fillWingForm',
            expectedVendorId: 'A00012345',
            product: { categoryCell: '', detailImageUrls: [], variants: [variant] },
          },
          {},
          resolve,
        );
      });
    },
    events,
    columnCells,
    rows,
    noticeRows,
    getNoticeCategory: () => noticeCurrent,
    getBulkValues: () => numberInputs.map((input) => input.value),
    getVendorCode: () => vendorCodeInput?.value ?? '',
  };
}

const VARIANT = { purchaseOptions: [], salePrice: 4000, stock: 999 };

test('fills the real Sellpia SKU into the WING vendor item code before registration', async () => {
  const harness = createOptionAndNoticeHarness();
  const result = await harness.fill({ ...VARIANT, vendorItemCode: '10451-1' });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(harness.getVendorCode(), '10451-1');
  assert.ok(result.steps.includes('vendorItemCode:10451-1'));
});

test('fails closed when a verified Sellpia code cannot be written to the WING form', async () => {
  const harness = createOptionAndNoticeHarness({ vendorCodeInputAvailable: false });
  const result = await harness.fill({ ...VARIANT, vendorItemCode: '10451-1' });

  assert.equal(result.ok, false);
  // 판매자상품코드 칸은 옵션표 안에 있고, 옵션표는 카테고리를 골라야 렌더된다.
  // 카테고리가 비어 있으면 "칸을 못 찾았다"가 아니라 1차 원인을 보고해야 한다.
  assert.match(result.error, /카테고리가 정해지지 않아/);
  assert.ok(result.steps.includes('categoryMissing'));
  assert.ok(result.steps.includes('vendorItemCodeFailed'));
});

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

test('fails closed when Wing does not render the category option creation panel', async () => {
  const harness = createOptionAndNoticeHarness({
    rowCount: 0,
    optionCreationAvailable: false,
  });
  const result = await harness.fill({
    purchaseOptions: [{ type: '색상', value: '빨강' }],
    salePrice: 4000,
    stock: 999,
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /카테고리가 정해지지 않아/);
  assert.ok(result.steps.includes('categoryMissing'));
  assert.ok(result.steps.includes('optionCreationUnavailable'));
  assert.equal(harness.events.includes('generateItems'), false);
});

test('generates option rows before selecting rows and filling price and stock', async () => {
  const harness = createOptionAndNoticeHarness({ rowCount: 0, generatedRowCount: 1 });
  const result = await harness.fill({
    purchaseOptions: [{ type: '색상', value: '빨강' }],
    salePrice: 4000,
    stock: 999,
  });

  assert.equal(result.ok, true, result.steps.join(','));
  assert.ok(result.steps.includes('optionRows:1'));
  assert.ok(result.steps.includes('salePrice:4000'));
  assert.ok(result.steps.includes('stock:999'));
  assert.ok(harness.events.indexOf('generateItems') < harness.events.indexOf('selectAll:true'));
});

test('supports current DynamicOption rows that auto-generate without #generateItems', async () => {
  const harness = createOptionAndNoticeHarness({
    rowCount: 0,
    generatedRowCount: 1,
    optionCreationMode: 'dynamic',
  });
  const result = await harness.fill({
    purchaseOptions: [
      { type: '색상', value: '테스트 블루' },
      { type: '수량', value: '1개' },
    ],
    salePrice: 12900,
    stock: 999,
  });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(result.steps.includes('option:색상=테스트 블루'));
  assert.ok(result.steps.includes('option:수량=1'));
  assert.ok(result.steps.includes('optionRows:1'));
  assert.equal(harness.events.includes('generateItems'), false);
  assert.ok(harness.events.indexOf('optionAdd:수량') < harness.events.indexOf('selectAll:true'));
  assert.deepEqual(harness.getBulkValues(), ['12900', '999']);
});

test('fills every live required DynamicOption attribute before generating rows', async () => {
  const harness = createOptionAndNoticeHarness({
    rowCount: 0,
    generatedRowCount: 1,
    optionCreationMode: 'dynamic',
    dynamicRequiredOptionTypes: ['색상', '개당 중량', '수량'],
  });
  const result = await harness.fill({
    purchaseOptions: [
      { type: '색상', value: '단일' },
      { type: '개당 중량', value: '120g' },
      { type: '수량', value: '1개' },
    ],
    salePrice: 12900,
    stock: 999,
  });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(result.steps.includes('option:개당 중량=120'));
  assert.ok(result.steps.includes('optionRows:1'));
  assert.ok(harness.events.includes('optionAdd:개당 중량'));
  assert.ok(harness.events.indexOf('optionAdd:개당 중량') < harness.events.indexOf('selectAll:true'));
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
 *   1) autoSubmit 미지정/false 면 제출 버튼도 모달 버튼도 **찾지도 누르지도 않는다**
 *   2) '페이지 별점주기' 위젯의 `등록`(#report-rating-trigger)을 제출/확인 버튼으로 오인하지 않는다
 *   3) 임시저장/판매요청을 누르지 않는다
 *   4) 완료 안내를 못 보면 성공으로 보고하지 않는다(status:'unknown')
 *   5) 폼 '상품등록' → **확인 모달의 '상품등록'** 2단계를 모두 누른다
 *   6) 확인 모달의 '취소'는 **절대** 누르지 않는다
 *
 * 확인 모달 DOM 은 라이브 실측(SweetAlert 1.x 싱글턴)을 따른다:
 *   div.sweet-alert > div.alert-buttons > button.cancel('취소') + button.confirm('상품등록')
 * 완료 모달은 별도 Vue 컴포넌트라 `.sweet-alert` 가 아니고, 그 안의
 * '상품목록'/'새로운 상품등록'은 스코프상 후보가 될 수 없다.
 * ─────────────────────────────────────────────────────────────────────────────
 */
function createSubmitHarness({
  autoSubmitLabel = '상품등록',
  succeeds = true,
  registeredProductId = '16311428128',
  disabled = false,
  // 확인 모달이 뜨는가. false 면 폼 클릭만으로 바로 등록되는 흐름을 흉내낸다.
  opensConfirmModal = true,
  // 확인 모달의 확인 버튼 라벨. '확인'이면 등록과 무관한 SweetAlert 재사용 알림이다.
  confirmModalLabel = null,
  // 완료 안내 문구. 라이브는 `등록상품ID : 16311492950`(콜론+공백).
  successText = null,
} = {}) {
  let listener = null;
  const clicks = [];
  let bodyText = '';
  let modalOpen = false;
  let now = 0;

  class FakeDate extends Date {
    static now() {
      now += 1000;
      return now;
    }
  }

  const succeed = () => {
    bodyText =
      successText ?? `상품등록이 완료되었습니다. 등록상품ID : ${registeredProductId}`;
  };

  // ⚠️ 스프레드(`{...extra}`)를 쓰면 안 된다. 게터가 즉시 평가돼 값으로 굳어버려
  //    모달 표시 상태(offsetParent)가 생성 시점에 고정된다.
  const makeButton = (textContent, extra = {}) => {
    const button = {
      textContent,
      offsetParent: {},
      parentElement: null,
      disabled: false,
      hasAttribute: () => false,
      click() {
        clicks.push(textContent);
        button.onClick?.();
      },
    };
    Object.defineProperties(button, Object.getOwnPropertyDescriptors(extra));
    return button;
  };

  // ⚠️ 실제 WING 페이지에 함께 존재하는 버튼들. 제출 대상은 오직 하나여야 한다.
  const ratingWidget = { id: 'report-rating-trigger', className: 'rating-widget', parentElement: null };
  const ratingRegister = makeButton('등록', { parentElement: ratingWidget });
  const tempSave = makeButton('임시저장');
  const sellRequest = makeButton('판매요청');
  const submit = makeButton(autoSubmitLabel, {
    disabled,
    hasAttribute: (name) => name === 'disabled' && disabled,
    onClick() {
      if (disabled) return;
      // 폼 버튼은 **등록하지 않는다**. 확인 모달을 띄우거나(기본),
      // 모달 없는 흐름이면 그때만 바로 완료된다.
      if (opensConfirmModal) modalOpen = true;
      else if (succeeds) succeed();
    },
  });

  // 확인 모달(SweetAlert 싱글턴). 닫혀 있어도 DOM 에는 항상 존재한다 — 라이브 실측.
  const sweetAlert = {
    className: 'sweet-alert',
    parentElement: null,
    get offsetParent() {
      return modalOpen ? {} : null;
    },
  };
  const modalCancel = makeButton('취소', {
    className: 'cancel',
    parentElement: sweetAlert,
    get offsetParent() {
      return modalOpen ? {} : null;
    },
    onClick() {
      // 취소가 눌리면 등록은 영영 일어나지 않는다. 스펙이 이 상태를 잡아낸다.
      modalOpen = false;
    },
  });
  const modalConfirm = makeButton(confirmModalLabel ?? autoSubmitLabel, {
    className: 'confirm alert-confirm',
    parentElement: sweetAlert,
    get offsetParent() {
      return modalOpen ? {} : null;
    },
    onClick() {
      modalOpen = false;
      if (succeeds) succeed();
    },
  });
  sweetAlert.querySelector = (selector) => {
    if (selector === 'button.confirm') return modalConfirm;
    if (selector === 'button.cancel') return modalCancel;
    return null;
  };

  // 완료 모달의 이동 버튼들. 절대 눌리면 안 된다(누르면 화면이 떠나 ID 를 못 읽는다).
  const goList = makeButton('상품목록');
  const goNew = makeButton('새로운 상품등록');

  const buttons = [
    ratingRegister,
    tempSave,
    sellRequest,
    submit,
    goList,
    goNew,
    // ⚠️ 문서 순서상 모달이 폼보다 **뒤**다. findSubmitButton 의 "마지막 후보" 규칙이
    //    모달 확인 버튼을 폼 제출 버튼으로 집으면 안 된다.
    modalCancel,
    modalConfirm,
  ];

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
      if (selector === '.sweet-alert') return [sweetAlert];
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
  context.KidItemWingAccountIdentity = { verifyExpectedVendorId: () => ({ ok: true, vendorId: 'A00012345', source: 'dom:data-vendor-id' }) };
  context.location = { href: 'https://wing.coupang.com/tenants/seller-web/vendor-inventory/formV2' };
  vm.runInContext(source, context, { filename: 'wing-registration-fill.js' });

  return {
    async fill(message) {
      return new Promise((resolve) => {
        const isAsync = listener?.(
          { action: 'fillWingForm', expectedVendorId: 'A00012345', product: { categoryCell: '', detailImageUrls: [] }, ...message },
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

test('never touches a submit or confirm-modal button unless autoSubmit is explicitly true', async () => {
  // 미지정 / false / truthy 하지만 true 가 아닌 값 — 전부 제출하지 않는다.
  // 폼 버튼도, 확인 모달 버튼도 누르지 않는다(모달은 애초에 열리지도 않는다).
  for (const message of [{}, { autoSubmit: false }, { autoSubmit: 'yes' }, { autoSubmit: 1 }]) {
    const harness = createSubmitHarness();
    const result = await harness.fill(message);

    assert.equal(result.ok, true);
    assert.deepEqual(harness.getClicks(), [], `autoSubmit=${JSON.stringify(message)} clicked a button`);
    assert.ok(!result.steps.some((step) => step.startsWith('submit:confirmModal')));
    assert.equal(result.submission.attempted, false);
    assert.equal(result.submission.clicked, undefined);
    assert.ok(!result.steps.some((step) => step.startsWith('submit:')));
  }
});

test('submits and reports the registered product id when autoSubmit is on', async () => {
  const harness = createSubmitHarness();
  const result = await harness.fill({ autoSubmit: true });

  assert.equal(result.ok, true);
  // 폼 '상품등록' → 확인 모달 '상품등록' 2단계. 별점 위젯의 '등록', 임시저장,
  // 판매요청, 완료 모달의 상품목록/새로운 상품등록은 절대 눌리지 않는다.
  assert.deepEqual(harness.getClicks(), ['상품등록', '상품등록']);
  assert.equal(result.submission.ok, true);
  assert.equal(result.submission.status, 'registered');
  assert.equal(result.submission.externalListingId, '16311428128');
  assert.ok(result.steps.includes('submit:click:상품등록'));
  assert.ok(result.steps.includes('submit:confirmModal:상품등록'));
});

test('submits the 수정 및 검수 요청 button on the edit screen', async () => {
  const harness = createSubmitHarness({ autoSubmitLabel: '수정 및 검수 요청' });
  const result = await harness.fill({ autoSubmit: true });

  assert.deepEqual(harness.getClicks(), ['수정 및 검수 요청', '수정 및 검수 요청']);
  assert.equal(result.submission.ok, true);
});

test('clicks the confirm modal 상품등록 and never its 취소', async () => {
  // ⭐ 라이브 재현 버그: 폼 '상품등록'만 누르고 확인 모달에서 멈췄다.
  //    모달의 확인을 눌러야 실제 등록이 일어난다.
  const harness = createSubmitHarness();
  const result = await harness.fill({ autoSubmit: true });

  const clicks = harness.getClicks();
  assert.equal(clicks.length, 2, `확인 모달 클릭이 정확히 한 번이어야 한다: ${clicks}`);
  assert.ok(!clicks.includes('취소'), '확인 모달의 취소를 눌렀다 — 등록이 취소된다');
  assert.equal(result.submission.status, 'registered');
});

test('never clicks the completion modal 상품목록 / 새로운 상품등록', async () => {
  // 완료 모달의 이동 버튼을 누르면 화면이 떠나 등록상품ID 를 못 읽는다(커밋 f4da499c).
  const harness = createSubmitHarness();
  await harness.fill({ autoSubmit: true });

  for (const forbidden of ['상품목록', '새로운 상품등록']) {
    assert.ok(!harness.getClicks().includes(forbidden), `${forbidden} 을 눌렀다`);
  }
});

test('proceeds without a confirm modal when the flow registers directly', async () => {
  // 모달이 안 뜨는 흐름도 있을 수 있다. 기다렸다가 없으면 그냥 진행한다.
  const harness = createSubmitHarness({ opensConfirmModal: false });
  const result = await harness.fill({ autoSubmit: true });

  assert.deepEqual(harness.getClicks(), ['상품등록']);
  assert.equal(result.submission.status, 'registered');
  assert.ok(result.steps.includes('submit:noConfirmModal'));
});

test('does not treat an unrelated SweetAlert notice as the registration confirm', async () => {
  // WING 은 같은 SweetAlert 싱글턴을 '최대 9개까지…' 같은 안내에도 재사용한다.
  // 그 확인 라벨은 '확인'이라 등록 확인으로 오인하면 안 된다.
  const harness = createSubmitHarness({ confirmModalLabel: '확인', succeeds: false });
  const result = await harness.fill({ autoSubmit: true });

  assert.deepEqual(harness.getClicks(), ['상품등록']);
  assert.ok(result.steps.includes('submit:noConfirmModal'));
  assert.equal(result.submission.status, 'unknown');
  assert.equal(result.submission.ok, false);
});

test('extracts the registered id from the live 등록상품ID : 16311492950 wording', async () => {
  // 라이브 완료 모달은 `${$t(inventory-id-text)} : ${inventoryId}` 단일 리터럴이라
  // 콜론+공백이 들어간다. 번들 실측 문구를 그대로 고정한다.
  const harness = createSubmitHarness({
    successText: '상품등록이 완료되었습니다.\n등록상품ID : 16311492950\n상품목록 새로운 상품등록',
  });
  const result = await harness.fill({ autoSubmit: true });

  assert.equal(result.submission.ok, true);
  assert.equal(result.submission.externalListingId, '16311492950');
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
  // 2단계를 모두 눌렀는데도 완료 문구가 없으면 성공으로 보고하지 않는다.
  const harness = createSubmitHarness({ succeeds: false });
  const result = await harness.fill({ autoSubmit: true });

  assert.deepEqual(harness.getClicks(), ['상품등록', '상품등록']);
  assert.equal(result.submission.ok, false);
  assert.equal(result.submission.status, 'unknown');
  assert.equal(result.submission.externalListingId, null);
  assert.ok(result.steps.includes('submit:unconfirmed'));
});

test('reports unknown when the confirm modal never appears and nothing registers', async () => {
  // 확인 모달이 안 떠서 등록이 안 됐는데 성공으로 보고하면 안 된다.
  const harness = createSubmitHarness({ opensConfirmModal: false, succeeds: false });
  const result = await harness.fill({ autoSubmit: true });

  assert.deepEqual(harness.getClicks(), ['상품등록']);
  assert.equal(result.submission.ok, false);
  assert.equal(result.submission.status, 'unknown');
  assert.equal(result.submission.externalListingId, null);
});

// Regression: 라이브 formV2 실측(2026-07)
// 판매자상품코드 입력칸에는 placeholder/name/aria-label 이 없어 직접 셀렉터가 0건이다.
// 예전 폴백은 헤더 인덱스(12)를 본문 셀에 그대로 썼는데, 헤더에는 중첩 셀 4개가
// 섞여 있어 본문의 실제 위치(9)와 어긋났고 `cells[12]` 는 입력칸 없는 '삭제' 셀이었다.
// 그래서 항상 "입력칸을 찾지 못했습니다" 로 끝났다.
test('판매자상품코드를 헤더 인덱스가 아니라 열 위치로 찾아 채운다', async () => {
  const harness = createOptionAndNoticeHarness({
    vendorCodeInputAvailable: false,
    vendorCodeColumnOnly: true,
  });

  const result = await harness.fill({ ...VARIANT, vendorItemCode: '10451-1' });

  assert.ok(
    result.steps.includes('vendorItemCode:10451-1'),
    JSON.stringify({ steps: result.steps, error: result.error }),
  );
  // 헤더 인덱스 12 가 아니라 본문 9번 셀에만 들어가야 한다.
  assert.deepEqual(
    harness.columnCells.map((cell) => cell._input?.value ?? null),
    [null, null, null, null, null, null, null, null, null, '10451-1', null, null, null],
  );
});
