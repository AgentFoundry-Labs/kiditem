import { JSDOM } from 'jsdom';
import { assert, describe, expect, it } from 'vitest';
import guardSource from '../kiditem-os/content/page-call/dialog-guard.js?raw';
import fillSource from '../kiditem-os/content/page-call/form-fill.js?raw';
import gsshopSource from '../kiditem-os/content/page-call/gs-shop-register.js?raw';
import { GS_SHOP_REGISTRATION_FORM } from './sites/gs-shop/registration';
import { normalizeForm } from './sites/mall-write/form';
import { withFakeClock } from './sites/mall-write/write-page.fake';

/**
 * GS SHOP 파트너스 상품등록(`partners.gsshop.com/product/products/create`, KID-256 — 옛 node 스펙 `mall-form-gsshop` 이식).
 *
 * 실측 2026-09-14. 기존 등록물 1128331771 의 상품 JSON·정보고시·기술서를 읽고, 새 등록 화면의 폼 저장소
 * (zustand `product-store`) 처리 함수를 불러 화면 표시까지 저장 없이 확인했다. 아래 가짜 화면의 처리 함수
 * 이름·값 모양은 그 화면 것 그대로다. jsdom 은 동적 import 를 못 해 처리기의 `import(` 한 곳을 가짜 모듈로 바꿔 넣는다.
 */

const gsshopForm = (overrides = {}) => ({
  category: 'B35012701',
  sectionId: '1662165',
  supplierProductCode: 'KIDB3FAB6AF07B5',
  mdId: '',
  employeeNo: '',
  exposureName: '땅콩 말랑 키링 (1p) 열쇠고리 가꾸 백참 키보드 키홀더 가방 장식 악세사리',
  invoiceName: '땅콩 말랑 키링 (1p) 열쇠고리',
  brand: { code: '244211', name: '키드아이템' },
  modelName: '1200땅콩말랑키링',
  composition: { content: '땅콩 말랑 키링', packageCount: 1, maker: '해피프랜즈', origin: '중국' },
  salePrice: 830,
  marginRate: 20,
  delivery: {
    courier: 'DH', convenienceReturn: 'N', fee: 3000, freeOver: 30000, returnFee: 3000, exchangeFee: 6000,
    remote: { fee: 3000, returnFee: 3000, exchangeFee: 3000 },
    refundType: '10', shipAddress: '0001', returnAddress: '0001', bundle: 'A01', weight: 'A02', length: 'B02',
  },
  stock: 999,
  safeStock: 5,
  notice: { groupCode: '43', values: { 43026: '1200땅콩말랑키링', 43141: '해당없음', 43142: '중국', 43004: '해피프랜즈' } },
  ...overrides,
});

const form = (overrides = {}) => ({
  url: 'https://partners.gsshop.com/product/products/create',
  imageGroups: { gsshop: ['https://image1.coupangcdn.com/rep.jpg', 'https://image1.coupangcdn.com/extra1.jpg'] },
  detailUploads: [{ url: 'http://localhost:9000/kiditem/detail-page-images/o/r/wing-server-jpeg-v1-780.jpg' }],
  manualSteps: [],
  gsshop: gsshopForm(),
  ...overrides,
});


describe('GS샵 폼 지시 검사(탭을 열기 전)', () => {
  it('등록 주소 하나만 받는다 — 수정·복사 화면에는 채우지 않는다', () => {
    for (const url of [
      // 판매중 상품 수정·복사 화면이다. 같은 폼이라 채우고 저장하면 그 상품이 바뀐다.
      'https://partners.gsshop.com/product/products/update/1128331771',
      'https://partners.gsshop.com/product/products/copy/1128331771',
      'https://partners.gsshop.com/product/products/create?isSupPrdCd=true',
      'https://partners.gsshop.com/product/products/create-more',
      'https://partners.gsshop.com/product/products/list',
      'https://gsshop.com/product/products/create',
    ]) {
      expect(() => normalizeForm(GS_SHOP_REGISTRATION_FORM, form({ url })), url).toThrow(/상품등록 주소가 아닙니다/);
    }
  });

  it('분류·전시·코드·상품명·판매가·브랜드가 없거나 모양이 틀리면 채우러 가지 않는다', () => {
    const reject = (gsshop: unknown, pattern: RegExp) => expect(() => normalizeForm(GS_SHOP_REGISTRATION_FORM, form({ gsshop }))).toThrow(pattern);
    reject(gsshopForm({ category: '완구' }), /상품분류/);
    reject(gsshopForm({ sectionId: '' }), /전시 카테고리/);
    reject(gsshopForm({ supplierProductCode: '한글코드' }), /협력사 상품코드/);
    reject(gsshopForm({ invoiceName: ' ' }), /송장상품명/);
    reject(gsshopForm({ salePrice: 0 }), /판매가/);
    reject(gsshopForm({ brand: { code: '', name: '키드아이템' } }), /브랜드/);
    reject(undefined, /GS샵 폼 데이터/);
  });

  it('화면이 막는 글자를 빼고 바이트 상한(송장 30)을 넘기지 않는다', () => {
    const values = normalizeForm(GS_SHOP_REGISTRATION_FORM, form({ gsshop: gsshopForm({ exposureName: '별*모양 "키링" <신상>', invoiceName: "아주아주긴이름의:말랑말랑키링's (1p)" }) })).dedicated as any;
    assert.equal(values.exposureName, '별모양 키링 신상');
    assert.ok(!/[:'"<>|\\]/.test(values.invoiceName), values.invoiceName);
    assert.ok([...values.invoiceName].reduce((sum: number, char: string) => sum + (/^[\x00-\x7f]$/.test(char) ? 1 : 2), 0) <= 30, values.invoiceName);
  });
});

describe('GS샵 페이지 처리기(content/page-call/gs-shop-register.js)', () => {

/**
 * 폼 저장소와 화면이 부르는 BFF 조회를 흉내 낸다. 처리 함수 이름과 저장소 칸 이름은 실제 화면 것 그대로다.
 * 몇몇 처리 함수는 실제처럼 안내창을 띄우고 닫힐 때까지 끝나지 않는다.
 */
function makeGsshopPage({
  mode = 'create',
  loginPage = false,
  duplicateCode = null,
  failImageSeq = null,
  failDetailUpload = false,
  leafMissing = false,
}: any = {}) {
  const dom = new JSDOM(loginPage
    ? '<input type="password">'
    : '<head><link rel="modulepreload" href="/chunks/Other1.js"><link rel="modulepreload" href="/chunks/Store2.js"></head><body><div id="root"></div></body>', {
    url: 'https://partners.gsshop.com/product/products/create',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const { document } = window;
  window.Element.prototype.getClientRects = function getClientRects() {
    return this.isConnected && !this.closest('[hidden]') ? [{}] : [];
  };
  window.scrollTo = () => {};
  const nativeAlert = () => { throw new Error('native alert'); };
  const nativeConfirm = () => { throw new Error('native confirm'); };
  window.alert = nativeAlert;
  window.confirm = nativeConfirm;

  const log: any = { calls: [], saved: false, imageUploads: [], tempUploads: [], detail: '' };
  const schemas: any = {};
  const set = (key: any, value: any) => { schemas[key] = { key, value }; };
  const get = (key: any) => schemas[key]?.value;
  set('images', Array.from({ length: 8 }, (_, i) => ({ seq: i + 1, cntntUrl: '', cntntFileNm: '' })));
  set('shop.ctgrShops', [{ rowState: 'created' }]);
  set('custom.govPublsListG', []);

  /** 안내창. 누를 때까지 끝나지 않는 promise 를 돌려준다(화면의 `await alert(...)` 와 같다). */
  const showDialog = (text: any, labels = ['확인']) => new Promise((resolve) => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const body = document.createElement('p');
    body.textContent = text;
    dialog.append(body);
    for (const label of labels) {
      const button = document.createElement('button');
      button.textContent = label;
      button.addEventListener('click', () => { dialog.remove(); resolve(label); });
      dialog.append(button);
    }
    document.body.append(dialog);
  });
  const record = (name: any) => (...args: any[]) => { log.calls.push(name); return args; };

  const actions: any = {
    setFieldValue: (key: any, value: any) => set(key, value),
    baseInfo: {
      async setPrdClsLayerSelected(e: any) {
        record('setPrdClsLayerSelected')(e);
        set('base.prdClsCd', `${e.class1}${e.class2}${e.class3}${e.class4}`);
        set('classification.dtlCls.name', e.class4Nm);
      },
      async onClickRecentRegSectCls(section: any) {
        set('shop.ctgrShops', [{ rowState: 'created', sectid: String(section.sectid), sectGrpSeq: section.sectGrpSeq }]);
      },
      onChangeSupPrdCd: (value: any) => set('base.supPrdCd', value),
      async onChangeOperMdId(value: any) {
        set('base.operMdId', value);
        set('base.repMdUserId', '');
        // 실제 화면: 담당MD 를 고르면 QA·사전심의 대상 안내가 뜬다.
        await showDialog('등록할 상품은 품질검사(QA)와 사전심의 대상 상품입니다.');
      },
      onChangeRepMdUserId: (value: any) => set('base.repMdUserId', value),
      onChangeExposPrdNm: (value: any) => set('base.exposPrdNm', value),
      onChangePrdNm: (value: any) => set('base.prdNm', value),
      async onSelectSearchedBrand(brand: any) {
        set('base.brandCd', brand.brandCd);
        set('base.brandNm', brand.brandNm);
      },
      onChangeModelNo: (value: any) => set('base.modelNo', value),
    },
    cmposInfo: {
      async onChangeCompositions(key: any, value: any) { set(key, value); },
      async onChangeSalePrc(value: any) { set('price.salePrc', value); },
      async onChangeMargnRt(value: any) {
        set('price.margnRt', value);
        set('price.fee', Math.round((Number(get('price.salePrc')) * (100 - Number(value))) / 100));
      },
    },
    deliveryInfo: new Proxy({}, {
      get(_target, name) {
        if (name === 'onChangeRfnTypCd') {
          return async (value: any) => {
            set('delivery.rfnTypCd', value);
            await showDialog('반품접수 시점으로 부터 6영업일 이후 자동 환불 처리 됩니다.');
          };
        }
        const map: any = {
          onChangeDlvsCoCd: 'delivery.dlvsCoCd', onChangeChrDlvCost: 'delivery.chrDlvCost', onChangeRtnChrAmt: 'custom.rtnChrAmt',
          onChangePrdRelspAddrCd: 'delivery.prdRelspAddrCd', onChangePrdRetpAddrCd: 'delivery.prdRetpAddrCd',
          onChangeQuantityValUnitCd: 'delivery.quantityValue.unitCd', onChangeIlndExchChrAmt: 'custom.ilndExchChrAmt',
        };
        return (value: any) => { log.calls.push(String(name)); if (map[name]) set(map[name], value); };
      },
    }),
    attrInfo: {
      onChangeOrdPsblQty: (value: any) => set('custom.ordPsblQty', value),
      onChangeSafeStockQty: (value: any) => set('custom.safeStockQty', value),
    },
    govPublsInfo: {
      async onChangeGovPublsPrdGrpCd(code: any) {
        set('explanation.govPublsPrdGrpCd', code);
        await new Promise((resolve) => setTimeout(resolve, 20));
        set('custom.govPublsListG', [
          { prdExplnItmCd: '43026', prdExplnItmNm: '품명 및 모델명', mandYn: 'Y', editable: true, prdExplnCntnt: '' },
          { prdExplnItmCd: '43141', prdExplnItmNm: '인증·허가', mandYn: 'Y', editable: true, prdExplnCntnt: '' },
          { prdExplnItmCd: '43142', prdExplnItmNm: '제조국', mandYn: 'Y', editable: true, prdExplnCntnt: '' },
          { prdExplnItmCd: '43004', prdExplnItmNm: '제조자', mandYn: 'Y', editable: true, prdExplnCntnt: '' },
          { prdExplnItmCd: '43143', prdExplnItmNm: 'A/S 책임자', mandYn: 'Y', editable: false, prdExplnCntnt: 'GSSHOP 고객센터 080-414-4545' },
        ]);
      },
      onChangeSafeCertTgtYn: (value: any) => set('safeCertification.safeCertTgtYn', value),
    },
    imgInfo: {
      async uploadPrdImg(image: any) {
        log.imageUploads.push({ seq: image.seq, name: image.orgFile.name });
        if (image.seq === failImageSeq) {
          await showDialog('이미지 업로드에 실패했습니다.');
          return;
        }
        set('images', get('images').map((slot: any) => (slot.seq === image.seq
          ? { ...slot, cntntUrl: 'data:image/jpeg;base64,AAEC', filePath: `/temp/${image.orgFile.name}`, cntntFileNm: image.orgFile.name }
          : slot)));
      },
    },
    common: {
      create: {
        save: () => { log.saved = true; },
        imsiSave: () => { log.saved = true; },
      },
    },
  };
  const state: any = {
    meta: { isReady: true, mode },
    schemas,
    actions,
    deps: { crossEditor: { getValue: () => log.detail, setValue: (html: any) => { log.detail = html; } } },
  };
  const store: any = { getState: () => state };
  // 편집기의 사진 올리기(임시 업로드). 페이지 함수는 이 모양(keepName · .file)으로 찾는다.
  async function tempUpload(request: any) {
    const keepName = request.keepName ?? 'false';
    // 화면(jsdom) 쪽 배열이라 이 테스트의 배열로 옮겨 담는다.
    log.tempUploads.push({ keepName, names: Array.from(request.files, (entry: any) => entry.file.name) });
    if (failDetailUpload) throw new Error('HTTP 500');
    return [{ path: 'https://image.gsshop.com/temp/detail.jpg' }];
  }
  const modules: any = {
    '/chunks/Other1.js': { a: {}, b: () => 1 },
    '/chunks/Store2.js': { p: store, u: store, g: tempUpload },
  };
  window.__importModule = async (href: any) => {
    if (!modules[href]) throw new Error(`no module ${href}`);
    return modules[href];
  };

  const bff: any = {
    '/bff/product/classifications/top': [{ code: 'B35', name: '완구/게임' }],
    '/bff/product/classifications/subs?upperCode=B35&level=1': [{ code: '01', name: '완구/게임' }],
    '/bff/product/classifications/subs?upperCode=B3501&level=2': [{ code: '27', name: '팬시/드레스 액세서리' }],
    '/bff/product/classifications/leaf?upperCode=B350127': leafMissing ? [] : [{ prdClsCd: 'B35012701', prdClsNm: '팬시/드레스 액세서리' }],
    '/bff/display/sections/by-leaf?sectIds=1662165': [{ sectid: 1662165, name: '피규어/프라모델', sectGrpSeq: '214', shopAttrCd: 'S', prdDispYn: 'Y' }],
    '/bff/supplier/me/md': { list: [{ mdId: '83005', mdNm: '출산/발육/완구/악기' }] },
    '/bff/product/codes/employees/by-md/83005': [{ empNo: '00512031', empNm: '담당자' }],
  };
  window.fetch = async (url: any) => {
    const target = String(url);
    if (target.startsWith('/bff/product/suppliers/products/codes/exists')) {
      const code = new URL(target, 'https://partners.gsshop.com').searchParams.get('supPrdCd');
      return { ok: true, status: 200, json: async () => code === duplicateCode };
    }
    if (!(target in bff)) return { ok: false, status: 404, json: async () => null };
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(bff[target])) };
  };
  return { window, document, schemas, get, log, nativeAlert, nativeConfirm };
}

async function runGsshopFill(page: any, payloadOverrides: Record<string, unknown> = {}): Promise<any> {
  for (const source of [guardSource, fillSource, gsshopSource.replace(/\bimport\(/g, '__importModule(')]) page.window.eval(source);
  const fill = page.window.__kiditemPageCalls['gsshop.fill'];
  // 몰 화면의 기다림을 가짜 시계로 바로 지나가게 한다 — 창의 Date도 가짜 시계를 쓴다.
  return withFakeClock(() => fill({
    form: gsshopForm(),
    images: [
      { name: 'gsshop0', dataUrl: 'data:image/jpeg;base64,AAEC', fileName: 'rep.jpg' },
      { name: 'gsshop1', dataUrl: 'data:image/png;base64,AAEC', fileName: 'extra1' },
    ],
    maxImages: 8,
    formWaitMs: 300,
    stepWaitMs: 1500,
    detailImage: { name: 'detail', dataUrl: 'data:image/jpeg;base64,AAEC', fileName: 'wing-server-jpeg-v1-780.jpg' },
    detailHtml: '',
    ...payloadOverrides,
  }), () => {
    page.window.Date = Date;
  });
}

it('⭐ 화면의 처리 함수를 순서대로 불러 저장소에 값이 들어간다 — 저장은 부르지 않는다', async () => {
  const page = makeGsshopPage();
  const outcome = await runGsshopFill(page);

  assert.equal(outcome.ok, true, JSON.stringify(outcome));
  assert.equal(outcome.submitted, false);
  const { get } = page;
  assert.equal(get('base.prdClsCd'), 'B35012701');
  assert.equal(get('shop.ctgrShops')[0].sectid, '1662165');
  assert.equal(get('base.supPrdCd'), 'KIDB3FAB6AF07B5');
  assert.equal(get('base.operMdId'), '83005');
  assert.equal(get('base.repMdUserId'), '00512031');
  assert.equal(get('base.exposPrdNm'), '땅콩 말랑 키링 (1p) 열쇠고리 가꾸 백참 키보드 키홀더 가방 장식 악세사리');
  assert.equal(get('base.prdNm'), '땅콩 말랑 키링 (1p) 열쇠고리');
  assert.equal(get('base.brandCd'), 244211);
  assert.equal(get('custom.goodsDesc'), '땅콩 말랑 키링');
  assert.equal(get('price.salePrc'), '830');
  assert.equal(get('price.fee'), 664);
  assert.equal(get('delivery.dlvsCoCd'), 'DH');
  assert.equal(get('delivery.rfnTypCd'), '10');
  assert.equal(get('custom.ordPsblQty'), '999');
  assert.equal(get('safeCertification.safeCertTgtYn'), 'N');
  assert.ok((outcome.steps as string[]).includes('판매가 830 · 수수료율 20% · 공급가 664'), JSON.stringify(outcome.steps));
  assert.ok((outcome.steps as string[]).includes('저장 전 필수 칸 확인'), JSON.stringify(outcome));
  assert.equal(page.log.saved, false);
});

it('⭐ 안내창이 닫혀야 끝나는 처리 함수도 멈추지 않는다 — 안내는 치우고 사람에게 넘긴다', async () => {
  const page = makeGsshopPage();
  const outcome = await runGsshopFill(page);

  assert.equal(page.document.querySelectorAll('[role="dialog"]').length, 0);
  assert.ok((outcome.warnings as string[]).includes('몰 안내: 반품접수 시점으로 부터 6영업일 이후 자동 환불 처리 됩니다.'), JSON.stringify(outcome.warnings));
  // 몰의 알림은 알림 창 가드가 받는다(진짜 창은 탭을 운영자에게 넘길 때 돌아온다).
  assert.equal(page.window.__kiditemDialogGuard, true);
});

it('정보고시는 고칠 수 있는 항목만 채운다 — A/S 는 GS 고정 문구 그대로', async () => {
  const page = makeGsshopPage();
  await runGsshopFill(page);

  assert.deepEqual(
    page.get('custom.govPublsListG').map((item: any) => `${item.prdExplnItmCd}=${item.prdExplnCntnt}`),
    ['43026=1200땅콩말랑키링', '43141=해당없음', '43142=중국', '43004=해피프랜즈', '43143=GSSHOP 고객센터 080-414-4545'],
  );
});

it('상품 이미지는 칸 번호(1 = 대표)로 사진 칸 처리 함수에 넣고, 못 올린 칸은 알린다', async () => {
  const page = makeGsshopPage({ failImageSeq: 2 });
  const outcome = await runGsshopFill(page);

  // 확장자 없는 이름은 형식에 맞춰 붙인다 — 화면이 확장자로 거른다.
  assert.deepEqual(page.log.imageUploads, [{ seq: 1, name: 'rep.jpg' }, { seq: 2, name: 'image2.png' }]);
  assert.ok((outcome.steps as string[]).includes('상품 이미지 1장'), JSON.stringify(outcome.steps));
  assert.ok((outcome.warnings as string[]).includes('추가1 이미지를 올리지 못했습니다: 이미지 업로드에 실패했습니다.'), JSON.stringify(outcome.warnings));
});

it('⭐ 기술서 사진은 편집기 임시 업로드로 올려 data-uploaded-path 와 함께 넣는다', async () => {
  const page = makeGsshopPage();
  await runGsshopFill(page);

  assert.deepEqual(page.log.tempUploads, [{ keepName: 'false', names: ['wing-server-jpeg-v1-780.jpg'] }]);
  assert.equal(
    page.log.detail,
    '<center><img src="https://image.gsshop.com/temp/detail.jpg" data-uploaded-path="https://image.gsshop.com/temp/detail.jpg"></center>',
  );
  assert.equal(page.get('custom.documentDesc'), page.log.detail);
});

it('기술서 업로드가 실패하면 이미 읽히는 주소로 넣고, 그것도 없으면 말한다', async () => {
  const failing = makeGsshopPage({ failDetailUpload: true });
  const withFallback = await runGsshopFill(failing, { detailHtml: '<center><img src="https://kiditem.diskn.com/abc"></center>' });
  assert.ok((withFallback.warnings as string[]).some((w) => w.includes('기술서 사진을 GS에 올리지 못했습니다')));
  assert.equal(failing.log.detail, '<center><img src="https://kiditem.diskn.com/abc"></center>');

  const empty = makeGsshopPage({ failDetailUpload: true });
  const withoutFallback = await runGsshopFill(empty);
  assert.ok((withoutFallback.warnings as string[]).some((w) => w.includes('기술서에 넣을 사진을 만들지 못했습니다')));
  assert.equal(empty.log.detail, '');
});

it('이미 쓰인 협력사 상품코드·목록에 없는 분류는 경고한다', async () => {
  const duplicate = makeGsshopPage({ duplicateCode: 'KIDB3FAB6AF07B5' });
  const outcome = await runGsshopFill(duplicate);
  assert.ok((outcome.warnings as string[]).some((w) => w.includes('이미 쓰였습니다')), JSON.stringify(outcome.warnings));

  const missing = makeGsshopPage({ leafMissing: true });
  const noLeaf = await runGsshopFill(missing);
  assert.ok((noLeaf.warnings as string[]).some((w) => w.startsWith('상품분류 B35012701를 고르지 못했습니다')), JSON.stringify(noLeaf.warnings));
  assert.ok((noLeaf.warnings as string[]).some((w) => w.startsWith('저장 전 확인:') && w.includes('상품분류')), JSON.stringify(noLeaf.warnings));
});

it('사진이 없으면 저장 전 확인에 대표 이미지를 올린다', async () => {
  const page = makeGsshopPage();
  const outcome = await runGsshopFill(page, { images: [] });
  assert.ok((outcome.warnings as string[]).includes('저장 전 확인: 대표 이미지'), JSON.stringify(outcome.warnings));
});

it('⭐ 수정·복사 화면이면 아무것도 넣지 않는다', async () => {
  const page = makeGsshopPage({ mode: 'update' });
  const outcome = await runGsshopFill(page);
  assert.equal(outcome.ok, false);
  assert.match(outcome.error, /수정 화면/);
  assert.equal(page.get('base.prdClsCd'), undefined);
});

it('로그인 화면이면 폼이 없다고 돌려준다', async () => {
  const page = makeGsshopPage({ loginPage: true });
  const outcome = await runGsshopFill(page);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.noForm, true);
});

it('페이지 처리기는 저장·임시저장을 부르지 않는다(KID-237 잠금)', () => {
  assert.ok(!/\.save\(|imsiSave|saveProc|checkBeforeSave\(/.test(gsshopSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
});
});
