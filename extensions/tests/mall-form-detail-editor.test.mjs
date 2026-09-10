import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const modulePath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/orders/mall-form-register.js',
);

function loadModule() {
  // 서비스워커가 가진 전역만 넘긴다. 여기서 빠뜨리면 모듈이 조용히 다른 길로 샌다
  // (예: URL 이 없으면 등록 주소 검사가 통째로 실패한다).
  const context = {
    self: {}, console, URL, URLSearchParams, TextDecoder, TextEncoder,
    FormData, Blob, File, Promise, Date, setTimeout, clearTimeout,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
  return context.self.KidItemMallFormRegister;
}

const PAYLOAD = {
  html: '<center><img src="https://kids-wi.kakaocdn.net/dn/AA/BB/img.jpg"></center>',
  formSelector: '#lFormRegItem',
  target: 'itemMemo[Item]',
  buttonId: 'lBtnWriteItemMemo',
  editorKey: 'Item',
  toggleSelector: 'input.lBtnContentType',
  framePrefix: 'easyWebEditor_lTextarea',
  frameSuffix: '_iframe',
  submitId: 'lBtnSubmit',
  openTimeoutMs: 1000,
  submitTimeoutMs: 1000,
};

/**
 * 도매꾹 등록화면과 그 화면이 여는 에디터 팝업의 최소 흉내.
 *
 * 라이브에서 확인한 것만 흉내낸다(2026-09-10): 버튼을 누르면 `window.open` 으로
 * 팝업이 열리고, 작성 항목 네 개가 전부 켜진 채이며 상품정보 말고는 비어 있다.
 * 등록을 누르면 에디터가 opener 의 `itemMemo[Item]` 을 채우고 창을 닫는다.
 */
function makePage({ deliContent = '', openReturns = 'popup', submitBehaviour = 'fill' } = {}) {
  const frames = { Item: '', Deli: deliContent, Event: '', OtherItem: '' };
  const toggles = ['Item', 'Deli', 'Event', 'OtherItem'].map((value) => ({
    value,
    checked: true,
    disabled: value === 'Item',
    clicks: 0,
  }));
  for (const toggle of toggles) {
    toggle.click = () => { toggle.clicks += 1; toggle.checked = !toggle.checked; };
  }

  const field = { value: '' };
  const form = { elements: { 'itemMemo[Item]': field } };
  const submit = { clicks: 0 };
  const popupElements = { lBtnSubmit: submit };
  for (const key of Object.keys(frames)) {
    popupElements[`easyWebEditor_lTextarea${key}_iframe`] = {
      contentDocument: {
        body: {
          get innerHTML() { return frames[key]; },
          set innerHTML(value) { frames[key] = value; },
          dispatchEvent: () => true,
        },
      },
    };
  }

  const popup = {
    closed: false,
    closeCalls: 0,
    alert: () => { throw new Error('네이티브 대화상자가 떴다 — 화면이 얼어붙는다.'); },
    close() { this.closed = true; this.closeCalls += 1; },
    document: {
      getElementById: (id) => popupElements[id] || null,
      querySelectorAll: (selector) => (selector === 'input.lBtnContentType' ? toggles : []),
    },
  };

  submit.click = () => {
    submit.clicks += 1;
    if (submitBehaviour === 'fill') { field.value = frames.Item; popup.close(); return; }
    // 몰이 항의하는 경우. 삼키지 않으면 여기서 화면이 멈춘다.
    popup.alert('배송,교환,반품,A/S 정보에 내용을 입력해주세요');
  };

  const button = { clicks: 0 };
  const page = {
    frames, toggles, popup, field, button,
    window: {
      open: () => { page.window.openCalls += 1; return openReturns === 'popup' ? popup : null; },
      openCalls: 0,
    },
    document: {
      getElementById: (id) => (id === 'lBtnWriteItemMemo' ? button : null),
      querySelector: (selector) => (selector === '#lFormRegItem' ? form : null),
    },
  };
  button.click = () => { button.clicks += 1; page.window.open(); };
  return page;
}

async function drive(fn, page, payload = PAYLOAD) {
  const context = {
    document: page.document,
    window: page.window,
    setTimeout,
    Promise,
    Date,
    Array,
    String,
    Boolean,
    Object,
  };
  context.globalThis = context;
  vm.createContext(context);
  const call = vm.runInContext(`(${fn.toString()})`, context);
  return call(payload);
}

test('상세내용은 등록화면 칸이 아니라 작성하기 에디터로 넣는다', () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS.domeggook.detailEditor.buttonId, 'lBtnWriteItemMemo');
  assert.equal(SPECS.domeggook.detailEditor.editorKey, 'Item');
  // 온채널에는 그 에디터가 없다. 몰마다 다른 것은 스펙 한 덩어리뿐이어야 한다.
  assert.equal(SPECS.onch.detailEditor, undefined);
});

test('버튼이 연 창을 그대로 잡는다 — 주소로 찾아다니지 않는다', async () => {
  const { pageFunctions } = loadModule();
  const page = makePage();

  const outcome = await drive(pageFunctions.driveDetailEditor, page);

  assert.equal(page.button.clicks, 1);
  assert.equal(page.window.openCalls, 1);
  assert.equal(outcome.ok, true);
  assert.equal(outcome.filled, true);
  assert.equal(page.frames.Item, PAYLOAD.html);
  assert.equal(page.field.value, PAYLOAD.html);
});

test('창이 열리지 않으면 이유를 돌려준다', async () => {
  const { pageFunctions } = loadModule();
  const page = makePage({ openReturns: null });

  const outcome = await drive(pageFunctions.driveDetailEditor, page);

  assert.equal(outcome.ok, false);
  assert.match(outcome.error, /열리지 않았습니다/);
});

test('켜져 있는데 비어 있는 항목만 끈다', async () => {
  const { pageFunctions } = loadModule();
  const page = makePage();

  const outcome = await drive(pageFunctions.driveDetailEditor, page);

  assert.deepEqual(Array.from(outcome.turnedOff), ['Deli', 'Event', 'OtherItem']);
  // 상품정보는 disabled 다. 끄려고 건드리면 안 된다.
  assert.equal(page.toggles[0].clicks, 0);
});

test('내용이 있는 항목은 끄지 않는다 — 판매자가 써 둔 것을 지우지 않는다', async () => {
  const { pageFunctions } = loadModule();
  const page = makePage({ deliContent: '<p>3일 내 발송합니다</p>' });

  const outcome = await drive(pageFunctions.driveDetailEditor, page);

  assert.deepEqual(Array.from(outcome.turnedOff), ['Event', 'OtherItem']);
  assert.equal(page.toggles[1].checked, true);
  assert.equal(page.frames.Deli, '<p>3일 내 발송합니다</p>');
});

test('태그만 남은 빈 껍데기도 비어 있는 것으로 본다', async () => {
  const { pageFunctions } = loadModule();
  // 에디터가 남기는 빈 문단이다. 내용으로 세면 그 항목이 켜진 채 남고 제출 때 막힌다.
  const page = makePage({ deliContent: '<p><br></p>&nbsp;\n  ' });

  const outcome = await drive(pageFunctions.driveDetailEditor, page);

  assert.deepEqual(Array.from(outcome.turnedOff), ['Deli', 'Event', 'OtherItem']);
});

test('내 다른 판매상품 홍보는 값을 채운 뒤 켠 채로 둔다', async () => {
  const { pageFunctions } = loadModule();
  const page = makePage();

  const outcome = await drive(pageFunctions.driveDetailEditor, page, {
    ...PAYLOAD,
    promoKey: 'OtherItem',
    promoHtml: 'descn2',
  });

  // 켜고 비워두면 도매꾹이 제출을 막는다. 값이 있으니 끄지 않는다.
  assert.deepEqual(Array.from(outcome.turnedOff), ['Deli', 'Event']);
  assert.equal(page.toggles[3].checked, true);
  assert.equal(page.frames.OtherItem, 'descn2');
  assert.equal(outcome.filled, true);
});

test('홍보 값이 없으면 그 항목도 끈다', async () => {
  const { pageFunctions } = loadModule();
  const page = makePage();

  const outcome = await drive(pageFunctions.driveDetailEditor, page, {
    ...PAYLOAD,
    promoKey: 'OtherItem',
    promoHtml: '',
  });

  assert.deepEqual(Array.from(outcome.turnedOff), ['Deli', 'Event', 'OtherItem']);
  assert.equal(page.frames.OtherItem, '');
});

test('이미지만 있는 항목은 내용으로 본다 — 몰의 판정과 같다', async () => {
  const { pageFunctions } = loadModule();
  const page = makePage({ deliContent: '<img src="https://x/y.jpg">' });

  const outcome = await drive(pageFunctions.driveDetailEditor, page);

  assert.deepEqual(Array.from(outcome.turnedOff), ['Event', 'OtherItem']);
});

test('몰이 띄우는 대화상자는 삼켜서 가져온다 — 뜨면 등록화면까지 멈춘다', async () => {
  const { pageFunctions } = loadModule();
  const page = makePage({ submitBehaviour: 'complain' });

  const outcome = await drive(pageFunctions.driveDetailEditor, page);

  assert.equal(outcome.ok, true);
  assert.equal(outcome.filled, false);
  assert.deepEqual(
    Array.from(outcome.alerts),
    ['배송,교환,반품,A/S 정보에 내용을 입력해주세요'],
  );
  // 반쯤 열린 창을 남기지 않는다.
  assert.equal(page.popup.closed, true);
});

/**
 * 상세 이미지를 올릴 곳까지 포함한 한 판.
 *
 * 이 경로가 조용히 끊기면 증상은 "도매꾹이 작성하기 버튼을 안 누르고 그냥 끝난다"
 * 로 나온다 — 올릴 데가 없으면 넣을 HTML 도 없어서 에디터를 열 이유가 사라지기
 * 때문이다. 그래서 호스팅과 에디터를 한 테스트에서 같이 본다.
 */
function encode(text) {
  const bytes = new TextEncoder().encode(text);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

const HOSTED = 'https://kids-wi.kakaocdn.net/dn/bcUo/dJMc/nEXg/img.jpg';

test('상세 이미지는 리퍼러를 보내지 않게 넣는다', async () => {
  const { create } = loadModule();
  const harness = makeRegisterHarness();
  let html = '';
  harness.api.chrome.scripting.executeScript = async ({ func, args }) => {
    if (func.name === 'driveDetailEditor') html = args[0].html;
    return [{ result: func.name === 'driveDetailEditor'
      ? { ok: true, filled: true, alerts: [], turnedOff: [] }
      : { ok: true, steps: [], warnings: [] } }];
  };

  await create(harness.api).register(MESSAGE);

  // 첨부 저장소가 쓰는 CDN 은 리퍼러로 핫링크를 막는다. 이 속성이 빠지면 도매꾹
  // 화면과 구매자 화면에서 상세페이지가 통째로 깨진 이미지로 나온다.
  assert.match(html, /referrerpolicy="no-referrer"/);
  assert.ok(html.includes(HOSTED));
});

function makeRegisterHarness({ listBody = `<img src="${HOSTED}">`, editorResult } = {}) {
  const calls = { fetch: [], scripts: [], tabs: [], targets: [] };
  const fetchApi = async (url, init) => {
    calls.fetch.push({ url: String(url), method: init?.method || 'GET' });
    if (String(url).includes('product@product_register')) {
      return { ok: true, status: 200, arrayBuffer: async () => encode('<input name="pno" value="187012">') };
    }
    if (String(url).includes('product@product_file.frm')) {
      return { ok: true, status: 200, arrayBuffer: async () => encode(listBody) };
    }
    if (init?.method === 'POST') {
      return { ok: true, status: 200, arrayBuffer: async () => encode('<script>parent.location.reload();</script>') };
    }
    // 우리 렌더 산출물(로컬 MinIO).
    return { ok: true, status: 200, blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }) };
  };

  const results = {
    fillMallProductForm: { ok: true, steps: ['입력 3칸'], warnings: [] },
    driveDetailEditor: editorResult || { ok: true, filled: true, alerts: [], turnedOff: ['Deli'], length: 65 },
  };
  const chromeApi = {
    scripting: {
      executeScript: async ({ func, target, world }) => {
        calls.scripts.push(func.name);
        calls.targets.push({ func: func.name, tabId: target.tabId, world: world || 'ISOLATED' });
        return [{ result: results[func.name] }];
      },
    },
    tabs: { remove: async (id) => { calls.tabs.push(id); } },
  };
  return {
    calls,
    api: {
      chrome: chromeApi,
      fetch: fetchApi,
      interactiveTabs: { createTab: async () => ({ id: 7 }) },
      tabReason: 'test',
    },
  };
}

const MESSAGE = {
  mall: 'domeggook',
  form: {
    url: 'https://www.domeggook.com/sc/item/regFrm',
    fields: { itemTitle: '테스트' },
    detailHtmlTarget: 'itemMemo[Item]',
    detailUploads: [{ url: 'http://localhost:9000/kiditem/detail-page-images/a.jpg' }],
    manualSteps: [],
  },
};

test('상세 이미지를 올린 뒤 작성하기 에디터까지 몰고 간다', async () => {
  const { create } = loadModule();
  const harness = makeRegisterHarness();
  const outcome = await create(harness.api).register(MESSAGE);

  assert.equal(outcome.ok, true);
  // 제출은 절대 하지 않는다. 승인제 몰이다.
  assert.equal(outcome.submitted, false);
  assert.ok(Array.from(outcome.steps).includes('상세설명(작성하기 에디터)'));
  assert.deepEqual(Array.from(outcome.warnings), []);
  assert.deepEqual(Array.from(harness.calls.scripts), ['fillMallProductForm', 'driveDetailEditor']);
});

test('에디터 몰이는 등록화면 하나에만, MAIN 월드로 주입한다', async () => {
  const { create } = loadModule();
  const harness = makeRegisterHarness();
  await create(harness.api).register(MESSAGE);

  const editor = Array.from(harness.calls.targets).find((c) => c.func === 'driveDetailEditor');
  assert.equal(editor.tabId, 7);
  // 격리 월드에서는 페이지의 `window.open` 을 갈아끼울 수 없다.
  assert.equal(editor.world, 'MAIN');
});

test('올리는 데 창을 열지 않는다 — 도매꾹을 눌렀는데 다른 몰이 뜨지 않는다', async () => {
  const { create } = loadModule();
  const harness = makeRegisterHarness();
  const openedUrls = [];
  harness.api.interactiveTabs = {
    createTab: async ({ url }) => { openedUrls.push(url); return { id: 7 }; },
  };

  await create(harness.api).register(MESSAGE);

  assert.deepEqual(openedUrls, ['https://www.domeggook.com/sc/item/regFrm']);
});

test('올린 주소를 못 찾으면 이유를 남기고 에디터는 열지 않는다', async () => {
  const { create } = loadModule();
  const harness = makeRegisterHarness({ listBody: '<p>첨부 없음</p>' });

  const outcome = await create(harness.api).register(MESSAGE);

  assert.equal(outcome.ok, true);
  assert.ok(Array.from(outcome.warnings).some((w) => w.includes('올라간 주소를 찾지 못했습니다')));
  assert.ok(!Array.from(harness.calls.scripts).includes('driveDetailEditor'));
});

test('이미 몰이 읽을 수 있는 주소면 다시 올리지 않는다', async () => {
  const { create } = loadModule();
  const harness = makeRegisterHarness();
  await create(harness.api).register({
    ...MESSAGE,
    form: { ...MESSAGE.form, detailUploads: [{ url: HOSTED }] },
  });

  const uploads = Array.from(harness.calls.fetch).filter((c) => c.method === 'POST');
  assert.equal(uploads.length, 0);
  assert.ok(Array.from(harness.calls.scripts).includes('driveDetailEditor'));
});

test('몰이 한 말은 경고로 그대로 올린다 — 삼키고 끝내지 않는다', async () => {
  const { create } = loadModule();
  const harness = makeRegisterHarness({
    editorResult: { ok: true, filled: false, alerts: ['배송,교환,반품,A/S 정보에 내용을 입력해주세요'], turnedOff: [] },
  });

  const outcome = await create(harness.api).register(MESSAGE);

  assert.ok(Array.from(outcome.warnings).some((w) => w.includes('배송,교환,반품,A/S 정보에 내용을 입력해주세요')));
  assert.ok(!Array.from(outcome.steps).includes('상세설명(작성하기 에디터)'));
});

/**
 * 라디오·체크박스는 눌러야 한다.
 *
 * `checked = true` 에 change 이벤트를 얹으면 값은 바뀌지만 화면은 안 바뀐다.
 * 도매꾹 대표이미지 방식이 전문가용으로 넘어가지 않아 `image1~4` 가 숨은 칸으로
 * 남고, 거기 넣은 썸네일이 통째로 사라진다(라이브 확인 2026-09-10).
 */
function makeFormPage() {
  const clicks = [];
  const controls = [
    { name: 'imageResize', value: '1', type: 'radio', checked: true },
    { name: 'imageResize', value: '0', type: 'radio', checked: false },
    { name: 'market[]', value: 'dome', type: 'checkbox', checked: false },
    { name: 'market[]', value: 'supply', type: 'checkbox', checked: true },
  ];
  for (const control of controls) {
    control.click = () => {
      clicks.push(control.name + '=' + control.value);
      if (control.type === 'radio') {
        for (const other of controls) {
          if (other.name === control.name) other.checked = other === control;
        }
      } else control.checked = !control.checked;
    };
    control.dispatchEvent = () => true;
  }
  const allow = { id: 'lImageAllow', checked: false, dispatchEvent: () => true };
  allow.click = () => { clicks.push('#lImageAllow'); allow.checked = !allow.checked; };

  return {
    clicks,
    controls,
    allow,
    form: {
      querySelectorAll: (selector) => {
        const match = /\[name="([^"]+)"\]/.exec(selector);
        return match ? controls.filter((c) => c.name === match[1].replace(/\\/g, '')) : [];
      },
      querySelector: (selector) => (selector === '#lImageAllow' ? allow : null),
    },
  };
}

test('라디오와 체크박스는 눌러서 바꾼다 — 값만 바꾸면 화면이 안 따라온다', async () => {
  const { pageFunctions } = loadModule();
  const page = makeFormPage();

  const context = {
    document: { querySelector: () => page.form },
    // 채움 함수는 몰 대화상자를 삼키려고 `window.alert` 을 갈아끼운다.
    window: { alert: () => {} },
    CSS: { escape: (value) => value },
    Event: class { constructor(type) { this.type = type; } },
    Set,
    setTimeout, Promise, Date, Object, Array, String, Boolean,
  };
  context.globalThis = context;
  vm.createContext(context);
  const fill = vm.runInContext(`(${pageFunctions.fillMallProductForm.toString()})`, context);

  const outcome = await fill({
    formSelector: '#lFormRegItem',
    dynamic: null,
    acceptRecommendation: null,
    groupInputs: [],
    groups: {},
    selectorChecks: [{ key: 'imageAllow', selector: '#lImageAllow', label: '이미지 사용허용' }],
    selectorCheckValues: { imageAllow: true },
    fields: {},
    radios: { imageResize: '0' },
    checks: { 'market[]:dome': true, 'market[]:supply': false },
    images: [],
    detailHtmlTarget: '',
    detailHtml: '',
  });

  assert.equal(outcome.ok, true);
  assert.deepEqual(Array.from(page.clicks), [
    'imageResize=0', 'market[]=dome', 'market[]=supply', '#lImageAllow',
  ]);
  assert.equal(page.controls[1].checked, true);
  assert.equal(page.allow.checked, true);
  assert.ok(Array.from(outcome.steps).includes('이미지 사용허용 켬'));
});

test('이미 원하는 상태면 다시 누르지 않는다 — 누르면 도로 풀린다', async () => {
  const { pageFunctions } = loadModule();
  const page = makeFormPage();
  page.allow.checked = true;

  const context = {
    document: { querySelector: () => page.form },
    // 채움 함수는 몰 대화상자를 삼키려고 `window.alert` 을 갈아끼운다.
    window: { alert: () => {} },
    CSS: { escape: (value) => value },
    Event: class { constructor(type) { this.type = type; } },
    Set,
    setTimeout, Promise, Date, Object, Array, String, Boolean,
  };
  context.globalThis = context;
  vm.createContext(context);
  const fill = vm.runInContext(`(${pageFunctions.fillMallProductForm.toString()})`, context);

  await fill({
    formSelector: '#lFormRegItem',
    dynamic: null, acceptRecommendation: null, groupInputs: [], groups: {},
    selectorChecks: [{ key: 'imageAllow', selector: '#lImageAllow', label: '이미지 사용허용' }],
    selectorCheckValues: { imageAllow: true },
    fields: {}, radios: {}, checks: { 'market[]:supply': true },
    images: [], detailHtmlTarget: '', detailHtml: '',
  });

  assert.deepEqual(Array.from(page.clicks), []);
  assert.equal(page.allow.checked, true);
});

/**
 * 이름 없는 칸들(원산지·안전인증).
 *
 * 폼으로는 못 닿아 선택자로 찾는다. 원산지는 계단식이라 순서와 기다림이 중요하고,
 * 고른 값이 목록에 없으면 브라우저가 조용히 빈 값으로 되돌린다 — 그걸 성공으로
 * 세면 원산지가 빈 채로 등록된다.
 */
function makeSelectorPage({ nationOptions = ['36'] } = {}) {
  const set = [];
  const make = (id, options) => ({
    id,
    tagName: 'SELECT',
    value: '',
    options: options.map((value) => ({ value })),
    dispatchEvent: () => true,
  });
  const nodes = {
    '#lItemCountrySelect1': make('1', ['1', '2']),
    '#lItemCountrySelect2': make('2', ['4', '5']),
    '#lItemCountrySelect3': make('3', nationOptions),
    '.lCertItem select.lKC': make('kc', ['01', '02']),
    '.lCertItem select.lCert': make('cert', ['B02', 'A01']),
    '.lCertItem input.lInputCertNo': { tagName: 'INPUT', value: '', dispatchEvent: () => true },
  };
  // 목록에 없는 값은 브라우저처럼 되돌린다.
  for (const node of Object.values(nodes)) {
    if (node.tagName !== 'SELECT') continue;
    Object.defineProperty(node, 'value', {
      get() { return node._value || ''; },
      set(next) {
        node._value = node.options.some((option) => option.value === next) ? next : '';
        set.push(node.id + '=' + node._value);
      },
    });
  }
  const areas = {
    deliShippingArea: {
      tagName: 'SELECT', value: '',
      options: [{ value: '' }, { value: '12431' }],
      dispatchEvent: () => true,
    },
  };
  return {
    set,
    nodes,
    areas,
    form: {
      querySelector: (selector) => areas[selector.replace(/\[name="|"\]/g, '')] || null,
      querySelectorAll: () => [],
    },
    document: { querySelector: (selector) => nodes[selector] || null },
  };
}

async function runFill(page, payload) {
  const { pageFunctions } = loadModule();
  const context = {
    document: {
      querySelector: (selector) => (selector === '#lFormRegItem' ? page.form : page.document.querySelector(selector)),
    },
    window: { alert: () => {} },
    CSS: { escape: (value) => value },
    Event: class { constructor(type) { this.type = type; } },
    Set,
    setTimeout, Promise, Date, Object, Array, String, Boolean,
  };
  context.globalThis = context;
  vm.createContext(context);
  const fill = vm.runInContext(`(${pageFunctions.fillMallProductForm.toString()})`, context);
  return fill({
    formSelector: '#lFormRegItem',
    dynamic: null, acceptRecommendation: null, groupInputs: [], groups: {},
    selectorChecks: [], selectorCheckValues: {},
    fields: {}, radios: {}, checks: {}, images: [],
    detailHtmlTarget: '', detailHtml: '',
    ...payload,
  });
}

const SELECTOR_SPEC = [
  { key: 'originType', selector: '#lItemCountrySelect1', label: '원산지 구분', waitMs: 1 },
  { key: 'originArea', selector: '#lItemCountrySelect2', label: '원산지 대륙', waitMs: 1 },
  { key: 'originNation', selector: '#lItemCountrySelect3', label: '원산지 국가', waitMs: 1 },
  { key: 'certExempt', selector: '.lCertItem select.lKC', label: '면제대상여부', waitMs: 1 },
  { key: 'certType', selector: '.lCertItem select.lCert', label: '안전인증 분류', waitMs: 1 },
  { key: 'certNumber', selector: '.lCertItem input.lInputCertNo', label: '안전인증번호' },
];

const SELECTOR_VALUES = {
  originType: '1', originArea: '4', originNation: '36',
  certExempt: '01', certType: 'B02', certNumber: 'CB065R1579-2008',
};

test('원산지·안전인증을 선택자로 순서대로 넣는다', async () => {
  const page = makeSelectorPage();
  const outcome = await runFill(page, {
    selectorFields: SELECTOR_SPEC,
    selectorFieldValues: SELECTOR_VALUES,
  });

  assert.deepEqual(Array.from(page.set), ['1=1', '2=4', '3=36', 'kc=01', 'cert=B02']);
  assert.equal(page.nodes['.lCertItem input.lInputCertNo'].value, 'CB065R1579-2008');
  assert.deepEqual(Array.from(outcome.warnings), []);
});

test('목록에 없는 값은 조용히 넘어가지 않고 경고를 남긴다', async () => {
  // 계단식이라 앞 칸을 고르기 전에는 뒤 칸 목록이 비어 있다. 그때 넣으면 빈 값이
  // 되는데, 그걸 성공으로 세면 원산지가 빈 채로 등록된다.
  const page = makeSelectorPage({ nationOptions: [] });
  const outcome = await runFill(page, {
    selectorFields: SELECTOR_SPEC,
    selectorFieldValues: SELECTOR_VALUES,
  });

  assert.ok(Array.from(outcome.warnings).some((w) => w.includes('원산지 국가')));
  assert.ok(!Array.from(outcome.steps).includes('원산지 국가'));
});

test('저장된 주소는 첫 항목을 고른다 — 계정별 내부 번호를 적어두지 않는다', async () => {
  const page = makeSelectorPage();
  await runFill(page, {
    selectorFields: [], selectorFieldValues: {},
    selectFirstOptions: ['deliShippingArea'],
  });

  assert.equal(page.areas.deliShippingArea.value, '12431');
});

test('고를 주소가 없으면 사람에게 넘긴다', async () => {
  const page = makeSelectorPage();
  page.areas.deliShippingArea.options = [{ value: '' }];
  const outcome = await runFill(page, {
    selectorFields: [], selectorFieldValues: {},
    selectFirstOptions: ['deliShippingArea'],
  });

  assert.ok(Array.from(outcome.warnings).some((w) => w.includes('화면에서 먼저 등록')));
});

/**
 * 단계형 화면(온채널)의 순서.
 *
 * 단계를 넘기면 뒤 화면이 다시 그려지면서 그 전에 채운 상품정보고시 열일곱 칸이
 * 통째로 비워진다(라이브 확인 2026-09-10). 그래서 넘기는 것이 맨 앞이어야 한다.
 */
test('마법사 단계를 방아쇠보다 먼저 넘긴다', async () => {
  const { pageFunctions } = loadModule();
  const order = [];
  const trigger = { name: 'notification_cate_num', value: '', tagName: 'SELECT', dispatchEvent: () => true };
  Object.defineProperty(trigger, 'value', {
    get() { return trigger._v || ''; },
    set(next) { trigger._v = next; order.push('trigger'); },
  });
  const supp = { name: 'product_supp_sec', value: '1', type: 'radio', checked: false, dispatchEvent: () => true };
  supp.click = () => { supp.checked = true; order.push('radio'); };
  const agree = { name: 'agree_terms', type: 'checkbox', checked: false, dispatchEvent: () => true };
  agree.click = () => { agree.checked = true; order.push('agree'); };
  const notice = { name: 'prd_model', value: '', dispatchEvent: () => true };
  const button = { tagName: 'BUTTON', textContent: '상품 기본 정보 입력', click: () => order.push('wizard') };

  const elements = [trigger, supp, agree, notice];
  const form = {
    elements: Object.assign(elements, { agree_terms: agree }),
    querySelector: (selector) => elements.find((el) => selector.includes(`"${el.name}"`)) || null,
    querySelectorAll: (selector) => elements.filter((el) => selector.includes(`"${el.name}"`)),
  };
  const context = {
    document: {
      querySelector: () => form,
      querySelectorAll: (selector) => (/button/.test(selector) ? [button] : []),
    },
    window: { alert: () => {} },
    CSS: { escape: (value) => value },
    Event: class { constructor(type) { this.type = type; } },
    Set, setTimeout, Promise, Date, Object, Array, String, Boolean,
  };
  context.globalThis = context;
  vm.createContext(context);
  const fill = vm.runInContext(`(${pageFunctions.fillMallProductForm.toString()})`, context);

  await fill({
    formSelector: '#registProductForm',
    wizardSteps: [{
      text: '상품 기본 정보 입력', label: '약관동의 통과', waitMs: 1,
      needs: ['product_supp_sec'], needsChecks: ['agree_terms'],
    }],
    dynamic: { trigger: 'notification_cate_num', waitNames: ['prd_model'] },
    acceptRecommendation: null, groupInputs: [], groups: {},
    selectorChecks: [], selectorCheckValues: {}, selectorFields: [], selectorFieldValues: {},
    fields: { notification_cate_num: '17', prd_model: '테스트' },
    radios: { product_supp_sec: '1' }, checks: {}, images: [],
    detailHtmlTarget: '', detailHtml: '',
  });

  // 넘기기(라디오·동의·버튼)가 방아쇠보다 앞이어야 한다.
  assert.deepEqual(Array.from(order), ['radio', 'agree', 'wizard', 'trigger']);
  assert.equal(notice.value, '테스트');
});

test('방아쇠는 나머지 값 넣을 때 다시 건드리지 않는다', async () => {
  // 다시 고르면 고시 블록이 또 그려져 방금 채운 열일곱 칸이 날아간다.
  const { pageFunctions } = loadModule();
  let triggerWrites = 0;
  const trigger = { name: 'notification_cate_num', tagName: 'SELECT', dispatchEvent: () => true };
  Object.defineProperty(trigger, 'value', {
    get() { return trigger._v || ''; },
    set(next) { trigger._v = next; triggerWrites += 1; },
  });
  const notice = { name: 'prd_model', value: '', dispatchEvent: () => true };
  const elements = [trigger, notice];
  const form = {
    elements,
    querySelector: (selector) => elements.find((el) => selector.includes(`"${el.name}"`)) || null,
    querySelectorAll: () => [],
  };
  const context = {
    document: { querySelector: () => form, querySelectorAll: () => [] },
    window: { alert: () => {} },
    CSS: { escape: (value) => value },
    Event: class { constructor(type) { this.type = type; } },
    Set, setTimeout, Promise, Date, Object, Array, String, Boolean,
  };
  context.globalThis = context;
  vm.createContext(context);
  const fill = vm.runInContext(`(${pageFunctions.fillMallProductForm.toString()})`, context);

  await fill({
    formSelector: '#registProductForm',
    wizardSteps: [],
    dynamic: { trigger: 'notification_cate_num', waitNames: ['prd_model'] },
    acceptRecommendation: null, groupInputs: [], groups: {},
    selectorChecks: [], selectorCheckValues: {}, selectorFields: [], selectorFieldValues: {},
    fields: { notification_cate_num: '17', prd_model: '테스트' },
    radios: {}, checks: {}, images: [],
    detailHtmlTarget: '', detailHtml: '',
  });

  assert.equal(triggerWrites, 1);
});

/**
 * 몰 분류 목록.
 *
 * 4단 전체를 미리 받아 두지 않는다 — 온채널은 마디가 3만 개가 넘고 전부 받으려면
 * 요청이 3,600건이다(라이브 실측 2026-09-10). 한 단씩 물어본다.
 */
test('고른 단까지만 담아 그 단의 목록을 묻는다', async () => {
  const { create } = loadModule();
  const asked = [];
  const api = {
    chrome: { scripting: { executeScript: async () => [] }, tabs: {} },
    fetch: async (url) => {
      asked.push(String(url));
      return { ok: true, status: 200, json: async () => ({ isSuccess: true, datas: [{ name: '문구용품' }, { name: '' }] }) };
    },
    interactiveTabs: { createTab: async () => ({ id: 1 }) },
    tabReason: 'test',
  };

  const outcome = await create(api).listCategories({ mall: 'onch', path: ['생활/건강', '문구/사무용품'] });

  assert.deepEqual(Array.from(outcome.names), ['문구용품']);
  const url = asked[0];
  assert.ok(url.includes('ubr=getCategory'));
  assert.ok(url.includes('depth=2'));
  assert.ok(url.includes(encodeURIComponent('생활/건강')));
  assert.ok(url.includes('cate_second='));
});

test('마지막 단까지 고른 뒤에는 묻지 않는다', async () => {
  const { create } = loadModule();
  let calls = 0;
  const api = {
    chrome: { scripting: { executeScript: async () => [] }, tabs: {} },
    fetch: async () => { calls += 1; return { ok: true, status: 200, json: async () => ({ datas: [] }) }; },
    interactiveTabs: { createTab: async () => ({ id: 1 }) },
    tabReason: 'test',
  };

  const outcome = await create(api).listCategories({ mall: 'onch', path: ['a', 'b', 'c', 'd'] });

  assert.deepEqual(Array.from(outcome.names), []);
  assert.equal(calls, 0);
});

test('분류 목록이 없는 몰은 그렇다고 말한다', async () => {
  const { create } = loadModule();
  const api = {
    chrome: { scripting: { executeScript: async () => [] }, tabs: {} },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ datas: [] }) }),
    interactiveTabs: { createTab: async () => ({ id: 1 }) },
    tabReason: 'test',
  };

  await assert.rejects(
    () => create(api).listCategories({ mall: 'domeggook', path: [] }),
    /분류 목록을 제공하지 않습니다/,
  );
});
