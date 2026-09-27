import { describe, expect, it } from 'vitest';
import guardSource from '../kiditem-os/content/page-call/dialog-guard.js?raw';
import fillSource from '../kiditem-os/content/page-call/form-fill.js?raw';
import ssgSource from '../kiditem-os/content/page-call/ssg-register.js?raw';
import { normalizeForm } from './sites/mall-write/form';
import { scopedPageCalls, withFakeClock } from './sites/mall-write/write-page.fake';
import { mallWriterFor } from './sites/mall-write/writer';
import { SSG_REGISTRATION_FORM } from './sites/ssg/registration';

// 신세계 파트너오피스 상품등록(`po.ssgadm.com/cp/item/item/itemNew.ssg`, 실측 2026-09-14): 새 화면을 채운 뒤 화면 자체 검증
// (`ItemValidator`·`saveValidModules`)이 통과하는 것까지 저장 없이 확인했다. 가짜 화면은 옛 node 스펙(`mall-form-ssg`)의 것을
// 그대로 옮겼다 — 선택자와 반응은 라이브에서 잰 것이다.
type Fake = Record<string, any>;

const ssgForm = (overrides: Fake = {}): Fake => ({
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

const form = (overrides: Fake = {}) => ({ url: 'https://po.ssgadm.com/cp/item/item/itemNew.ssg', manualSteps: [], ssg: ssgForm(), ...overrides });

class FakeEvent {
  constructor(readonly type: string, init: Fake = {}) {
    Object.assign(this, init);
  }
}

function element(props: Fake = {}): Fake {
  const el: Fake = { tagName: 'INPUT', type: 'text', value: '', checked: false, placeholder: '', visible: true, options: [], listeners: {}, events: [], ...props };
  el.addEventListener = (type: string, handler: (event: unknown) => void) => { (el.listeners[type] ||= []).push(handler); };
  el.dispatchEvent = (event: { type: string }) => {
    el.events.push(event.type);
    for (const handler of el.listeners[event.type] || []) handler.call(el, event);
    return true;
  };
  el.click = () => {
    if (el.type === 'radio') el.checked = true;
    if (el.type === 'checkbox') el.checked = !el.checked;
    el.dispatchEvent(new FakeEvent('click'));
  };
  el.focus = () => undefined;
  el.getClientRects = () => (el.visible ? [{}] : []);
  el.querySelector = (selector: string) => (selector === 'a' ? el.link || null : null);
  return el;
}

/** 라이브 화면에서 잰 반응만 흉내 낸다(옛 `makeSsgPage` 그대로). */
function makeSsgPage({ loginPage = false, editItemId = null as string | null, detailUploadPath = 'https://sitem.ssgcdn.com/editor/detail.jpg', dialogsInDetail = false } = {}) {
  const log: Fake = { detail: [], feesAdded: [], fetches: [], saved: false, confirmDuringFill: null };
  const dto = { itemDto: { itemBaseDto: { itemId: editItemId, itemNm: null as string | null, stdCtgId: null as string | null, dispStrtDt: '2026-09-14 13:38' } as Fake } };
  const byId = new Map<string, Fake>();
  const bySelector = new Map<string, Fake>();
  const add = (id: string | null, el: Fake, selectors: string[] = []) => {
    if (id) byId.set(id, el);
    for (const selector of selectors) bySelector.set(selector, el);
    return el;
  };

  const password = element({ type: 'password', visible: loginPage });
  const site = add('siteNo6004', element({ type: 'checkbox' }));
  const dispInput = element({ placeholder: '카테고리명을 입력하세요.', visible: false });
  const stdInput = add('suggestStdCtgTxt', element({ placeholder: '표준분류명을 입력하세요.', visible: false }));
  site.addEventListener('click', () => { dispInput.visible = site.checked; });
  const dispLink = element({ tagName: 'A' });
  dispLink.addEventListener('click', () => { stdInput.visible = true; });
  dispInput.addEventListener('keyup', () => {
    if (dispInput.value === '기타시즌잡화') bySelector.set('#suggestCombo_suggestMainDispCtgId li[data-value^="6000162263|"]', element({ tagName: 'LI', link: dispLink }));
  });
  const stdLink = element({ tagName: 'A' });
  stdLink.addEventListener('click', () => { dto.itemDto.itemBaseDto.stdCtgId = '1000022578'; });
  stdInput.addEventListener('keyup', () => {
    if (stdInput.value === '패션.잡화') bySelector.set('#suggestCombo_suggestStdCtgId li[data-value^="1000022578|"]', element({ tagName: 'LI', link: stdLink }));
  });
  const brandId = add('brandId', element({ type: 'hidden' }));
  const brandInput = add(null, element(), ['input#brandNm']);
  const brandCombo = add('suggestCombo_brandId', element({ tagName: 'SELECT' }));
  brandInput.addEventListener('keyup', () => { brandCombo.options = [{ value: '3000047083|키드아이템' }]; });
  brandCombo.addEventListener('click', () => { brandId.value = brandCombo.options[brandCombo.selectedIndex].value.split('|')[0]; });
  const itemNm = add(null, element(), ['input#itemNm']);
  itemNm.addEventListener('input', () => { dto.itemDto.itemBaseDto.itemNm = itemNm.value; });
  add(null, element({ type: 'radio' }), ['#itemAddInfo input[name="adultItemTypeCd"][value="90"]']);
  add(null, element({ type: 'radio' }), ['#itemRetExch input[name="retExchPsblYn"][value="Y"]']);
  add('autoAccount_1', element({ type: 'radio', checked: true }));

  // 가격 그리드. 편집기를 닫을 때 화면이 공급가를 계산한다.
  const cells: Record<number, string> = {};
  const grid: Fake = {
    getRowsNum: () => 1,
    getRowId: () => 'row1',
    getRowIndex: () => 0,
    getColIndexById: (id: string) => ({ splprc: 6, sellprc: 8, mrgrt: 9 } as Record<string, number>)[id],
    selectCell(_row: unknown, column: number) { grid.column = column; },
    editCell() { grid.editor = { obj: { value: '' } }; },
    editStop() {
      cells[grid.column] = grid.editor.obj.value;
      if (cells[8] && cells[9]) cells[6] = String(Math.round(Number(cells[8]) * (100 - Number(cells[9])) / 100 / 1.1));
      grid.editor = null;
    },
    cells: (_rowId: unknown, column: number) => ({ getValue: () => cells[column] ?? '' }),
  };
  add(null, element(), ['input#usablInvQty']);
  add(null, element(), ['input#mdlNm']);
  add(null, element(), ['input#itemSrchwdNm']);
  add('dispDt99_btn', element({ type: 'radio' }));
  const start = add(null, element(), ['input#dispStrtDts']);
  start.addEventListener('input', () => { dto.itemDto.itemBaseDto.dispStrtDt = start.value; });
  const noticeClass = add(null, element({ tagName: 'SELECT', options: [{ value: '0000000029' }, { value: '0000000025' }] }), ['select#itemMngPropClsId']);
  const noticeInputs = ['0000000022', '0000000122', '0000000009', '0000000012'].map((id) => add(id, element({ visible: false })));
  add('0000000008_Y', element({ type: 'radio' }));
  noticeClass.addEventListener('change', () => { for (const input of noticeInputs) input.visible = noticeClass.value === '0000000029'; });
  add(null, element(), ['input#manufcoNm']);
  const originInput = add(null, element(), ['input#orplcNm0']);
  const originCombo = add('suggestCombo_prodManufCntryId0', element({ tagName: 'SELECT' }));
  const originId = add('prodManufCntryId0', element({ type: 'hidden' }));
  originInput.addEventListener('keyup', () => { originCombo.options = [{ value: '1000000002|중국' }]; });
  originCombo.addEventListener('click', () => { originId.value = originCombo.options[originCombo.selectedIndex].value.split('|')[0]; });
  add(null, element(), ['input#shppRqrmDcnt']);
  // 주소 셀렉트는 인라인 onchange 다: 고른 값을 dto 에 적고 셀렉트는 첫 줄로 돌아간다.
  for (const [id, values] of [['whoutAddrId', ['0006820707', '0006820704']], ['snbkAddrId', ['0006820707', '0006820704']]] as const) {
    const select = add(null, element({ tagName: 'SELECT', options: values.map((value) => ({ value })) }), [`select#${id}`]);
    select.addEventListener('change', () => { dto.itemDto.itemBaseDto[id] = select.value; select.value = ''; });
  }
  // 배송비 5단. 앞 단을 고르면 다음 단 목록이 생긴다.
  const chain = ['gnrlShppcstPlcyDivCd', 'gnrlShppcstPlcyTypeCd', 'gnrlPrpayCodDivCd', 'gnrlShppcstAplUnitCd', 'gnrlShppcstId'];
  const feeSelects = chain.map((id) => add(null, element({ tagName: 'SELECT' }), [`select#${id}`]));
  feeSelects[0]!.options = [{ value: '10' }, { value: '20' }];
  const nextOptions: Record<string, string[]> = { gnrlShppcstPlcyTypeCd: ['22'], gnrlPrpayCodDivCd: ['10'], gnrlShppcstAplUnitCd: ['10'] };
  feeSelects.forEach((select, index) => {
    select.addEventListener('change', () => {
      const next = feeSelects[index + 1];
      if (!next) return;
      const nextId = chain[index + 1]!;
      next.options = (nextId === 'gnrlShppcstId' ? (feeSelects[0]!.value === '10' ? ['0000621476', '0072563387'] : ['0000621477', '0072563388']) : nextOptions[nextId]!).map((value) => ({ value }));
    });
  });
  const addFee = add('addGnrlShppcstPlcyBtn', element({ tagName: 'BUTTON' }));
  addFee.addEventListener('click', () => { log.feesAdded.push(feeSelects[4]!.value); });
  // 이미지 칸: 파일 선택 = 화면이 몰 서버에 올리고(동기) 경로를 숨은 칸에 적는다.
  for (let slot = 1; slot <= 10; slot += 1) {
    const file = add(`uitemImgVod10_${slot}_file`, element({ type: 'file' }));
    const pathInput = add(`uitemImgVod10_${slot}_dataFileNm`, element({ type: 'hidden' }));
    add(`uitemImgVod10_${slot}_rplcTextNm`, element());
    file.addEventListener('change', () => {
      if (/\.(jpe?g|png)$/i.test(file.files?.[0]?.name || '')) pathInput.value = `/tmp/upload/${slot}.jpg`;
    });
  }

  const shown: string[] = [];
  const window: Fake = {
    // 진짜 창(가드가 쓰기 탭에서 받아 준다 — 여기까지 오면 안 된다).
    alert: (message: string) => { shown.push(`alert ${message}`); },
    confirm: (message: string) => { shown.push(`confirm ${message}`); return true; },
    itemMainDto: dto,
    ItemPrcInv: { gridRepPrc: grid },
    ItemDtl: {
      popupItemDtlSynapEditorCallBack(html: string) {
        log.detail.push(html);
        if (!dialogsInDetail) return;
        // 채우는 동안 화면이 alert/confirm을 부르면 가드가 받아야 하고, confirm은 거절이어야 한다.
        window.alert('상세 안내');
        log.confirmDuringFill = window.confirm('저장하시겠습니까?');
      },
    },
    ItemMain: { savePreProcess() {}, saveValidModules: () => true, goSave() { log.saved = true; } },
    ItemValidator: { validate: () => true },
    jQuery: () => ({}),
    scrollTo() {},
  };
  const document = {
    body: element({ tagName: 'BODY' }),
    getElementById: (id: string) => byId.get(id) || null,
    querySelector: (selector: string) => bySelector.get(selector) || null,
    querySelectorAll: (selector: string) => {
      if (selector === 'input[type="password"]') return [password];
      if (selector === '#categoryInfo input[type=text]') return [dispInput, stdInput];
      return [];
    },
  };
  class FakeDataTransfer {
    files: unknown[] = [];
    items = { add: (file: unknown) => this.files.push(file) };
  }
  const calls = scopedPageCalls([guardSource, fillSource, ssgSource], {
    window,
    document,
    location: { origin: 'https://po.ssgadm.com', href: 'https://po.ssgadm.com/cp/item/item/itemNew.ssg' },
    Event: FakeEvent,
    KeyboardEvent: FakeEvent,
    MouseEvent: FakeEvent,
    DataTransfer: FakeDataTransfer,
    File: class { name: string; type: string; constructor(_parts: unknown, name: string, options?: { type?: string }) { this.name = name; this.type = options?.type || ''; } },
    FormData: class { entries: unknown[] = []; append(name: string, value: { name?: string }) { this.entries.push([name, value?.name ?? value]); } },
    fetch: async (url: string, init?: Fake) => {
      log.fetches.push({ url: String(url), method: init?.method, fields: init?.body?.entries });
      return { ok: true, status: 200, json: async () => ({ uploadPath: detailUploadPath }) };
    },
  });
  return { calls, window, log, dto, cells, byId, bySelector, shown };
}

async function runSsgFill(page: ReturnType<typeof makeSsgPage>, overrides: Fake = {}): Promise<Fake> {
  const normalized = normalizeForm(SSG_REGISTRATION_FORM, form());
  return withFakeClock(() => page.calls['ssg.fill']!({
    form: normalized.dedicated,
    images: [
      { name: 'ssg0', dataUrl: 'data:image/jpeg;base64,AAEC', fileName: 'rep.jpg' },
      { name: 'ssg1', dataUrl: 'data:image/jpeg;base64,AAEC', fileName: 'extra' },
    ],
    ...SSG_REGISTRATION_FORM.dedicated!.options,
    formWaitMs: 200,
    stepWaitMs: 200,
    detailImage: { name: 'detail', dataUrl: 'data:image/jpeg;base64,AAEC', fileName: 'wing-server-jpeg-v1-780.jpg' },
    detailHtml: '',
    ...overrides,
  }));
}

describe('신세계 상품등록 폼(KID-256)', () => {
  it('등록 화면 주소 하나만 받는다 — 쿼리가 붙으면 기존 상품 수정 화면이다', () => {
    for (const url of [
      'https://po.ssgadm.com/main.ssg',
      'https://po.ssgadm.com/cp/itemoper/itemMng/listItemInfoMng.ssg',
      'https://po.ssgadm.com/cp/item/item/itemNew.ssg?srcItemId=1000850269603',
      'https://po.ssgadm.com/cp/item/item/itemNew.ssg?itemId=1000850269603',
    ]) {
      expect(() => normalizeForm(SSG_REGISTRATION_FORM, form({ url })), url).toThrow(/신세계 상품등록 주소가 아닙니다/);
    }
  });

  it('상품명·판매가·카테고리가 없으면 탭을 열기 전에 멈추고, 번호 칸의 숫자 아닌 글자는 버린다(선택자를 만드는 번호다)', () => {
    expect(() => normalizeForm(SSG_REGISTRATION_FORM, form({ ssg: ssgForm({ itemName: ' ' }) }))).toThrow(/상품명/);
    expect(() => normalizeForm(SSG_REGISTRATION_FORM, form({ ssg: ssgForm({ salePrice: 0 }) }))).toThrow(/판매가/);
    expect(() => normalizeForm(SSG_REGISTRATION_FORM, form({ ssg: ssgForm({ displayCategory: { id: 'x', keyword: '완구' } }) }))).toThrow(/전시카테고리/);
    expect(() => normalizeForm(SSG_REGISTRATION_FORM, form({ ssg: undefined }))).toThrow(/신세계 폼 데이터/);
    const cleaned = normalizeForm(SSG_REGISTRATION_FORM, form({
      ssg: ssgForm({ shipping: { leadDays: 3, outboundAddrId: '"] , a[href', returnAddrId: '0006820707', fees: [{ divCd: '10', typeCd: '22', prepayCd: '10', unitCd: '10', feeId: '1"]' }] } }),
    })).dedicated as Fake;
    expect(cleaned.shipping).toEqual({ leadDays: 3, outboundAddrId: '', returnAddrId: '0006820707', fees: [] });
  });

  it('신세계 로그인 입구가 있다(옛 mall-session ssg 줄) — 로그인 화면은 authentication/login', () => {
    const writer = mallWriterFor('ssg')!;
    expect(writer.login?.loginUrl).toBe('https://po.ssgadm.com/');
    expect(writer.guard.isLogin(new URL('https://po.ssgadm.com/authentication/login.ssg'))).toBe(true);
    expect(writer.guard.isLogin(new URL('https://po.ssgadm.com/cp/item/item/itemNew.ssg'))).toBe(false);
  });

  it('사람이 누르는 순서대로 채우고 저장(goSave)은 부르지 않는다', async () => {
    const page = makeSsgPage();
    const outcome = await runSsgFill(page);

    expect(outcome.ok, JSON.stringify(outcome.warnings)).toBe(true);
    expect(outcome.warnings).toEqual([]);
    const base = page.dto.itemDto.itemBaseDto;
    expect(base.stdCtgId).toBe('1000022578');
    expect(base.itemNm).toBe('만두 쫀뜩 말랑이 1p 주물럭 스트레스볼 스퀴시');
    expect(page.byId.get('brandId')!.value).toBe('3000047083');
    expect(page.byId.get('prodManufCntryId0')!.value).toBe('1000000002');
    expect(page.byId.get('0000000022')!.value).toBe('4000만두쫀뜩말랑이');
    expect(page.byId.get('0000000008_Y')!.checked).toBe(true);
    // 판매가 2,600 · 마진 15 → 공급가 2,009(기존 등록물과 같은 값).
    expect(page.cells[6]).toBe('2009');
    expect(base.whoutAddrId).toBe('0006820704');
    expect(base.snbkAddrId).toBe('0006820707');
    expect(page.log.feesAdded).toEqual(['0000621476', '0000621477']);
    expect(page.byId.get('uitemImgVod10_1_dataFileNm')!.value).toBe('/tmp/upload/1.jpg');
    // 확장자 없는 이름도 형식에 맞춰 붙여 올린다 — 화면이 확장자로 거른다.
    expect(page.byId.get('uitemImgVod10_2_dataFileNm')!.value).toBe('/tmp/upload/2.jpg');
    expect(outcome.steps).toContain('저장 전 검증 통과');
    expect(page.log.saved).toBe(false);
    expect(ssgSource).not.toMatch(/goSave\(/);
  });

  it('상세 이미지는 SSG Editor 업로드 주소로 에디터 저장 콜백에 넣는다', async () => {
    const page = makeSsgPage();
    await runSsgFill(page);
    const [upload] = page.log.fetches;
    expect(upload).toMatchObject({ url: '/upload/0/synapEditorUpload.ssg', method: 'POST', fields: [['file', 'wing-server-jpeg-v1-780.jpg']] });
    expect(page.log.detail).toEqual(['<center><img src="https://sitem.ssgcdn.com/editor/detail.jpg"></center>']);
  });

  it('채우는 동안 몰의 alert은 가드가 받아 몰 안내로 넘기고 confirm은 거절한다 — 진짜 창은 뜨지 않는다', async () => {
    const page = makeSsgPage({ dialogsInDetail: true });
    const outcome = await runSsgFill(page);
    expect(page.log.confirmDuringFill).toBe(false);
    expect(outcome.warnings).toContain('몰 안내: 상세 안내');
    expect(page.shown).toEqual([]);
  });

  it('전시 시작은 지금 이후 정각이다 — 과거면 화면이 저장을 막는다', async () => {
    const page = makeSsgPage();
    const before = Date.now();
    await runSsgFill(page);
    const text = page.dto.itemDto.itemBaseDto.dispStrtDt as string;
    expect(text).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:00$/);
    const [datePart, timePart] = text.split(' ');
    expect(new Date(`${datePart}T${timePart}:00`).getTime()).toBeGreaterThanOrEqual(before + 3 * 3600 * 1000);
  });

  it('주소 셀렉트에는 네이티브 change 한 번만 쏜다 — jQuery로 또 쏘면 고른 주소가 지워진다', async () => {
    const page = makeSsgPage();
    await runSsgFill(page);
    expect(page.bySelector.get('select#whoutAddrId')!.events).toEqual(['change']);
    expect(ssgSource).not.toMatch(/trigger\(/);
  });

  it('로그인 화면이면 폼이 없다고 돌려준다 · 상품번호가 실린 수정 화면이면 아무것도 넣지 않는다', async () => {
    const login = makeSsgPage({ loginPage: true });
    await expect(runSsgFill(login)).resolves.toMatchObject({ ok: false, noForm: true });
    expect(login.dto.itemDto.itemBaseDto.itemNm).toBeNull();

    const edit = makeSsgPage({ editItemId: '1000850269603' });
    const outcome = await runSsgFill(edit);
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/수정 화면/);
    expect(edit.byId.get('siteNo6004')!.checked).toBe(false);
  });

  it('상세 업로드가 실패하면 이미 읽히는 주소로 넣고, 그것도 없으면 말한다', async () => {
    const failing = makeSsgPage({ detailUploadPath: '' });
    const withFallback = await runSsgFill(failing, { detailHtml: '<center><img referrerpolicy="no-referrer" src="https://kiditem.diskn.com/abc"></center>' });
    expect(withFallback.warnings.some((warning: string) => warning.includes('상세이미지를 몰에 올리지 못했습니다'))).toBe(true);
    expect(failing.log.detail).toEqual(['<center><img referrerpolicy="no-referrer" src="https://kiditem.diskn.com/abc"></center>']);

    const empty = makeSsgPage({ detailUploadPath: '' });
    const withoutFallback = await runSsgFill(empty);
    expect(withoutFallback.warnings.some((warning: string) => warning.includes('상세설명에 넣을 이미지를 만들지 못했습니다'))).toBe(true);
    expect(empty.log.detail).toEqual([]);
  });
});
