import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

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

/** 다른 realm(vm·jsdom)에서 온 값을 이 realm 값으로 옮긴다. */
const plain = (value) => JSON.parse(JSON.stringify(value));

function loadModule() {
  const context = {
    self: {}, console, URL, URLSearchParams, TextDecoder, TextEncoder,
    FormData, Blob, File, Promise, Date, setTimeout, clearTimeout,
    FileReader: FakeFileReader,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
  return context.self.KidItemMallFormRegister;
}

/**
 * 롯데ON 판매자센터 상품등록(`store.lotteon.com/cm/main/index_SO.wsp` → 상품등록 탭).
 *
 * 실측 2026-09-14. 기존 등록물 `LO2752728442` 의 상품 JSON 을 읽고, 새 등록 탭을 열어 이 페이지 함수를 저장·사진
 * 업로드 없이 돌렸다 — 분류·상품명·가격·고시·원산지·상세설명·A/S·구매수량·배송이 화면 데이터에 들어가고, 화면
 * 검사(`scwin.product.validation`)가 사진 한 칸만 남겼다. 아래 가짜 화면의 섹션·함수·데이터 이름은 그 화면 것이다.
 */

const lotteonForm = (overrides = {}) => ({
  category: 'BC55031100',
  productName: '킬러볼 스피너 키링 (1p) 스핀 장난감 열쇠고리',
  salePrice: 2280,
  stockManaged: false,
  stock: 999,
  modelNo: '10481-1',
  maker: '해피프랜즈',
  origin: { typeCode: 'OVS', code: 'CN' },
  notice: {
    groupCode: '38',
    values: {
      '0210': '3500킬러볼스피너키링', '0211': '10481-1', '1400': '해당없음',
      '0070': '해피프랜즈', '0071': '해피프랜즈', '1440': '031-908-5401',
    },
  },
  delivery: {
    costPolicy: '406468', extraCostPolicy: '3108763', shipPlace: 'PLO383047', returnPlace: 'PLO383047',
    courier: '0002', returnCourier: '0002', sameDay: true, closeTime: '1300', saturday: 'N', retrieveType: 'DGNN_RTRV',
  },
  purchase: { maxQty: 9999, periodDays: 1 },
  asText: '7일이내 교환, 반품 가능합니다.',
  sellerCode: '',
  ...overrides,
});

const form = (overrides = {}) => ({
  url: 'https://store.lotteon.com/cm/main/index_SO.wsp',
  imageGroups: { lotteon: ['https://image1.coupangcdn.com/rep.jpg', 'https://image1.coupangcdn.com/extra1.jpg'] },
  detailUploads: [{ url: 'https://kiditem.diskn.com/S8brNL1Xs4' }],
  manualSteps: [],
  lotteon: lotteonForm(),
  ...overrides,
});

function harness() {
  const module = loadModule();
  const calls = [];
  const api = module.create({
    chrome: {
      scripting: {
        executeScript: async (options) => {
          calls.push(options);
          return [{ result: { ok: true, steps: [], warnings: [] } }];
        },
      },
    },
    fetch: async () => ({ ok: true, status: 200, blob: async () => new Blob([new Uint8Array([1, 2])], { type: 'image/jpeg' }) }),
    interactiveTabs: { createTab: async () => ({ id: 9 }) },
    tabReason: 'test',
  });
  return { api, calls };
}

test('판매자센터 주소 하나만 받는다 — 로그인·다른 화면·다른 도메인에는 채우지 않는다', async () => {
  const { api, calls } = harness();
  for (const url of [
    'https://store.lotteon.com/cm/main/index_SO.wsp?newWin=true',
    'https://store.lotteon.com/cm/main/login_SO.wsp',
    'https://store.lotteon.com/cm/main/index_SO.wsp/extra',
    'https://www.lotteon.com/cm/main/index_SO.wsp',
  ]) {
    await assert.rejects(() => api.register({ mall: 'lotteon', form: form({ url }) }), /상품등록 주소가 아닙니다/, url);
  }
  assert.equal(calls.length, 0, '거절한 주소로는 탭도 주입도 하지 않는다');
});

test('표준카테고리·상품명·판매가가 없거나 모양이 틀리면 채우러 가지 않는다', async () => {
  const { api } = harness();
  const reject = (lotteon, pattern) => assert.rejects(() => api.register({ mall: 'lotteon', form: form({ lotteon }) }), pattern);
  await reject(lotteonForm({ category: '피젯토이' }), /표준카테고리/);
  await reject(lotteonForm({ category: 'B35012701' }), /표준카테고리/);
  await reject(lotteonForm({ productName: ' ' }), /판매자상품명/);
  await reject(lotteonForm({ salePrice: 0 }), /판매가/);
  await reject(undefined, /롯데ON 폼 데이터/);
});

test('⭐ 화면처럼 UTF-8 바이트(한글 3)로 상품명 150 을 넘기지 않고, 화면이 막는 모델명은 비운다', async () => {
  const { api, calls } = harness();
  await api.register({
    mall: 'lotteon',
    form: form({
      lotteon: lotteonForm({
        category: 'bc55031100',
        productName: `${'가'.repeat(60)} <키링>`,
        modelNo: '킬러볼-1',
        origin: { typeCode: 'DMST', code: 'CN' },
        purchase: { maxQty: 9999, periodDays: 90 },
        delivery: { ...lotteonForm().delivery, closeTime: '2560', retrieveType: 'drop table' },
      }),
    }),
  });
  const [{ form: values }] = calls[0].args;
  assert.equal(values.category, 'BC55031100');
  assert.ok(new TextEncoder().encode(values.productName).length <= 150, values.productName);
  assert.ok(!/[<>]/.test(values.productName));
  assert.equal(values.modelNo, '');
  assert.deepEqual(plain(values.origin), { typeCode: 'DMST', code: 'KR' });
  assert.equal(values.purchase.periodDays, 1, '구매 제한 기간은 화면이 받는 1~31일만');
  assert.equal(values.delivery.closeTime, '');
  assert.equal(values.delivery.retrieveType, '');
});

test('⭐ 전용 페이지 함수에 값 묶음·사진·상세 이미지(편집기 업로드용 파일)를 MAIN 월드로 넘긴다', async () => {
  const { api, calls } = harness();
  const result = await api.register({
    mall: 'lotteon',
    form: form({ detailUploads: [{ url: 'http://localhost:9000/kiditem/detail-page-images/o/r/wing-server-jpeg-v1-780.jpg' }] }),
  });
  assert.equal(result.submitted, false);
  const [options] = calls;
  assert.equal(options.func.name, 'fillLotteonProductForm');
  assert.equal(options.world, 'MAIN');
  const [payload] = options.args;
  assert.equal(payload.form.category, 'BC55031100');
  assert.equal(payload.maxImages, 10);
  assert.equal(payload.images.length, 2);
  assert.match(payload.images[0].dataUrl, /^data:image\/jpeg;base64,/);
  // 로컬 렌더 산출물이라도 남의 호스팅에 올리지 않는다 — 편집기 업로드가 롯데ON 에 넣는다.
  assert.match(payload.detailImage.dataUrl, /^data:image\/jpeg;base64,/);
  assert.equal(payload.detailImage.fileName, 'wing-server-jpeg-v1-780.jpg');
  assert.equal(payload.detailHtml, '');
});

test('이미 읽히는 상세 주소(디스크엔)는 편집기 업로드가 막힐 때 쓸 HTML 로도 넘긴다', async () => {
  const { api, calls } = harness();
  await api.register({ mall: 'lotteon', form: form() });
  const [payload] = calls[0].args;
  assert.match(payload.detailImage.dataUrl, /^data:image\/jpeg;base64,/);
  assert.equal(payload.detailHtml, '<center><img referrerpolicy="no-referrer" src="https://kiditem.diskn.com/S8brNL1Xs4"></center>');
});

// ── 페이지 함수 ────────────────────────────────────────────────────────────────

function valueComponent(initial = '', { options = null, onSet = null } = {}) {
  let current = initial;
  const userData = {};
  return {
    getValue: () => current,
    setValue(next) {
      if (options && !options.includes(String(next))) return;
      current = next;
      onSet?.(next);
    },
    getUserData: (key) => userData[key],
    setUserData: (key, entry) => { userData[key] = entry; },
  };
}

function dataMap(initial = {}) {
  const values = { ...initial };
  return {
    get: (key) => (key in values ? values[key] : ''),
    set: (key, entry) => { values[key] = entry; },
    getJSON: () => ({ ...values }),
  };
}

function dataList(initial = []) {
  let rows = initial.map((row) => ({ ...row }));
  return {
    getRowCount: () => rows.length,
    getRowJSON: (index) => (rows[index] ? { ...rows[index] } : null),
    getCellData: (index, key) => rows[index]?.[key] ?? '',
    setCellData: (index, key, entry) => { if (rows[index]) rows[index][key] = entry; },
    getMatchedJSON: (key, entry) => rows.filter((row) => row[key] === entry).map((row) => ({ ...row })),
    getFilteredColData: (key) => rows.map((row) => row[key]),
    getAllJSON: () => rows.map((row) => ({ ...row })),
    setJSON: (next) => { rows = next.map((row) => ({ ...row })); },
  };
}

/**
 * 롯데ON 판매자센터 껍데기와 상품등록 탭을 흉내 낸다. 섹션(`wfm_*`)마다 `com` 이 따로 있고, 그 알림은 실제처럼
 * DOM 대화상자를 만든다 — 페이지 함수가 가로채지 못하면 테스트에 흔적이 남는다.
 */
function makeLotteonPage({
  loginPage = false,
  tabCount = 1,
  categoryAlert = null,
  kcCategory = false,
  missingPolicy = false,
  lateReset = false,
  confirmDialog = false,
  failUploadIndex = null,
  noThumbnail = false,
  xmlUpload = false,
  failEditorUpload = false,
} = {}) {
  const dom = new JSDOM(loginPage ? '<input type="password">' : '<body><div class="w2tabcontrol_contents"></div></body>', {
    url: loginPage ? 'https://store.lotteon.com/cm/main/login_SO.wsp' : 'https://store.lotteon.com/cm/main/index_SO.wsp',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const { document } = window;
  window.Element.prototype.getClientRects = function getClientRects() {
    return this.isConnected ? [{}] : [];
  };
  window.scrollTo = () => {};
  const nativeAlert = () => { throw new Error('native alert'); };
  const nativeConfirm = () => { throw new Error('native confirm'); };
  window.alert = nativeAlert;
  window.confirm = nativeConfirm;

  const log = {
    openedTabs: [], saved: false, tempSaved: false, validations: 0, uploads: [], ticketAuth: null,
    popupCallbacks: [], unpatchedAlerts: [], confirmedOk: false, cancelled: false, editorUploads: [],
  };

  // 실제 `com.messagBox` 처럼 탭 작업 영역에 대화상자를 붙인다.
  const makeCom = () => ({
    alert(message) {
      log.unpatchedAlerts.push(String(message));
      const node = document.createElement('div');
      node.className = 'dialog-block';
      node.innerHTML = `<div class="dialog-block-content"><p>${message}</p><div class="dialog-block-buttons"><input type="button" class="w2trigger btn_cm sm point3" value="확인"></div></div>`;
      document.body.append(node);
    },
    confirm(message) { this.alert(message); },
  });

  const blobs = new Map();
  let blobCount = 0;
  window.URL.createObjectURL = (blob) => {
    blobCount += 1;
    const url = `blob:lotteon/${blobCount}`;
    blobs.set(url, blob);
    return url;
  };
  window.URL.revokeObjectURL = () => {};
  // jsdom 은 그림을 풀지 않는다. png 는 작은 사진(400px), 나머지는 1000px 로 본다.
  window.Image = class FakeImage {
    set src(url) {
      this.current = url;
      const blob = blobs.get(url);
      setTimeout(() => {
        if (!blob) { this.onerror?.(); return; }
        const size = blob.type === 'image/png' ? 400 : 1000;
        this.naturalWidth = size;
        this.naturalHeight = size;
        this.onload?.();
      }, 5);
    }

    get src() { return this.current; }
  };

  window.gcm = {
    user: { getTrNo: () => 'LO10014931' },
    API_GW: 'https://soapi.lotteon.com',
    getAuthToken: () => 'test-token',
    getTimezone: () => 'GMT+09:00',
  };
  window.WebSquare = {
    util: {
      getStringByteSize: (text) => new TextEncoder().encode(String(text)).length,
      getChildren: (group) => group.children,
    },
  };

  // 편집기(CKEditor 4). 사진을 끌어다 놓으면 `uploadRepository` 가 `/websquare/imageupload.wq` 에 올리고,
  // 롯데ON 은 올린 사진을 이미지 데이터(data URL)로 돌려준다(실측).
  window.CKEDITOR = {
    instances: {},
    fileTools: {
      getUploadUrl: () => '/websquare/imageupload.wq?callbackFunction=edt_dscrp.callback&subDir=&responseType=json',
    },
  };
  const makeEditor = (id) => {
    window.CKEDITOR.instances[`${id}_`] = {
      name: `${id}_`,
      config: {},
      uploadRepository: {
        create(file) {
          const loader = {
            status: 'created',
            url: '',
            message: '',
            loadAndUpload(uploadUrl) {
              log.editorUploads.push({ name: file.name, type: file.type, uploadUrl });
              loader.status = 'uploading';
              setTimeout(() => {
                if (failEditorUpload) {
                  loader.status = 'error';
                  loader.message = '파일 크기가 너무 큽니다.';
                  return;
                }
                loader.status = 'uploaded';
                loader.url = 'data:image/jpeg;base64,UPLOADEDDETAIL';
              }, 30);
            },
          };
          return loader;
        },
      },
    };
  };

  // 롯데ON 파일 업로드는 `Accept: application/json` 이 없으면 XML 로 답한다(실측).
  const uploadAnswer = (json, accept) => {
    if (accept === 'application/json' && !xmlUpload) return { ok: true, status: 200, text: async () => JSON.stringify(json) };
    const meta = json.meta ? `<meta><fileId>${json.meta.fileId}</fileId><fileName>${json.meta.fileName}</fileName><size>${json.meta.size}</size></meta>` : '';
    return {
      ok: true,
      status: 200,
      text: async () => `<?xml version="1.0" encoding="UTF-8"?><FineUploaderResponseModel><success>${json.success}</success>${meta}${json.message ? `<message>${json.message}</message>` : ''}</FineUploaderResponseModel>`,
    };
  };
  let uploadCount = 0;
  window.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes('/soapi/v1/product/registration/createProductImagesFileUploadTicket')) {
      log.ticketAuth = options.headers?.Authorization || null;
      log.ticketUrl = target;
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: { ticket: 'TICKET1' } }) };
    }
    if (target === 'https://soapi.lotteon.com/soapi/v1/bocommon/o/fileManage/upload4FineUploader/TICKET1') {
      const body = options.body;
      const index = uploadCount;
      uploadCount += 1;
      log.uploads.push({
        fileName: body.get('fileName'), hasFile: Boolean(body.get('file')), auth: options.headers?.Authorization, accept: options.headers?.Accept,
      });
      if (index === failUploadIndex) return uploadAnswer({ success: false, message: '용량을 초과했습니다.' }, options.headers?.Accept);
      return uploadAnswer({ success: true, meta: { fileId: `F${index + 1}`, fileName: body.get('fileName'), size: 2048 } }, options.headers?.Accept);
    }
    return { ok: false, status: 404, text: async () => '{}' };
  };

  let pi = null;
  const tac = {
    getTabCount: () => tabCount,
    getWindow: (id) => (pi && id === pi.tabId ? pi : null),
  };

  function buildInsertTab(tabId) {
    const basic = dataMap({ trNo: 'LO10014931', trGrpCd: 'SR', scatNo: '', scatNm: '', dcatNoLst: '', slfee: '' });
    const product = dataMap({ oplcTypCd: 'DMST', oplcCd: 'KR', spdNm: '', pdNm: '', mfcrNm: '', mdlNo: '' });
    const saleOption = dataMap({ stkMgtYn: 'Y', maxPurLmtTypCd: 'N', maxPurQty: 1, maxPurLmtPrd: 1 });
    const manageNo = dataMap({ epdNo: '' });
    const output = dataMap({ dvCstPolNo: '3544109', adtnDvCstPolNo: '', owhpNo: 'PLO383047', hdcCd: '0002', sndBgtNday: 3 });
    const returns = dataMap({ rtrpNo: 'PLO383047', rtngHdcCd: '0002', rtrvTypCd: 'ENTP_RTRV' });
    const grid = dataList([]);
    const itemImages = dataList([]);
    const section = (extra) => ({ com: makeCom(), ...extra });

    const categoryScwin = {
      rntlCatYn: 'N', ecpnTraderYn: 'N', mblTraderYn: 'N', pprTraderYn: 'N', zeroPdTypCdCategoryYn: 'N',
      getStdMappingInfo: () => false,
      categoryCallback(data) {
        if (categoryAlert) {
          sections.wfm_category.com.alert(categoryAlert);
          return;
        }
        basic.set('scatNo', data.scatNo);
        basic.set('scatNm', '장난감/완구>작동완구>피젯토이');
        basic.set('dcatNoLst', 'FC03040311');
        grid.setJSON([{ sitmNm: '단일상품', slPrc: '', stkQty: '', slfee: '', imageSrc: '' }]);
        // 수수료는 따로 조회해서 조금 늦게 붙는다.
        setTimeout(() => { basic.set('slfee', 13); grid.setCellData(0, 'slfee', 13); }, 20);
        if (kcCategory) {
          sections.wfm_saftyAthn.rad_isChildSftyAthn.setValue('Y');
          sections.wfm_category.com.alert('어린이제품 KC 인증 대상 카테고리입니다.');
        }
      },
    };

    const noticeRows = [
      { pdItmsArtlCd: '0210', artlRefcNo: '21' },
      { pdItmsArtlCd: '1400', artlRefcNo: '140' },
      { pdItmsArtlCd: '1420', artlRefcNo: '142' },
      { pdItmsArtlCd: '0070', artlRefcNo: '7' },
      { pdItmsArtlCd: '1440', artlRefcNo: '144' },
    ];
    const noticeInput = (code, options = {}) => {
      const input = valueComponent('', options);
      input.setUserData('userData1', code);
      return input;
    };
    const originType = valueComponent('', { options: ['DMST', 'OVS', 'ETC'] });
    const groups = {
      grp_item21: { children: [noticeInput('0210'), noticeInput('0211'), valueComponent('')] },
      grp_item140: { children: [noticeInput('1400')] },
      grp_item142: { children: [originType, noticeInput('1420')] },
      grp_item7: { children: [noticeInput('0070', { onSet: (entry) => product.set('mfcrNm', entry) }), noticeInput('0071')] },
      grp_item144: { children: [noticeInput('1440')] },
    };
    const noticeList = dataList([]);
    const articleScwin = {
      rad_pdItmsRegWay_onchange() {},
      sbx_pdItmsCd_onchange() { articleScwin.setItemDisplay(this.getValue()); },
      setItemDisplay() {
        setTimeout(() => {
          noticeList.setJSON(noticeRows);
          articleScwin.setItemDisplay1();
        }, 20);
      },
      setItemDisplay1() {
        // 실제 화면: 항목을 새로 그리며 칸을 비운다(제조자 칸은 제조사 데이터와 묶여 있다).
        for (const group of Object.values(groups)) for (const input of group.children) input.setValue('');
        product.set('mfcrNm', '');
      },
      sbx_oplcTypCd3_onviewchange() {},
      acb_oplcCd3_onviewchange() {},
      getPdItmsArtlInfo() {
        const out = [];
        for (const row of noticeList.getAllJSON()) {
          const inputs = groups[`grp_item${row.artlRefcNo}`].children.filter((input) => input.getUserData('userData1'));
          const values = inputs.map((input) => input.getValue());
          out.push({ pdItmsCd: '38', pdArtlCd: row.pdItmsArtlCd, pdArtlCnts: values.join('//') });
        }
        return out;
      },
    };

    const deliveryOptions = (list) => ({ options: list });
    let resetDone = false;
    const sections = {
      wfm_category: section({ scwin: categoryScwin }),
      wfm_title: section({
        dat_productInfo: product,
        tbx_spdNmLength: valueComponent(''),
        scwin: { ibx_pdNm_onchange() { grid.setCellData(0, 'pdNm', product.get('pdNm')); } },
      }),
      wfm_option: section({
        dat_saleOptionGrid: grid,
        data_itemImageList: itemImages,
        rad_slOptYn: valueComponent('N'),
        rad_stkMgtYn: valueComponent('Y', { onSet: (entry) => saleOption.set('stkMgtYn', entry) }),
        scwin: {
          tempBlobImageRow: null,
          rad_slOptYn_onviewchange() {},
          rad_stkMgtYn_onchange() {
            grid.setCellData(0, 'stkQty', this.getValue() === 'N' ? 999999999 : '');
          },
          popupCallbackInProductReg(data) {
            log.popupCallbacks.push(JSON.parse(JSON.stringify(data)));
            itemImages.setJSON(data.ret.map((entry) => ({
              row: data.param.row, fileId: entry.fileId, imgSeq: entry.imgSeq, epsrTypCd: entry.epsrTypCd,
              epsrTypDtlCd: entry.epsrTypDtlCd, imgFileNm: entry.origFileNm, rprtImgYn: entry.rprtImgYn,
            })));
            if (!noThumbnail) {
              setTimeout(() => grid.setCellData(sections.wfm_option.scwin.tempBlobImageRow, 'imageSrc', 'data:image/jpeg;base64,THUMB'), 20);
            }
          },
        },
      }),
      wfm_article: section({
        rad_pdItmsRegWay: valueComponent('NEW'),
        sbx_pdItmsCd: null,
        sbx_oplcTypCd3: originType,
        data_pdArtlCdList: noticeList,
        $p: { getComponentById: (id) => groups[id] || null },
        scwin: articleScwin,
      }),
      wfm_info: section({
        dat_productInfo: product,
        ibx_mfcrNm: valueComponent('', { onSet: (entry) => product.set('mfcrNm', entry) }),
        scwin: {
          acb_oplcCd_onchange() {
            product.set('oplcTypCd', product.get('oplcCd') === 'KR' ? 'DMST' : 'OVS');
          },
        },
      }),
      wfm_etc: section({ ibx_mdlNo: valueComponent('', { onSet: (entry) => product.set('mdlNo', entry) }) }),
      wfm_saftyAthn: section({
        rad_isSftyAthn: valueComponent('N'),
        rad_isChildSftyAthn: valueComponent('N'),
        rad_isChemSftyAthn: valueComponent('N'),
      }),
      wfm_desc: section({
        edt_dscrp: (() => {
          const id = `mf_tac_layout_contents_${tabId}_body_wfm_desc_edt_dscrp`;
          makeEditor(id);
          let html = '';
          // 실제 편집기처럼 닫는 `/>` 로 고쳐 돌려준다.
          return { id, setHTML: (next) => { html = next.replace(/"><\/center>$/, '" /></center>'); }, getHTML: () => html };
        })(),
        scwin: { edt_dscrp_onchange() {} },
      }),
      wfm_as: section({
        edt_asCnts: (() => { let html = ''; return { setHTML: (next) => { html = next; }, getHTML: () => html }; })(),
        scwin: { edt_asCnts_onchange() {} },
      }),
      wfm_buyService: section({
        rad_maxPurLmtTypCd: valueComponent('N', { onSet: (entry) => saleOption.set('maxPurLmtTypCd', entry) }),
        ibx_maxPurQty: valueComponent('', { onSet: (entry) => saleOption.set('maxPurQty', Number(entry)) }),
        ibx_maxPurLmtPrd: valueComponent('', { onSet: (entry) => saleOption.set('maxPurLmtPrd', Number(entry)) }),
        scwin: { rad_maxPurLmtTypCd_onchange() { saleOption.set('itmByMaxPurPsbQtyYn', 'Y'); } },
      }),
      wfm_manageNo: section({
        ibx_epdNo: valueComponent('', { onSet: (entry) => manageNo.set('epdNo', entry) }),
        scwin: { setTitle() {} },
      }),
      wfm_delivery: section({
        dat_output: output,
        dat_returnInfo: returns,
        sbx_nldySndCloseTm: valueComponent('1300', deliveryOptions(['0600', '1200', '1300', '1400'])),
        rad_satSndPsbYn: valueComponent('N', deliveryOptions(['Y', 'N'])),
        sbx_dvCstPolNo: valueComponent('3544109', {
          options: missingPolicy ? ['', '3965588', '3544109'] : ['', '3965588', '406468', '3544109'],
          onSet: (entry) => {
            output.set('dvCstPolNo', entry);
            if (lateReset && !resetDone && entry === '406468') {
              resetDone = true;
              // 늦게 끝난 거래처 조회가 대표 정책으로 되돌린다.
              setTimeout(() => { sections.wfm_delivery.sbx_dvCstPolNo.setValue('3544109'); }, 30);
            }
          },
        }),
        sbx_adtnDvCstPolNo: valueComponent('', { options: ['', '3108763'], onSet: (entry) => output.set('adtnDvCstPolNo', entry) }),
        sbx_owhpNo: valueComponent('PLO383047', { options: ['', 'PLO383047'], onSet: (entry) => output.set('owhpNo', entry) }),
        sbx_rtrpNo: valueComponent('PLO383047', { options: ['', 'PLO383047'] }),
        sbx_hdcCd: valueComponent('0002', { options: ['0002'], onSet: (entry) => output.set('hdcCd', entry) }),
        sbx_rtngHdcCd: valueComponent('0002', { options: ['0002'], onSet: (entry) => returns.set('rtngHdcCd', entry) }),
        rad_rtrvTypCd: valueComponent('ENTP_RTRV', { options: ['ENTP_RTRV', 'DGNN_RTRV'], onSet: (entry) => returns.set('rtrvTypCd', entry) }),
        scwin: {
          dvCstPolList: [{ dvCstPolNo: '406468' }, { dvCstPolNo: '3544109' }],
          owhpList: [{ dvpNo: 'PLO383047' }],
          todaySndBgt() { output.set('sndBgtNday', 0); },
        },
      }),
    };
    // 실제 화면처럼 선택상자에 값을 넣으면 onchange 가 돈다.
    sections.wfm_article.sbx_pdItmsCd = valueComponent('', {
      onSet() { articleScwin.sbx_pdItmsCd_onchange.call(sections.wfm_article.sbx_pdItmsCd); },
    });

    const scope = {
      tabId,
      com: makeCom(),
      dat_basicInfo: basic,
      dat_productInfo: product,
      dat_saleOption: saleOption,
      dat_manageNo: manageNo,
      dat_saleOptionGrid: grid,
      data_itemImageList: itemImages,
      scwin: {
        isPause: false,
        traderData: null,
        pdNmEstlKwdCnts: '',
        product: {
          tp: 'category',
          data: { pdTypCd: 'GNRL_GNRL' },
          validation() {
            log.validations += 1;
            if (!grid.getCellData(0, 'imageSrc')) {
              sections.wfm_option.com.alert('이미지는  필수 입력 항목 입니다.');
              return false;
            }
            if (articleScwin.getPdItmsArtlInfo().some((item) => !item.pdArtlCnts || /\/\/$|^\/\//.test(item.pdArtlCnts))) {
              sections.wfm_article.com.alert('품목정보제공고시를 입력해주세요');
              return false;
            }
            return true;
          },
          regist() { log.saved = true; },
        },
        select_standard_category(code) {
          setTimeout(() => sections.wfm_category.scwin.categoryCallback({ scatNo: code }), 20);
        },
        btn_regist_onclick() { log.saved = true; },
        btn_saveTemp_onclick() { log.tempSaved = true; },
      },
    };
    for (const [name, sectionWindow] of Object.entries(sections)) {
      scope[name] = { getWindow: () => sectionWindow };
    }
    // 공통코드 → 초기화 → 거래처 조회가 차례로 끝난다.
    setTimeout(() => { scope.scwin.isPause = true; }, 20);
    setTimeout(() => { scope.scwin.traderData = { trNo: 'LO10014931' }; }, 40);
    return { scope, sections, basic, product, saleOption, manageNo, output, returns, grid, itemImages, groups };
  }

  let tab = null;
  window.com = {
    ...makeCom(),
    getHighestOpener: () => ({ $p: { getComponentById: (id) => (id === 'tac_layout' ? tac : null) } }),
    openTab(label, screen, param, tabId) {
      log.openedTabs.push({ label, screen, param, tabId });
      setTimeout(() => {
        tab = buildInsertTab(tabId);
        pi = tab.scope;
        if (confirmDialog) {
          const node = document.createElement('div');
          node.className = 'dialog-block';
          node.innerHTML = '<div class="dialog-block-content"><p>작성 중인 상품이 있습니다. 불러오시겠습니까?</p><div class="dialog-block-buttons"><input type="button" class="w2trigger btn_cm sm" value="취소"><input type="button" class="w2trigger btn_cm sm point3" value="확인"></div></div>';
          const [cancel, ok] = node.querySelectorAll('input');
          cancel.addEventListener('click', () => { log.cancelled = true; });
          ok.addEventListener('click', () => { log.confirmedOk = true; });
          document.body.append(node);
        }
      }, 20);
    },
  };
  return { window, document, log, nativeAlert, nativeConfirm, get tab() { return tab; } };
}

async function runLotteonFill(page, payloadOverrides = {}) {
  const { pageFunctions } = loadModule();
  const fill = page.window.eval(`(${pageFunctions.fillLotteonProductForm.toString()})`);
  return fill({
    form: lotteonForm(),
    images: [
      { name: 'lotteon0', dataUrl: 'data:image/jpeg;base64,AAEC', fileName: 'rep.jpg' },
      { name: 'lotteon1', dataUrl: 'data:image/jpeg;base64,AAED', fileName: 'extra1' },
    ],
    maxImages: 10,
    formWaitMs: 1500,
    stepWaitMs: 400,
    detailImage: { name: 'detail', dataUrl: 'data:image/jpeg;base64,DETAIL', fileName: 'wing-server-jpeg-v1-780.jpg' },
    detailHtml: '',
    ...payloadOverrides,
  });
}

test('⭐ 상품등록 탭을 열어 섹션 함수를 순서대로 부르고 화면 데이터에 값이 들어간다 — 저장은 부르지 않는다', async () => {
  const page = makeLotteonPage();
  const outcome = await runLotteonFill(page);

  assert.equal(outcome.ok, true, JSON.stringify(outcome));
  assert.equal(outcome.submitted, false);
  const [opened] = page.log.openedTabs;
  assert.equal(opened.screen, '/ui/product/registration/productInsert.xml');
  assert.equal(opened.param.initType, 'category');
  assert.match(opened.tabId, /^kiditemPI\d+$/);

  const { basic, product, saleOption, output, returns, grid, itemImages } = page.tab;
  assert.equal(basic.get('scatNo'), 'BC55031100');
  assert.equal(product.get('spdNm'), '킬러볼 스피너 키링 (1p) 스핀 장난감 열쇠고리');
  assert.equal(product.get('pdNm'), '킬러볼 스피너 키링 (1p) 스핀 장난감 열쇠고리');
  assert.equal(grid.getCellData(0, 'pdNm'), '킬러볼 스피너 키링 (1p) 스핀 장난감 열쇠고리');
  assert.equal(grid.getCellData(0, 'slPrc'), 2280);
  assert.equal(grid.getCellData(0, 'stkQty'), 999999999, '재고관리 안 함 — 기존 등록물과 같다');
  assert.equal(saleOption.get('stkMgtYn'), 'N');
  assert.deepEqual([product.get('oplcTypCd'), product.get('oplcCd')], ['OVS', 'CN']);
  assert.equal(product.get('mfcrNm'), '해피프랜즈', '고시가 비운 제조사 칸을 다시 채운다');
  assert.equal(product.get('mdlNo'), '10481-1');
  // 상세 이미지는 편집기 업로드(끌어다 놓기와 같은 길)가 돌려준 이미지로 넣는다. alt 는 상품명.
  assert.equal(page.tab.sections.wfm_desc.edt_dscrp.getHTML(), '<center><img src="data:image/jpeg;base64,UPLOADEDDETAIL" alt="킬러볼 스피너 키링 (1p) 스핀 장난감 열쇠고리" /></center>');
  assert.deepEqual(plain(page.log.editorUploads), [
    { name: 'wing-server-jpeg-v1-780.jpg', type: 'image/jpeg', uploadUrl: '/websquare/imageupload.wq?callbackFunction=edt_dscrp.callback&subDir=&responseType=json' },
  ]);
  assert.ok(outcome.steps.includes('상세설명 이미지(편집기 업로드)'), JSON.stringify(outcome.steps));
  assert.equal(page.tab.sections.wfm_as.edt_asCnts.getHTML(), '7일이내 교환, 반품 가능합니다.');
  assert.deepEqual([saleOption.get('maxPurLmtTypCd'), saleOption.get('maxPurQty'), saleOption.get('maxPurLmtPrd')], ['PERIOD', 9999, 1]);
  assert.deepEqual(
    [output.get('dvCstPolNo'), output.get('adtnDvCstPolNo'), output.get('owhpNo'), returns.get('rtrpNo'), output.get('sndBgtNday'), returns.get('rtrvTypCd')],
    ['406468', '3108763', 'PLO383047', 'PLO383047', 0, 'DGNN_RTRV'],
  );
  assert.deepEqual(plain(page.tab.sections.wfm_article.scwin.getPdItmsArtlInfo().map((item) => `${item.pdArtlCd}=${item.pdArtlCnts}`)), [
    '0210=3500킬러볼스피너키링//10481-1', '1400=해당없음', '1420=CN', '0070=해피프랜즈//해피프랜즈', '1440=031-908-5401',
  ]);
  assert.equal(itemImages.getAllJSON().length, 2);
  assert.ok(outcome.steps.includes('저장 전 필수 칸 확인'), JSON.stringify(outcome));
  assert.deepEqual(plain(outcome.warnings), []);
  assert.equal(page.log.saved, false);
  assert.equal(page.log.tempSaved, false);
  assert.deepEqual(page.log.unpatchedAlerts, [], '화면 알림은 전부 가로챈다');
  assert.equal(page.window.alert, page.nativeAlert);
  assert.equal(page.window.confirm, page.nativeConfirm);
});

test('⭐ 상품 이미지는 화면 업로드 티켓으로 올리고, 단품이미지 창이 닫힐 때의 콜백 모양(1 = 대표)으로 붙인다', async () => {
  const page = makeLotteonPage();
  await runLotteonFill(page);
  assert.match(page.log.ticketUrl, /limitFiles=2/);
  assert.equal(page.log.ticketAuth, 'Bearer test-token');
  // ⭐ `Accept: application/json` 이 없으면 롯데ON 이 XML 로 답해 사진이 통째로 빠졌다(사장님 실사용에서 잡음).
  assert.deepEqual(page.log.uploads.map((upload) => [upload.fileName, upload.hasFile, upload.auth, upload.accept]), [
    ['rep.jpg', true, 'Bearer test-token', 'application/json'],
    ['image2.jpg', true, 'Bearer test-token', 'application/json'],
  ]);
  const [callback] = page.log.popupCallbacks;
  assert.deepEqual(callback.param, { callbackId: 'uploadItemImage', row: 0, trGrpCd: 'SR', paramImageList: [] });
  assert.deepEqual(callback.ret.map((entry) => [entry.fileId, entry.imgSeq, entry.rprtImgYn, entry.epsrTypCd, entry.epsrTypDtlCd, entry.origFileNm]), [
    ['F1', 1, 'Y', 'IMG', 'IMG_SQRE', 'rep.jpg'],
    ['F2', 2, 'N', 'IMG', 'IMG_SQRE', 'image2.jpg'],
  ]);
  assert.equal(page.tab.grid.getCellData(0, 'imageSrc'), 'data:image/jpeg;base64,THUMB');
});

test('롯데ON 규격(500px) 밖의 사진은 올리지 않고, 업로드가 거절된 사진은 이유와 함께 알린다', async () => {
  const page = makeLotteonPage({ failUploadIndex: 1 });
  const outcome = await runLotteonFill(page, {
    images: [
      { name: 'lotteon0', dataUrl: 'data:image/jpeg;base64,AAEC', fileName: 'rep.jpg' },
      { name: 'lotteon1', dataUrl: 'data:image/png;base64,AAEC', fileName: 'small.png' },
      { name: 'lotteon2', dataUrl: 'data:image/jpeg;base64,AAED', fileName: 'extra2.jpg' },
    ],
  });
  assert.ok(outcome.warnings.includes('추가1 이미지 크기 400x400 는 롯데ON 규격(500~5000px)이 아니라 올리지 않았습니다.'), JSON.stringify(outcome.warnings));
  // 건너뛴 사진이 있어도 이름표는 원래 자리(세 번째 = 추가2)를 따른다.
  assert.ok(outcome.warnings.includes('추가2 이미지를 올리지 못했습니다: 용량을 초과했습니다.'), JSON.stringify(outcome.warnings));
  assert.equal(page.log.uploads.length, 2);
  assert.equal(page.tab.itemImages.getAllJSON().length, 1);
});

test('⭐ 파일 업로드가 XML 로 답해도 같은 칸(success·fileId)을 읽어 사진을 붙인다', async () => {
  const page = makeLotteonPage({ xmlUpload: true });
  const outcome = await runLotteonFill(page);
  assert.equal(page.tab.itemImages.getAllJSON().length, 2);
  assert.deepEqual(plain(page.log.popupCallbacks[0].ret.map((entry) => entry.fileId)), ['F1', 'F2']);
  assert.ok(outcome.steps.includes('상품 이미지 2장'), JSON.stringify(outcome));
});

test('편집기가 상세 이미지를 받지 않으면 읽히는 주소가 있을 때 그것으로 넣고, 이유는 알린다', async () => {
  const page = makeLotteonPage({ failEditorUpload: true });
  const outcome = await runLotteonFill(page, {
    detailHtml: '<center><img referrerpolicy="no-referrer" src="https://kiditem.diskn.com/S8brNL1Xs4"></center>',
  });
  assert.ok(outcome.warnings.includes('상세 이미지를 편집기에 올리지 못했습니다: 파일 크기가 너무 큽니다.'), JSON.stringify(outcome.warnings));
  assert.equal(page.tab.sections.wfm_desc.edt_dscrp.getHTML(), '<center><img referrerpolicy="no-referrer" src="https://kiditem.diskn.com/S8brNL1Xs4" /></center>');
  assert.ok(outcome.steps.includes('상세설명'), JSON.stringify(outcome.steps));

  const bare = makeLotteonPage({ failEditorUpload: true });
  const nothing = await runLotteonFill(bare);
  assert.ok(nothing.warnings.includes('상세설명을 넣지 못했습니다. 상세 이미지를 편집기에 끌어다 놓으세요.'), JSON.stringify(nothing.warnings));
  assert.equal(bare.tab.sections.wfm_desc.edt_dscrp.getHTML(), '');
});

test('창 콜백이 썸네일을 못 받아도 검사용 칸은 우리 사진으로 채운다', async () => {
  const page = makeLotteonPage({ noThumbnail: true });
  const outcome = await runLotteonFill(page);
  assert.equal(page.tab.grid.getCellData(0, 'imageSrc'), 'data:image/jpeg;base64,AAEC');
  assert.ok(outcome.steps.includes('저장 전 필수 칸 확인'), JSON.stringify(outcome));
});

test('사진이 없으면 저장 전 확인에 화면이 알려 준 문장을 싣는다', async () => {
  const page = makeLotteonPage();
  const outcome = await runLotteonFill(page, { images: [] });
  assert.ok(outcome.warnings.includes('상품 이미지가 없습니다. 판매옵션 목록의 이미지 [등록] 으로 올리세요.'), JSON.stringify(outcome.warnings));
  assert.ok(outcome.warnings.includes('저장 전 확인: 이미지는 필수 입력 항목 입니다'), JSON.stringify(outcome.warnings));
  assert.equal(page.log.uploads.length, 0);
});

test('⭐ 늦게 끝난 조회가 배송비 정책을 되돌리면 다시 넣는다', async () => {
  const page = makeLotteonPage({ lateReset: true });
  const outcome = await runLotteonFill(page);
  assert.equal(page.tab.output.get('dvCstPolNo'), '406468');
  assert.ok(outcome.steps.some((step) => step.includes('배송비 정책 406468')), JSON.stringify(outcome));
});

test('배송비 정책이 목록에 없으면 고르지 못했다고 이름을 대어 알린다', async () => {
  const page = makeLotteonPage({ missingPolicy: true });
  const outcome = await runLotteonFill(page);
  assert.ok(outcome.warnings.some((warning) => warning.includes('배송비 정책 406468')), JSON.stringify(outcome.warnings));
});

test('⭐ 분류가 거절되면(알림) 나머지를 채우지 않고 화면이 한 말을 돌려준다', async () => {
  const page = makeLotteonPage({ categoryAlert: '주류 판매 인증이 필요한 카테고리입니다.' });
  const outcome = await runLotteonFill(page);
  assert.equal(outcome.ok, false);
  assert.match(outcome.error, /BC55031100 를 고르지 못했습니다\(주류 판매 인증이 필요한 카테고리입니다\)/);
  assert.equal(page.tab.product.get('spdNm'), '');
  assert.deepEqual(page.log.unpatchedAlerts, []);
  assert.equal(page.document.querySelectorAll('.dialog-block').length, 0);
});

test('KC 대상 분류면 인증정보를 사람이 넣으라고 알리고, 분류 알림은 몰 안내로 넘긴다', async () => {
  const page = makeLotteonPage({ kcCategory: true });
  const outcome = await runLotteonFill(page);
  assert.ok(outcome.warnings.includes('이 카테고리는 KC 인증정보가 필요합니다. 인증정보 칸에 인증 구분·번호를 직접 넣으세요.'), JSON.stringify(outcome.warnings));
  assert.ok(outcome.warnings.includes('몰 안내: 어린이제품 KC 인증 대상 카테고리입니다.'), JSON.stringify(outcome.warnings));
});

test('⭐ 화면이 띄운 확인창은 취소로 닫는다 — 강조(확인) 단추는 누르지 않는다', async () => {
  const page = makeLotteonPage({ confirmDialog: true });
  const outcome = await runLotteonFill(page);
  assert.equal(page.log.cancelled, true);
  assert.equal(page.log.confirmedOk, false);
  assert.equal(page.document.querySelectorAll('.dialog-block').length, 0);
  assert.ok(outcome.warnings.some((warning) => warning.includes('작성 중인 상품이 있습니다')), JSON.stringify(outcome.warnings));
});

test('고시 줄의 한 칸이라도 비면 저장이 막히므로 그 항목을 알린다', async () => {
  const page = makeLotteonPage();
  const values = { ...lotteonForm().notice.values };
  delete values['0211'];
  const outcome = await runLotteonFill(page, { form: lotteonForm({ notice: { groupCode: '38', values } }) });
  assert.ok(outcome.warnings.includes('정보고시 항목 0210 이(가) 비었습니다. 화면에서 채우세요.'), JSON.stringify(outcome.warnings));
  assert.ok(outcome.warnings.includes('저장 전 확인: 품목정보제공고시를 입력해주세요'), JSON.stringify(outcome.warnings));
});

test('로그인 화면이면 폼이 없다고 돌려준다', async () => {
  const page = makeLotteonPage({ loginPage: true });
  const outcome = await runLotteonFill(page);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.noForm, true);
  assert.equal(page.log.openedTabs.length, 0);
});

test('화면 탭이 10개면 새 탭을 열지 않고 닫으라고 말한다', async () => {
  const page = makeLotteonPage({ tabCount: 10 });
  const outcome = await runLotteonFill(page);
  assert.equal(outcome.ok, false);
  assert.match(outcome.error, /탭이 10개/);
  assert.equal(page.log.openedTabs.length, 0);
});

test('페이지 함수는 저장·임시저장을 부르지 않는다', () => {
  const { pageFunctions } = loadModule();
  const source = pageFunctions.fillLotteonProductForm.toString();
  for (const forbidden of ['regist(', 'btn_regist', 'btn_saveTemp', 'updateProductTmp', 'selectProductTempCnt', 'insertProduct']) {
    assert.ok(!source.includes(forbidden), forbidden);
  }
  // 확인창에서 누르는 단추는 강조(point3)가 아닌 쪽뿐이다.
  assert.match(source, /!\/\\bpoint3\\b\/\.test\(button\.className\)/);
});
