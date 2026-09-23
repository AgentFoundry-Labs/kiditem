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

class FakeFileReader {
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type || 'image/jpeg'};base64,${Buffer.from(buffer).toString('base64')}`;
      this.onload?.();
    }).catch((e) => this.onerror?.(e));
  }
}

function loadModule() {
  const context = {
    self: {}, console, URL, URLSearchParams, TextDecoder, TextEncoder,
    FormData, Blob, File, Promise, Date, setTimeout, clearTimeout,
    FileReader: FakeFileReader,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(path.join(repoRoot, 'extensions/kiditem-os/shared/mall-form-submit-gate.js'), 'utf8'), context);
  vm.runInContext(readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
  return context.self.KidItemMallFormRegister;
}

/**
 * 신세계 파트너오피스 상품등록(`po.ssgadm.com/cp/item/item/itemNew.ssg`).
 *
 * 실측 2026-09-14. 기존 등록물 45개(전부 API 등록)의 수정 화면과 새 등록 화면을 대조했고,
 * 새 화면에 값을 채운 뒤 화면 자체 검증(`ItemValidator` · `saveValidModules`)이 통과하는 것까지
 * 저장 없이 확인했다.
 */

const ssgForm = (overrides = {}) => ({
  itemName: '만두 쫀뜩 말랑이 1p 주물럭 스트레스볼 스퀴시',
  brandName: '키드아이템',
  siteNo: '6004',
  displayCategory: { id: '6000162263', keyword: '기타시즌잡화' },
  standardCategory: { id: '1000022578', keyword: '패션.잡화' },
  salePrice: 2600,
  marginRate: 15,
  stock: 999,
  modelName: '4000만두쫀뜩말랑이',
  searchKeywords: '스트레스볼,스퀴시,완구',
  notice: {
    classId: '0000000029',
    values: { '0000000022': '4000만두쫀뜩말랑이', '0000000122': '상세설명 참조', '0000000009': '해피프랜즈', '0000000012': '031-908-5401' },
    importPropId: '0000000008',
    importYn: 'Y',
  },
  manufacturer: '해피프랜즈',
  originCountry: '중국',
  shipping: {
    leadDays: 3,
    outboundAddrId: '0006820704',
    returnAddrId: '0006820707',
    fees: [
      { divCd: '10', typeCd: '22', prepayCd: '10', unitCd: '10', feeId: '0000621476' },
      { divCd: '20', typeCd: '22', prepayCd: '10', unitCd: '10', feeId: '0000621477' },
    ],
  },
  ...overrides,
});

const form = (overrides = {}) => ({
  url: 'https://po.ssgadm.com/cp/item/item/itemNew.ssg',
  imageGroups: { ssg: ['https://image1.coupangcdn.com/rep.jpg', 'https://image1.coupangcdn.com/extra.jpg'] },
  detailUploads: [{ url: 'http://localhost:9000/kiditem/detail-page-images/o/r/wing-server-jpeg-v1-780.jpg' }],
  manualSteps: [],
  ssg: ssgForm(),
  ...overrides,
});

function harness() {
  const module = loadModule();
  const calls = [];
  const fetched = [];
  const api = module.create({
    chrome: {
      scripting: {
        executeScript: async (options) => {
          calls.push(options);
          return [{ result: { ok: true, steps: [], warnings: [] } }];
        },
      },
    },
    fetch: async (url) => {
      fetched.push(String(url));
      return { ok: true, status: 200, blob: async () => new Blob([new Uint8Array([1, 2])], { type: 'image/jpeg' }) };
    },
    interactiveTabs: { createTab: async () => ({ id: 3 }) },
    tabReason: 'test',
  });
  return { api, calls, fetched };
}

test('등록 화면 주소 하나만 받는다 — 쿼리가 붙으면 기존 상품 수정 화면이다', async () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS.ssg.origin, 'https://po.ssgadm.com');
  assert.equal(SPECS.ssg.pathPrefix, '/cp/item/item/itemNew.ssg');

  const { api, calls } = harness();
  for (const url of [
    'https://po.ssgadm.com/main.ssg',
    'https://po.ssgadm.com/cp/itemoper/itemMng/listItemInfoMng.ssg',
    // 목록에서 상품번호를 누르면 여는 주소다. 여기에 채우고 저장하면 판매중 상품이 덮인다.
    'https://po.ssgadm.com/cp/item/item/itemNew.ssg?srcItemId=1000850269603',
    'https://po.ssgadm.com/cp/item/item/itemNew.ssg?itemId=1000850269603',
  ]) {
    await assert.rejects(() => api.register({ mall: 'ssg', form: form({ url }) }), /상품등록 주소가 아닙니다/);
  }
  assert.equal(calls.length, 0, '거절한 주소로는 탭도 주입도 하지 않는다');
});

test('상품명·판매가·카테고리가 없으면 채우러 가지 않는다', async () => {
  const { api } = harness();
  await assert.rejects(() => api.register({ mall: 'ssg', form: form({ ssg: ssgForm({ itemName: ' ' }) }) }), /상품명/);
  await assert.rejects(() => api.register({ mall: 'ssg', form: form({ ssg: ssgForm({ salePrice: 0 }) }) }), /판매가/);
  await assert.rejects(
    () => api.register({ mall: 'ssg', form: form({ ssg: ssgForm({ displayCategory: { id: 'x', keyword: '완구' } }) }) }),
    /전시카테고리/,
  );
  await assert.rejects(() => api.register({ mall: 'ssg', form: form({ ssg: undefined }) }), /신세계 폼 데이터/);
});

test('⭐ 전용 페이지 함수에 값 묶음·이미지·상세 이미지를 MAIN 월드로 넘긴다', async () => {
  const { api, calls, fetched } = harness();
  const result = await api.register({ mall: 'ssg', form: form() });

  assert.equal(result.submitted, false);
  assert.equal(calls.length, 1);
  const [options] = calls;
  assert.equal(options.func.name, 'fillSsgProductForm');
  assert.equal(options.world, 'MAIN');
  const [payload] = options.args;
  assert.equal(payload.form.itemName, '만두 쫀뜩 말랑이 1p 주물럭 스트레스볼 스퀴시');
  assert.equal(payload.form.displayCategory.id, '6000162263');
  assert.equal(payload.form.shipping.fees.map((fee) => fee.feeId).join(','), '0000621476,0000621477');
  // 이미지는 서비스워커가 읽어 넘긴다. 화면에서 CDN 을 부르면 CORS 로 막힌다.
  assert.equal(payload.images.length, 2);
  assert.match(payload.images[0].dataUrl, /^data:image\/jpeg;base64,/);
  assert.match(payload.detailImage.dataUrl, /^data:image\/jpeg;base64,/);
  assert.equal(payload.detailUpload.endpoint, '/upload/0/synapEditorUpload.ssg');
  // 남의 저장소(키즈노트)를 거치지 않는다 — 몰 서버에 올린다.
  assert.ok(!fetched.some((url) => url.includes('kidsnote')), fetched.join(' / '));
});

test('번호 칸에 숫자가 아닌 글자가 오면 버린다 — 페이지 함수가 그 번호로 선택자를 만든다', async () => {
  const { api, calls } = harness();
  await api.register({
    mall: 'ssg',
    form: form({
      ssg: ssgForm({
        shipping: {
          leadDays: 3,
          outboundAddrId: '"] , a[href',
          returnAddrId: '0006820707',
          fees: [{ divCd: '10', typeCd: '22', prepayCd: '10', unitCd: '10', feeId: '1"]' }],
        },
      }),
    }),
  });
  const [payload] = calls[0].args;
  assert.equal(payload.form.shipping.outboundAddrId, '');
  assert.equal(payload.form.shipping.fees.length, 0);
});

// ── 페이지 함수 ────────────────────────────────────────────────────────────────

class FakeEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } }

class FakeElement {
  constructor(props = {}) {
    Object.assign(this, {
      tagName: 'INPUT', type: 'text', value: '', checked: false, placeholder: '', visible: true, options: [],
    }, props);
    this.listeners = {};
    this.events = [];
  }

  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }

  dispatchEvent(event) {
    this.events.push(event.type);
    for (const handler of this.listeners[event.type] || []) handler.call(this, event);
    return true;
  }

  click() {
    if (this.type === 'radio') this.checked = true;
    if (this.type === 'checkbox') this.checked = !this.checked;
    this.dispatchEvent(new FakeEvent('click'));
  }

  focus() {}

  getClientRects() { return this.visible ? [{}] : []; }

  querySelector(selector) { return selector === 'a' ? this.link || null : null; }
}

/**
 * 라이브 화면에서 잰 반응만 흉내 낸다. 선택자는 실제 화면 것 그대로다 — 여기가 틀리면
 * 실제 화면에서도 못 찾는다.
 */
function makeSsgPage({
  loginPage = false,
  editItemId = null,
  detailUploadPath = 'https://sitem.ssgcdn.com/editor/detail.jpg',
  dialogsInDetail = false,
} = {}) {
  const log = { detail: [], feesAdded: [], fetches: [], saved: false, alertsDuringFill: [], confirmDuringFill: null };
  const dto = { itemDto: { itemBaseDto: { itemId: editItemId, itemNm: null, stdCtgId: null, dispStrtDt: '2026-09-14 13:38' } } };
  const el = (props) => new FakeElement(props);
  const byId = new Map();
  const bySelector = new Map();
  const add = (id, element, selectors = []) => {
    if (id) byId.set(id, element);
    for (const selector of selectors) bySelector.set(selector, element);
    return element;
  };

  const password = el({ type: 'password', visible: loginPage });
  const site = add('siteNo6004', el({ type: 'checkbox' }));
  const dispInput = el({ placeholder: '카테고리명을 입력하세요.', visible: false });
  const stdInput = add('suggestStdCtgTxt', el({ placeholder: '표준분류명을 입력하세요.', visible: false }));
  site.addEventListener('click', () => { dispInput.visible = site.checked; });

  const dispLink = el({ tagName: 'A' });
  dispLink.addEventListener('click', () => { stdInput.visible = true; });
  dispInput.addEventListener('keyup', () => {
    if (dispInput.value === '기타시즌잡화') {
      bySelector.set('#suggestCombo_suggestMainDispCtgId li[data-value^="6000162263|"]', el({ tagName: 'LI', link: dispLink }));
    }
  });
  const stdLink = el({ tagName: 'A' });
  stdLink.addEventListener('click', () => { dto.itemDto.itemBaseDto.stdCtgId = '1000022578'; });
  stdInput.addEventListener('keyup', () => {
    if (stdInput.value === '패션.잡화') {
      bySelector.set('#suggestCombo_suggestStdCtgId li[data-value^="1000022578|"]', el({ tagName: 'LI', link: stdLink }));
    }
  });

  // 브랜드 서제스트: keyup → 옵션 `번호|이름` → 셀렉트 클릭이 숨은 칸을 채운다.
  const brandId = add('brandId', el({ type: 'hidden' }));
  const brandInput = add(null, el(), ['input#brandNm']);
  const brandCombo = add('suggestCombo_brandId', el({ tagName: 'SELECT' }));
  brandInput.addEventListener('keyup', () => { brandCombo.options = [{ value: '3000047083|키드아이템' }]; });
  brandCombo.addEventListener('click', () => { brandId.value = brandCombo.options[brandCombo.selectedIndex].value.split('|')[0]; });

  const itemNm = add(null, el(), ['input#itemNm']);
  itemNm.addEventListener('input', () => { dto.itemDto.itemBaseDto.itemNm = itemNm.value; });

  add(null, el({ type: 'radio' }), ['#itemAddInfo input[name="adultItemTypeCd"][value="90"]']);
  add(null, el({ type: 'radio' }), ['#itemRetExch input[name="retExchPsblYn"][value="Y"]']);
  add('autoAccount_1', el({ type: 'radio', checked: true }));

  // 가격 그리드. 편집기를 닫을 때 화면이 공급가를 계산한다.
  const cells = {};
  const grid = {
    getRowsNum: () => 1,
    getRowId: () => 'row1',
    getRowIndex: () => 0,
    getColIndexById: (id) => ({ splprc: 6, sellprc: 8, mrgrt: 9 })[id],
    selectCell(_row, column) { this.column = column; },
    editCell() { this.editor = { obj: { value: '' } }; },
    editStop() {
      cells[this.column] = this.editor.obj.value;
      if (cells[8] && cells[9]) cells[6] = String(Math.round(Number(cells[8]) * (100 - Number(cells[9])) / 100 / 1.1));
      this.editor = null;
    },
    cells: (_rowId, column) => ({ getValue: () => cells[column] ?? '' }),
  };

  add(null, el(), ['input#usablInvQty']);
  add(null, el(), ['input#mdlNm']);
  add(null, el(), ['input#itemSrchwdNm']);
  add('dispDt99_btn', el({ type: 'radio' }));
  const start = add(null, el(), ['input#dispStrtDts']);
  start.addEventListener('input', () => { dto.itemDto.itemBaseDto.dispStrtDt = start.value; });

  const noticeClass = add(null, el({ tagName: 'SELECT', options: [{ value: '0000000029' }, { value: '0000000025' }] }), ['select#itemMngPropClsId']);
  const noticeInputs = ['0000000022', '0000000122', '0000000009', '0000000012'].map((id) => add(id, el({ visible: false })));
  add('0000000008_Y', el({ type: 'radio' }));
  noticeClass.addEventListener('change', () => { for (const input of noticeInputs) input.visible = noticeClass.value === '0000000029'; });
  add(null, el(), ['input#manufcoNm']);
  const originInput = add(null, el(), ['input#orplcNm0']);
  const originCombo = add('suggestCombo_prodManufCntryId0', el({ tagName: 'SELECT' }));
  const originId = add('prodManufCntryId0', el({ type: 'hidden' }));
  originInput.addEventListener('keyup', () => { originCombo.options = [{ value: '1000000002|중국' }]; });
  originCombo.addEventListener('click', () => { originId.value = originCombo.options[originCombo.selectedIndex].value.split('|')[0]; });

  add(null, el(), ['input#shppRqrmDcnt']);
  // 주소 셀렉트는 인라인 onchange 다: 고른 값을 dto 에 적고 셀렉트는 첫 줄로 돌아간다.
  for (const [id, values] of [['whoutAddrId', ['0006820707', '0006820704']], ['snbkAddrId', ['0006820707', '0006820704']]]) {
    const select = add(null, el({ tagName: 'SELECT', options: values.map((value) => ({ value })) }), [`select#${id}`]);
    select.addEventListener('change', () => { dto.itemDto.itemBaseDto[id] = select.value; select.value = ''; });
  }
  // 배송비 5단. 앞 단을 고르면 다음 단 목록이 생긴다.
  const chain = ['gnrlShppcstPlcyDivCd', 'gnrlShppcstPlcyTypeCd', 'gnrlPrpayCodDivCd', 'gnrlShppcstAplUnitCd', 'gnrlShppcstId'];
  const feeSelects = chain.map((id) => add(null, el({ tagName: 'SELECT' }), [`select#${id}`]));
  feeSelects[0].options = [{ value: '10' }, { value: '20' }];
  const nextOptions = { gnrlShppcstPlcyTypeCd: ['22'], gnrlPrpayCodDivCd: ['10'], gnrlShppcstAplUnitCd: ['10'] };
  feeSelects.forEach((select, index) => {
    select.addEventListener('change', () => {
      const next = feeSelects[index + 1];
      if (!next) return;
      const nextId = chain[index + 1];
      next.options = (nextId === 'gnrlShppcstId'
        ? (feeSelects[0].value === '10' ? ['0000621476', '0072563387'] : ['0000621477', '0072563388'])
        : nextOptions[nextId]).map((value) => ({ value }));
    });
  });
  const addFee = add('addGnrlShppcstPlcyBtn', el({ tagName: 'BUTTON' }));
  addFee.addEventListener('click', () => { log.feesAdded.push(feeSelects[4].value); });

  // 이미지 칸: 파일 선택 = 화면이 몰 서버에 올리고(동기) 경로를 숨은 칸에 적는다.
  for (let slot = 1; slot <= 10; slot += 1) {
    const file = add(`uitemImgVod10_${slot}_file`, el({ type: 'file' }));
    const pathInput = add(`uitemImgVod10_${slot}_dataFileNm`, el({ type: 'hidden' }));
    add(`uitemImgVod10_${slot}_rplcTextNm`, el());
    file.addEventListener('change', () => {
      if (/\.(jpe?g|png)$/i.test(file.files?.[0]?.name || '')) pathInput.value = `/tmp/upload/${slot}.jpg`;
    });
  }

  const window = {
    alert: () => { throw new Error('native alert'); },
    confirm: () => { throw new Error('native confirm'); },
    itemMainDto: dto,
    ItemPrcInv: { gridRepPrc: grid },
    ItemDtl: {
      popupItemDtlSynapEditorCallBack(html) {
        log.detail.push(html);
        if (!dialogsInDetail) return;
        // 채우는 동안 화면이 alert/confirm 을 부르면 삼켜져야 하고, confirm 은 거절이어야 한다.
        window.alert('상세 안내');
        log.confirmDuringFill = window.confirm('저장하시겠습니까?');
      },
    },
    ItemMain: {
      savePreProcess() {},
      saveValidModules: () => true,
      goSave() { log.saved = true; },
    },
    ItemValidator: { validate: () => true },
    jQuery: () => ({}),
    scrollTo() {},
  };

  const document = {
    body: el({ tagName: 'BODY' }),
    getElementById: (id) => byId.get(id) || null,
    querySelector: (selector) => bySelector.get(selector) || null,
    querySelectorAll: (selector) => {
      if (selector === 'input[type="password"]') return [password];
      if (selector === '#categoryInfo input[type=text]') return [dispInput, stdInput];
      return [];
    },
  };

  class FakeDataTransfer {
    constructor() {
      this.files = [];
      this.items = { add: (file) => this.files.push(file) };
    }
  }

  const context = {
    window,
    document,
    location: { origin: 'https://po.ssgadm.com' },
    Event: FakeEvent,
    KeyboardEvent: FakeEvent,
    MouseEvent: FakeEvent,
    DataTransfer: FakeDataTransfer,
    File: class { constructor(parts, name, options) { this.name = name; this.type = options?.type || ''; } },
    FormData: class { constructor() { this.entries = []; } append(name, value) { this.entries.push([name, value?.name ?? value]); } },
    fetch: async (url, init) => {
      log.fetches.push({ url: String(url), method: init?.method, fields: init?.body?.entries });
      return { ok: true, status: 200, json: async () => ({ uploadPath: detailUploadPath }) };
    },
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    Uint8Array, URL, setTimeout, Promise, Date,
  };
  context.globalThis = context;
  vm.createContext(context);
  return { context, window, log, dto, grid, cells, byId, bySelector };
}

async function runSsgFill(page, payloadOverrides = {}) {
  const { pageFunctions } = loadModule();
  const fill = vm.runInContext(`(${pageFunctions.fillSsgProductForm.toString()})`, page.context);
  return fill({
    form: ssgForm(),
    images: [
      { name: 'ssg0', dataUrl: 'data:image/jpeg;base64,AAEC', fileName: 'rep.jpg' },
      { name: 'ssg1', dataUrl: 'data:image/jpeg;base64,AAEC', fileName: 'extra' },
    ],
    maxImages: 10,
    displayStartDelayHours: 3,
    formWaitMs: 200,
    stepWaitMs: 200,
    detailUpload: { endpoint: '/upload/0/synapEditorUpload.ssg', field: 'file' },
    detailImage: { name: 'detail', dataUrl: 'data:image/jpeg;base64,AAEC', fileName: 'wing-server-jpeg-v1-780.jpg' },
    detailHtml: '',
    ...payloadOverrides,
  });
}

test('⭐ 사람이 누르는 순서대로 채우고 저장은 부르지 않는다', async () => {
  const page = makeSsgPage();
  const outcome = await runSsgFill(page);

  assert.equal(outcome.ok, true, JSON.stringify(outcome.warnings));
  assert.equal(outcome.submitted, false);
  assert.deepEqual(Array.from(outcome.warnings), []);
  const base = page.dto.itemDto.itemBaseDto;
  assert.equal(base.stdCtgId, '1000022578');
  assert.equal(base.itemNm, '만두 쫀뜩 말랑이 1p 주물럭 스트레스볼 스퀴시');
  assert.equal(page.byId.get('brandId').value, '3000047083');
  assert.equal(page.byId.get('prodManufCntryId0').value, '1000000002');
  assert.equal(page.byId.get('0000000022').value, '4000만두쫀뜩말랑이');
  assert.equal(page.byId.get('0000000008_Y').checked, true);
  // 판매가 2,600 · 마진 15 → 공급가 2,009(기존 등록물과 같은 값).
  assert.equal(page.cells[6], '2009');
  assert.equal(base.whoutAddrId, '0006820704');
  assert.equal(base.snbkAddrId, '0006820707');
  assert.deepEqual(Array.from(page.log.feesAdded), ['0000621476', '0000621477']);
  assert.equal(page.byId.get('uitemImgVod10_1_dataFileNm').value, '/tmp/upload/1.jpg');
  assert.equal(page.byId.get('uitemImgVod10_1_rplcTextNm').value, '대표이미지');
  // 확장자 없는 이름도 형식에 맞춰 붙여 올린다 — 화면이 확장자로 거른다.
  assert.equal(page.byId.get('uitemImgVod10_2_dataFileNm').value, '/tmp/upload/2.jpg');
  assert.ok(Array.from(outcome.steps).includes('저장 전 검증 통과'));
  assert.equal(page.log.saved, false);
});

test('⭐ 상세 이미지는 SSG Editor 업로드 주소로 에디터 저장 콜백에 넣는다', async () => {
  const page = makeSsgPage();
  await runSsgFill(page);

  const [upload] = page.log.fetches;
  assert.equal(upload.url, '/upload/0/synapEditorUpload.ssg');
  assert.equal(upload.method, 'POST');
  assert.equal(upload.fields.map(([name, value]) => `${name}=${value}`).join('&'), 'file=wing-server-jpeg-v1-780.jpg');
  assert.deepEqual(Array.from(page.log.detail), ['<center><img src="https://sitem.ssgcdn.com/editor/detail.jpg"></center>']);
});

test('채우는 동안 alert 은 삼키고 confirm 은 거절한다 — 끝나면 원래대로 돌려준다', async () => {
  const page = makeSsgPage({ dialogsInDetail: true });
  const nativeAlert = page.window.alert;
  const nativeConfirm = page.window.confirm;
  const outcome = await runSsgFill(page);

  assert.equal(page.log.confirmDuringFill, false);
  // 몰이 한 말은 버리지 않고 사람에게 넘긴다.
  assert.ok(Array.from(outcome.warnings).includes('몰 안내: 상세 안내'), JSON.stringify(outcome.warnings));
  assert.equal(page.window.alert, nativeAlert);
  assert.equal(page.window.confirm, nativeConfirm);
});

test('⭐ 전시 시작은 지금 이후 정각이다 — 과거면 화면이 저장을 막는다', async () => {
  const page = makeSsgPage();
  const before = Date.now();
  await runSsgFill(page);

  const text = page.dto.itemDto.itemBaseDto.dispStrtDt;
  assert.match(text, /^\d{4}-\d{2}-\d{2} \d{2}:00$/);
  const [datePart, timePart] = text.split(' ');
  const start = new Date(`${datePart}T${timePart}:00`).getTime();
  assert.ok(start >= before + 3 * 3600 * 1000, `${text} 는 3시간 뒤 이후여야 한다`);
});

test('주소 셀렉트에는 네이티브 change 한 번만 쏜다 — jQuery 로 또 쏘면 고른 주소가 지워진다', async () => {
  const page = makeSsgPage();
  await runSsgFill(page);

  const select = page.bySelector.get('select#whoutAddrId');
  assert.deepEqual(Array.from(select.events), ['change']);
  const source = loadModule().pageFunctions.fillSsgProductForm.toString();
  assert.ok(!/trigger\(/.test(source), 'jQuery trigger 를 쓰지 않는다');
  assert.ok(!/goSave/.test(source), '저장 함수를 부르지 않는다');
});

test('로그인 화면이면 폼이 없다고 돌려준다 — 확장이 로그인 뒤 다시 채운다', async () => {
  const page = makeSsgPage({ loginPage: true });
  const outcome = await runSsgFill(page);

  assert.equal(outcome.ok, false);
  assert.equal(outcome.noForm, true);
  assert.equal(page.dto.itemDto.itemBaseDto.itemNm, null);
});

test('⭐ 상품번호가 실린 수정 화면이면 아무것도 넣지 않는다', async () => {
  const page = makeSsgPage({ editItemId: '1000850269603' });
  const outcome = await runSsgFill(page);

  assert.equal(outcome.ok, false);
  assert.match(outcome.error, /수정 화면/);
  assert.equal(page.byId.get('siteNo6004').checked, false);
  assert.equal(page.dto.itemDto.itemBaseDto.itemNm, null);
});

test('상세 업로드가 실패하면 이미 읽히는 주소로 넣고, 그것도 없으면 말한다', async () => {
  const failing = makeSsgPage({ detailUploadPath: '' });
  const withFallback = await runSsgFill(failing, {
    detailHtml: '<center><img referrerpolicy="no-referrer" src="https://kiditem.diskn.com/abc"></center>',
  });
  assert.ok(Array.from(withFallback.warnings).some((w) => w.includes('상세이미지를 몰에 올리지 못했습니다')));
  assert.deepEqual(Array.from(failing.log.detail), ['<center><img referrerpolicy="no-referrer" src="https://kiditem.diskn.com/abc"></center>']);

  const empty = makeSsgPage({ detailUploadPath: '' });
  const withoutFallback = await runSsgFill(empty);
  assert.ok(Array.from(withoutFallback.warnings).some((w) => w.includes('상세설명에 넣을 이미지를 만들지 못했습니다')));
  assert.deepEqual(Array.from(empty.log.detail), []);
});

test('제출하지 않는다', async () => {
  const { api } = harness();
  const result = await api.register({ mall: 'ssg', form: form() });
  assert.equal(result.submitted, false);
});
