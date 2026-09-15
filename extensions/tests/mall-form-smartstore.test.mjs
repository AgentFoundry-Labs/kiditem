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
 * 네이버 스마트스토어센터 상품등록(`sell.smartstore.naver.com/#/products/create`).
 *
 * 실측 2026-09-14. 기존 등록물 13660537717 의 상품 JSON 을 읽고, 새 등록 화면에 채워 화면 모델과 폼
 * 검증(`$error`)을 저장 없이 확인했다. 아래 가짜 화면의 선택자·반응은 그 화면에서 잰 것이다.
 */

const smartstoreForm = (overrides = {}) => ({
  category: { id: '50004643', keyword: '기타감각발달완구' },
  productName: '초코파이 크런치 슬랑이 1p 왁뿌 주물럭 스트레스볼',
  salePrice: 6000,
  discountWon: 2440,
  stock: 999,
  modelName: '6000초코파이크런치슬랑이',
  brandName: 'kiditem',
  manufacturerName: '해피프랜즈',
  origin: { exposureType: 'IMPORT', firstSub: '0200', secondSub: '0200037', importer: '거영아이앤디(KY I&D)' },
  childCert: { certId: '1041', number: 'CB065R1010-26001', companyName: '해피프랜즈' },
  notice: {
    type: 'ETC',
    itemName: '6000초코파이크런치슬랑이',
    modelName: '6000초코파이크런치슬랑이',
    certificateDetails: '상세설명 참조',
    manufacturer: '해피프랜즈',
    afterServiceDirector: '031-908-5401',
  },
  tags: ['왁뿌', '주물럭', '말랑이'],
  ...overrides,
});

const form = (overrides = {}) => ({
  url: 'https://sell.smartstore.naver.com/#/products/create',
  imageGroups: {
    smartstore: [
      'https://image1.coupangcdn.com/rep.jpg',
      'https://image1.coupangcdn.com/extra1.jpg',
      'https://image1.coupangcdn.com/extra2.jpg',
    ],
  },
  detailUploads: [{ url: 'http://localhost:9000/kiditem/detail-page-images/o/r/wing-server-jpeg-v1-780.jpg' }],
  manualSteps: [],
  smartstore: smartstoreForm(),
  ...overrides,
});

function harness({ executeScript } = {}) {
  const module = loadModule();
  const calls = [];
  const fetched = [];
  const api = module.create({
    chrome: {
      scripting: {
        executeScript: async (options) => {
          calls.push(options);
          if (executeScript) return executeScript(options);
          return [{ result: { ok: true, steps: [], warnings: [] } }];
        },
      },
    },
    fetch: async (url) => {
      fetched.push(String(url));
      return { ok: true, status: 200, blob: async () => new Blob([new Uint8Array([1, 2])], { type: 'image/jpeg' }) };
    },
    interactiveTabs: { createTab: async () => ({ id: 7 }) },
    tabReason: 'test',
  });
  return { api, calls, fetched };
}

test('등록 화면 해시 하나만 받는다 — 수정·목록 화면에는 채우지 않는다', async () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS.smartstore.origin, 'https://sell.smartstore.naver.com');
  assert.equal(SPECS.smartstore.hash, '#/products/create');

  const { api, calls } = harness();
  for (const url of [
    // 판매중 상품 수정 화면이다. 여기에 채우고 저장하면 그 상품이 덮인다.
    'https://sell.smartstore.naver.com/#/products/edit/13660537717',
    'https://sell.smartstore.naver.com/#/home/dashboard',
    'https://sell.smartstore.naver.com/',
    'https://sell.smartstore.naver.com/other#/products/create',
    'https://sell.smartstore.naver.com/?from=list#/products/create',
    'https://smartstore.naver.com/#/products/create',
  ]) {
    await assert.rejects(() => api.register({ mall: 'smartstore', form: form({ url }) }), /상품등록 주소가 아닙니다/, url);
  }
  assert.equal(calls.length, 0, '거절한 주소로는 탭도 주입도 하지 않는다');
});

test('상품명·판매가·카테고리가 없으면 채우러 가지 않는다', async () => {
  const { api } = harness();
  const reject = (smartstore, pattern) => assert.rejects(
    () => api.register({ mall: 'smartstore', form: form({ smartstore }) }),
    pattern,
  );
  await reject(smartstoreForm({ productName: ' <> ' }), /상품명/);
  await reject(smartstoreForm({ salePrice: 0 }), /판매가/);
  await reject(smartstoreForm({ category: { id: 'abc', keyword: '완구' } }), /카테고리/);
  await reject(undefined, /스마트스토어 폼 데이터/);
});

test('⭐ 전용 페이지 함수에 값 묶음·사진·상세 이미지를 MAIN 월드로 넘긴다', async () => {
  const { api, calls, fetched } = harness();
  const result = await api.register({ mall: 'smartstore', form: form() });

  assert.equal(result.submitted, false);
  assert.equal(calls.length, 1);
  const [options] = calls;
  assert.equal(options.func.name, 'fillSmartstoreProductForm');
  assert.equal(options.world, 'MAIN');
  const [payload] = options.args;
  assert.equal(payload.form.productName, '초코파이 크런치 슬랑이 1p 왁뿌 주물럭 스트레스볼');
  assert.equal(payload.form.discountWon, 2440);
  assert.equal(payload.maxExtraImages, 9);
  // 사진은 서비스워커가 읽어 넘긴다. 화면에서 CDN 을 부르면 CORS 로 막힌다.
  assert.equal(payload.images.length, 3);
  assert.match(payload.images[0].dataUrl, /^data:image\/jpeg;base64,/);
  assert.match(payload.detailImage.dataUrl, /^data:image\/jpeg;base64,/);
  // 남의 저장소(키즈노트)를 거치지 않는다 — 네이버 사진 서버에 올린다.
  assert.ok(!fetched.some((url) => url.includes('kidsnote')), fetched.join(' / '));
});

test('네이버가 막는 글자·넘치는 태그·틀린 코드는 넘기기 전에 거른다', async () => {
  const { api, calls } = harness();
  await api.register({
    mall: 'smartstore',
    form: form({
      smartstore: smartstoreForm({
        productName: '별*모양 "키링"',
        modelName: 'A<B>',
        discountWon: 6000,
        origin: { exposureType: 'import"]', firstSub: '0200', secondSub: '0200037', importer: 'x' },
        childCert: { certId: '10"41', number: 'CB1', companyName: '해피프랜즈' },
        tags: ['스트레스 해소', '왁뿌', '왁뿌', '가'.repeat(11), '별*', ...Array.from({ length: 12 }, (_, i) => `태그${i}`)],
      }),
    }),
  });
  const [{ form: values }] = calls[0].args;
  assert.equal(values.productName, '별모양 키링');
  assert.equal(values.modelName, 'AB');
  // 할인이 판매가 이상이면 할인 없이 넣는다.
  assert.equal(values.discountWon, 0);
  assert.equal(values.origin, null);
  assert.equal(values.childCert, null);
  assert.deepEqual(Array.from(values.tags), ['스트레스해소', '왁뿌', '별', '태그0', '태그1', '태그2', '태그3', '태그4', '태그5', '태그6']);
});

test('⭐ 로그인이 풀려 다른 도메인으로 가서 주입이 거절되면 로그인하라고 말한다', async () => {
  const { api } = harness({
    executeScript: async () => {
      throw new Error('Cannot access contents of url "https://accounts.commerce.naver.com/login". Extension manifest must request permission to access this host.');
    },
  });
  const result = await api.register({ mall: 'smartstore', form: form() });
  assert.equal(result.ok, false);
  assert.equal(result.submitted, false);
  assert.match(result.error, /스마트스토어에 로그인되어 있지 않습니다/);
});

test('확장이 스마트스토어 화면에 들어갈 권한을 갖는다', () => {
  const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'extensions/kiditem-os/manifest.json'), 'utf8'));
  assert.ok(manifest.host_permissions.includes('https://sell.smartstore.naver.com/*'));
});

// ── 페이지 함수 ────────────────────────────────────────────────────────────────

const PAGE_HTML = `
<form name="vm.productForm">
  <input ng-model="vm.category">
  <div class="form-section"><div class="title-line" role="button"><label>상품명</label><a class="btn active"></a></div>
    <div class="inner"><input name="product.name" required></div>
  </div>
  <div class="form-section"><div class="title-line" role="button"><label>판매가</label><a class="btn active"></a></div>
    <div class="inner">
      <input id="prd_price2" name="product.salePrice" required>
      <input type="radio" id="r3_1_total" name="discount" value="true">
      <input type="radio" id="r3_2_total" name="discount" value="false" checked>
      <input id="prd_sale" name="product.customerBenefit.immediateDiscountPolicy.discountMethod.value" required hidden>
      <input id="stock">
    </div>
  </div>
  <div class="form-section"><div class="title-line" role="button"><label>상품이미지/동영상</label><a class="btn active"></a></div>
    <div class="inner">
      <div id="representImage"><a ng-click="vm.openUploadModal()"></a><input name="_hidden_uploaded_names" data-nested="_REPRESENTATIVE_IMAGE" required></div>
      <div id="optionalImages"><a ng-click="vm.openUploadModal()"></a><input name="_hidden_uploaded_names"></div>
    </div>
  </div>
  <div class="form-section"><div class="title-line" role="button"><label>상세설명</label><a class="btn active"></a></div>
    <div class="inner">
      <a ng-click="vm.func.changeEditorType(vm.CONSTANTS.EDITOR_TYPE.SEONE)">직접 작성</a>
      <a ng-click="vm.func.changeEditorType(vm.CONSTANTS.EDITOR_TYPE.NONE)"><span>HTML 작성</span></a>
      <textarea ng-model="vm.editorContent" hidden></textarea>
    </div>
  </div>
  <div class="form-section"><div class="title-line" role="button"><label>상품 주요정보</label><a class="btn"></a></div>
    <div class="inner" hidden>
      <button type="button" ng-click="vm.func.openModelSearchModal(vm.naverShoppingSearchInfo.modelName)">찾기</button>
      <input ng-model="vm.searchKeyword" data-key="brandName">
      <input ng-model="vm.searchKeyword" data-key="manufacturerName">
      <select ng-model="vm.viewData.originAreaInfo.originAreaExposureType"></select>
      <select ng-model="vm.viewData.originAreaInfo.firstSubOriginAreaType"></select>
      <select ng-model="vm.viewData.originAreaInfo.secondSubOriginAreaType"></select>
      <input ng-model="vm.viewData.originAreaInfo.importer" hidden>
      <input type="radio" id="childYn_false" name="childYn" checked>
      <input type="radio" id="childYn_true" name="childYn">
      <div class="cert-row">
        <select ng-model="vm.productCertificationInfos[vm.type][$index].certificationInfo"></select>
        <input ng-model="vm.productCertificationInfos[vm.type][$index].name" placeholder="인증기관" required>
        <input name="certNumberCHILD_CERTIFICATION0" ng-model="vm.productCertificationInfos[vm.type][$index].certificationNumber" placeholder="인증번호" required>
        <input ng-model="vm.productCertificationInfos[vm.type][$index].companyName" placeholder="인증상호" required hidden>
      </div>
    </div>
  </div>
  <div class="form-section"><div class="title-line" role="button"><label>상품정보제공고시</label><a class="btn"></a></div>
    <div class="inner" hidden>
      <select ng-model="vm.selectizeType"></select>
      <input type="radio" name="certDetails" ng-model="vm.viewData.nullable.certificateDetails" value="false" checked>
      <input type="radio" name="certDetails" ng-model="vm.viewData.nullable.certificateDetails" value="true">
      <input ng-model="vm.content.itemName" value="3000할로윈아트네일팁">
      <input ng-model="vm.content.modelName" value="3000할로윈아트네일팁">
      <textarea ng-model="vm.content.certificateDetails">상세설명참조</textarea>
      <input ng-model="vm.searchKeyword" data-key="noticeManufacturer">
      <input type="radio" name="as" ng-model="vm.viewData.selectedCustomerService" value="false" checked>
      <input type="radio" name="as" ng-model="vm.viewData.selectedCustomerService" value="true">
      <input ng-model="vm.content.afterServiceDirector" value="고객센터 031-908-5401">
      <input ng-model="vm.content.customerServicePhoneNumber" required disabled>
    </div>
  </div>
  <div class="form-section"><div class="title-line" role="button"><label>검색설정</label><a class="btn"></a></div>
    <div class="inner" hidden>
      <input type="checkbox" ng-model="vm.viewData.isDirectInput" checked>
      <select ng-model="vm.directInputTag" multiple></select>
    </div>
  </div>
  <button type="button" id="save">저장하기</button>
  <button type="button" id="temp-save">임시저장</button>
</form>
<div class="seller-notice"><button class="close" type="button"></button></div>
`;

/**
 * 라이브 화면에서 잰 반응만 흉내 낸다. 선택자는 실제 화면 것 그대로다 — 여기가 틀리면 실제 화면에서도
 * 못 찾는다.
 */
function makeSmartstorePage({
  hash = '#/products/create',
  productId = null,
  loginPage = false,
  resumePrompt = true,
  detailUploadFails = false,
  restrictedTag = null,
  refuseUpload = false,
  // 카테고리를 고른 뒤 '유의사항 안내' 가 뜨기까지 걸리는 시간. 실제 화면은 API 응답을 기다려 늦게 뜨기도 한다.
  noticeDelayMs = 0,
  // 사진 서버에 올리는 시간과, 창이 닫힌 뒤 칸에 붙기까지의 틱.
  uploadMs = 20,
  attachDelayMs = 0,
  // 카테고리가 화면에 덜 반영돼 사진 창 대신 빨간 안내가 뜨는 횟수.
  categoryGuardClicks = 0,
} = {}) {
  const dom = new JSDOM(loginPage ? '<input type="password">' : PAGE_HTML, {
    url: `https://sell.smartstore.naver.com/${hash}`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const { document } = window;
  // jsdom 은 배치를 계산하지 않는다. 숨김 속성이 없으면 보이는 것으로 본다.
  window.Element.prototype.getClientRects = function getClientRects() {
    return this.isConnected && !this.closest('[hidden]') ? [{}] : [];
  };
  window.scrollTo = () => {};
  window.DataTransfer = class {
    constructor() {
      this.list = [];
      this.items = { add: (file) => this.list.push(file) };
    }

    get files() { return this.list; }
  };
  const nativeAlert = () => { throw new Error('native alert'); };
  const nativeConfirm = () => { throw new Error('native confirm'); };
  window.alert = nativeAlert;
  window.confirm = nativeConfirm;

  const log = {
    resumeCancelled: false, resumeLoaded: false, saved: false, uploads: [], detailUploads: [], abortedUploads: 0,
  };
  const q = (selector, scope = document) => scope.querySelector(selector);
  const product = {
    ...(productId ? { id: productId } : {}),
    name: '',
    images: [],
    customerBenefit: { specialDiscountPolicies: [] },
    detailContent: { editorType: 'SEONE', productDetailInfoContent: '' },
    detailAttribute: {
      naverShoppingSearchInfo: {},
      originAreaInfo: { type: 'LOCAL', originArea: { code: '00' } },
      certificationTargetExcludeContent: { kcYn: 'TRUE', childYn: false },
      // 새 화면은 직전 등록물 고시로 미리 채워져 온다.
      productInfoProvidedNotice: {
        productInfoProvidedNoticeType: 'ETC',
        productInfoProvidedNoticeContent: {
          itemName: '3000할로윈아트네일팁',
          modelName: '3000할로윈아트네일팁',
          certificateDetails: '상세설명참조',
          manufacturer: '거영아이앤디(KY I&D)',
          afterServiceDirector: '고객센터 031-908-5401',
        },
      },
      seoInfo: { sellerTags: [] },
    },
  };
  const detail = product.detailAttribute;
  const content = detail.productInfoProvidedNotice.productInfoProvidedNoticeContent;

  const showModal = (text, buttons) => {
    const modal = document.createElement('div');
    modal.className = 'modal';
    const body = document.createElement('div');
    body.className = 'modal-body';
    body.textContent = text;
    modal.append(body);
    for (const spec of buttons) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = spec.text;
      if (spec.className) button.className = spec.className;
      button.addEventListener('click', () => {
        spec.onClick?.();
        if (spec.keepOpen) return;
        modal.remove();
      });
      modal.append(button);
    }
    document.body.append(modal);
    return modal;
  };

  const attachSelectize = (el, { valueField = 'value', options = {}, value = '', load, onChange, create } = {}) => {
    const selectize = {
      settings: { valueField, load, create: Boolean(create) },
      options: { ...options },
      value,
      addOption(item) { this.options[String(item[valueField])] = item; },
      setValue(next) {
        if (!Object.prototype.hasOwnProperty.call(this.options, String(next))) return;
        this.value = String(next);
        onChange?.(this.value, this.options[this.value]);
      },
      getValue() { return this.value; },
      createItem(input) { create?.(input); return true; },
    };
    el.selectize = selectize;
    return selectize;
  };

  /**
   * 금액 칸(`ncp-number-format`). blur 마다 다음 틱에 칸 값을 `6,000` 으로 바꿔 다시 읽는다 —
   * 이미 `6,000` 이면 숫자로 못 읽어 빈 값이 된다(라이브 화면 그대로).
   */
  const numberFormat = (el, write) => {
    el.addEventListener('input', () => write(el.value.replace(/[^\d]/g, '')));
    el.addEventListener('blur', () => {
      setTimeout(() => {
        const parsed = Number(el.value);
        const formatted = el.value === '' || !Number.isFinite(parsed) ? '' : parsed.toLocaleString('en-US');
        el.value = formatted;
        write(formatted.replace(/[^\d]/g, ''));
      }, 0);
    });
  };

  if (!loginPage) {
    for (const line of document.querySelectorAll('.title-line')) {
      line.addEventListener('click', () => {
        line.querySelector('a.btn').classList.toggle('active');
        line.parentElement.querySelector('.inner').hidden = !line.querySelector('a.btn').classList.contains('active');
      });
    }
    q('#save').addEventListener('click', () => { log.saved = true; });
    q('#temp-save').addEventListener('click', () => { log.saved = true; });

    if (resumePrompt) {
      setTimeout(() => showModal('이전에 작성하던 내용이 존재합니다. 이전내용을 불러오시겠습니까?', [
        { text: '×', className: 'close', onClick: () => { log.resumeCancelled = true; } },
        { text: '취소', onClick: () => { log.resumeCancelled = true; } },
        { text: '확인', onClick: () => { log.resumeLoaded = true; product.name = '옛 내용'; } },
      ]), 30);
    }

    attachSelectize(q('input[ng-model="vm.category"]'), {
      valueField: 'id',
      load: (query, callback) => setTimeout(() => callback(query === '기타감각발달완구'
        ? [{ id: '50004643', wholeCategoryName: '출산/육아>완구/인형>감각발달완구>기타감각발달완구' }]
        : []), 10),
      onChange: (id, item) => {
        product.category = { id, wholeCategoryName: item.wholeCategoryName };
        const notice = () => showModal('유의사항 안내 어린이제품 인증 카테고리입니다. 모델명, 어린이제품인증을 필수로 입력해야 합니다.', [
          { text: '×', className: 'close' },
          { text: '확인' },
        ]);
        if (noticeDelayMs > 0) setTimeout(notice, noticeDelayMs);
        else notice();
      },
    });

    q('input[name="product.name"]').addEventListener('input', (event) => { product.name = event.target.value; });
    numberFormat(q('#prd_price2'), (digits) => { product.salePrice = digits; });
    q('#r3_1_total').addEventListener('change', () => {
      q('#prd_sale').hidden = false;
      product.customerBenefit.immediateDiscountPolicy = { discountMethod: { value: undefined, discountUnitType: 'WON' } };
    });
    numberFormat(q('#prd_sale'), (digits) => {
      product.customerBenefit.immediateDiscountPolicy.discountMethod.value = digits ? Number(digits) : undefined;
    });
    q('#stock').addEventListener('input', (event) => { product.stockQuantity = event.target.value; });

    // 사진: 창이 열리면 ng-file-upload 가 body 에 숨은 파일 칸을 만든다. 파일을 넣으면 올리고 창을 닫고,
    // 다음 틱에 칸에 붙인다. 올리는 도중 창이 닫히면(dismiss) 결과를 버린다 — 실제 uib 모달과 같다.
    let guardLeft = categoryGuardClicks;
    for (const [containerId, imageType] of [['representImage', 'REPRESENTATIVE'], ['optionalImages', 'OPTIONAL']]) {
      q(`#${containerId} a`).addEventListener('click', () => {
        if (guardLeft > 0) {
          guardLeft -= 1;
          const danger = document.createElement('p');
          danger.className = 'sub-text text-danger';
          danger.textContent = '먼저 카테고리를 선택해 주세요.';
          q(`#${containerId}`).append(danger);
          return;
        }
        q(`#${containerId} .text-danger`)?.remove();
        const modal = showModal('내 사진 불러오기 최대 20MB까지 첨부 가능합니다.', [{ text: '×', className: 'close' }]);
        const input = document.createElement('input');
        input.type = 'file';
        input.setAttribute('ngf-select', 'vm.uploadImagesFromDevice($files, $invalidFiles)');
        Object.defineProperty(input, 'files', { configurable: true, writable: true, value: null });
        input.addEventListener('change', () => setTimeout(() => {
          // 형식이 틀리면 사진 창은 그대로 두고 안내창을 하나 더 띄운다(ng-file-upload 검증).
          if (refuseUpload) {
            showModal('"jpg, jpeg, gif, png, bmp" 형식의 이미지만 입력 가능합니다.', [{ text: '확인' }]);
            return;
          }
          if (!modal.isConnected) {
            log.abortedUploads += 1;
            return;
          }
          const names = [...(input.files || [])].map((file) => file.name);
          modal.remove();
          input.remove();
          setTimeout(() => {
            log.uploads.push({ containerId, names });
            q(`#${containerId} input[name="_hidden_uploaded_names"]`).value = names.join(',');
            product.images.push(...names.map(() => ({ imageType })));
          }, attachDelayMs);
        }, uploadMs));
        document.body.append(input);
      });
    }

    q('a[ng-click="vm.func.changeEditorType(vm.CONSTANTS.EDITOR_TYPE.NONE)"]').addEventListener('click', () => {
      product.detailContent.editorType = 'NONE';
      q('textarea[ng-model="vm.editorContent"]').hidden = false;
    });
    q('textarea[ng-model="vm.editorContent"]').addEventListener('input', (event) => {
      product.detailContent.productDetailInfoContent = event.target.value;
    });

    // 모델명 찾기 창: `텍스트로 직접입력` 을 골라야 입력칸이 생긴다.
    q('button[ng-click^="vm.func.openModelSearchModal"]').addEventListener('click', () => {
      let modelText = null;
      const modal = showModal('모델명 입력 모델명 입력방식을 선택해주세요.', [
        { text: '×', className: 'close' },
        {
          text: '저장',
          onClick: () => { if (modelText?.value) detail.naverShoppingSearchInfo.modelName = modelText.value; },
        },
      ]);
      modal.querySelectorAll('button')[1].setAttribute('ng-click', 'vm.func.save()');
      for (const value of ['CATALOG', 'TEXT']) {
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'inputType';
        radio.value = value;
        radio.setAttribute('ng-model', 'vm.inputType');
        if (value === 'CATALOG') radio.checked = true;
        radio.addEventListener('change', () => {
          if (value !== 'TEXT' || modelText) return;
          modelText = document.createElement('input');
          modelText.setAttribute('ng-model', 'vm.modelText');
          modal.append(modelText);
        });
        modal.prepend(radio);
      }
    });

    const [brand, maker, noticeMaker] = document.querySelectorAll('[ng-model="vm.searchKeyword"]');
    attachSelectize(brand, { create: (name) => { detail.naverShoppingSearchInfo.brandName = name; } });
    attachSelectize(maker, { create: (name) => { detail.naverShoppingSearchInfo.manufacturerName = name; } });
    attachSelectize(noticeMaker, { create: (name) => { content.manufacturer = name; } });

    const second = attachSelectize(q('select[ng-model="vm.viewData.originAreaInfo.secondSubOriginAreaType"]'), {
      onChange: (code) => { detail.originAreaInfo.originArea = { code }; },
    });
    const first = attachSelectize(q('select[ng-model="vm.viewData.originAreaInfo.firstSubOriginAreaType"]'), {
      onChange: () => setTimeout(() => { second.options = { '0200037': { name: '중국' } }; }, 30),
    });
    attachSelectize(q('select[ng-model="vm.viewData.originAreaInfo.originAreaExposureType"]'), {
      options: { '': {}, LOCAL: {}, IMPORT: {}, ETC: {} },
      onChange: (type) => {
        detail.originAreaInfo.type = type;
        q('input[ng-model="vm.viewData.originAreaInfo.importer"]').hidden = type !== 'IMPORT';
        setTimeout(() => { first.options = { '0200': { name: '아시아' } }; }, 30);
      },
    });
    q('input[ng-model="vm.viewData.originAreaInfo.importer"]').addEventListener('input', (event) => {
      detail.originAreaInfo.importer = event.target.value;
    });
    q('#childYn_true').addEventListener('change', () => { detail.certificationTargetExcludeContent.childYn = true; });
    attachSelectize(q('select[ng-model$=".certificationInfo"]'), {
      options: { '': {}, '1042_CHILD_CERTIFICATION': {}, '1040_CHILD_CERTIFICATION': {}, '1041_CHILD_CERTIFICATION': {} },
      onChange: () => { q('input[ng-model$=".companyName"]').hidden = false; },
    });

    attachSelectize(q('select[ng-model="vm.selectizeType"]'), { options: { ETC: {}, KIDS: {} }, value: 'ETC' });
    for (const key of ['itemName', 'modelName', 'certificateDetails', 'afterServiceDirector']) {
      q(`[ng-model="vm.content.${key}"]`).addEventListener('input', (event) => { content[key] = event.target.value; });
    }

    attachSelectize(q('select[ng-model="vm.directInputTag"]'), {
      create: (tag) => setTimeout(() => {
        if (tag === restrictedTag) showModal('사용 불가한 태그입니다.', [{ text: '확인' }]);
        else detail.seoInfo.sellerTags.push({ text: tag });
      }, 20),
    });
  }

  // 화면 모델은 `$rootScope` 아래 어딘가의 `vm.productFormSubmitVO` 에 있다.
  const submitScope = { vm: { productFormSubmitVO: { product } }, $$childHead: null, $$nextSibling: null };
  const root = { $$childHead: { $$childHead: null, $$nextSibling: submitScope } };
  const controllers = new Map();
  const formController = {
    get $error() {
      const required = [];
      const nested = new Map();
      for (const el of document.querySelectorAll('form [required]')) {
        if (el.closest('[hidden]') && el.name !== '_hidden_uploaded_names') continue;
        if (el.value) continue;
        if (!controllers.has(el)) {
          controllers.set(el, { $name: el.name || '', $$element: [el], $setViewValue() {}, $error: { required: true } });
        }
        const control = controllers.get(el);
        const group = el.dataset.nested;
        if (!group) {
          required.push(control);
          continue;
        }
        if (!nested.has(group)) nested.set(group, { $name: group, $error: { required: [] } });
        nested.get(group).$error.required.push(control);
      }
      return { required: [...required, ...nested.values()] };
    },
  };
  const uploader = {
    uploadImages: async (files) => {
      // 화면(jsdom) 쪽 배열이라 이 테스트의 배열로 옮겨 담는다.
      log.detailUploads.push(Array.from(files, (file) => file.name));
      if (detailUploadFails) throw new Error('HTTP 500');
      return [{ imageUrl: 'http://shop1.phinf.naver.net/20260914_7/abc_JPEG/detail.jpg', width: 780, height: 3000, resultCode: 0 }];
    },
  };
  if (!loginPage) {
    window.angular = {
      element: () => ({
        injector: () => ({ get: (name) => ({ $rootScope: root, photoInfraImageUploadService: uploader })[name] }),
        controller: (kind) => (kind === 'form' ? formController : null),
      }),
    };
  }
  return { window, document, product, log, nativeAlert, nativeConfirm };
}

async function runSmartstoreFill(page, payloadOverrides = {}) {
  const { pageFunctions } = loadModule();
  const fill = page.window.eval(`(${pageFunctions.fillSmartstoreProductForm.toString()})`);
  return fill({
    form: smartstoreForm(),
    images: [
      { name: 'smartstore0', dataUrl: 'data:image/jpeg;base64,AAEC', fileName: 'rep.jpg' },
      { name: 'smartstore1', dataUrl: 'data:image/jpeg;base64,AAEC', fileName: 'extra1.jpg' },
      { name: 'smartstore2', dataUrl: 'data:image/png;base64,AAEC', fileName: 'extra2' },
    ],
    maxExtraImages: 9,
    formWaitMs: 300,
    stepWaitMs: 300,
    imageWaitMs: 1000,
    detailImage: { name: 'detail', dataUrl: 'data:image/jpeg;base64,AAEC', fileName: 'wing-server-jpeg-v1-780.jpg' },
    detailHtml: '',
    ...payloadOverrides,
  });
}

test('⭐ 사람이 누르는 순서대로 채우고 값이 화면 모델에 닿는다 — 저장은 누르지 않는다', async () => {
  const page = makeSmartstorePage();
  const outcome = await runSmartstoreFill(page);

  assert.equal(outcome.ok, true, JSON.stringify(outcome));
  assert.equal(outcome.submitted, false);
  const { product } = page;
  assert.equal(product.category.id, '50004643');
  assert.equal(product.name, '초코파이 크런치 슬랑이 1p 왁뿌 주물럭 스트레스볼');
  assert.equal(product.stockQuantity, '999');
  const detail = product.detailAttribute;
  assert.deepEqual({ ...detail.naverShoppingSearchInfo }, {
    modelName: '6000초코파이크런치슬랑이', brandName: 'kiditem', manufacturerName: '해피프랜즈',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(detail.originAreaInfo)), {
    type: 'IMPORT', originArea: { code: '0200037' }, importer: '거영아이앤디(KY I&D)',
  });
  assert.equal(page.document.querySelector('input[name="certNumberCHILD_CERTIFICATION0"]').value, 'CB065R1010-26001');
  assert.equal(page.document.querySelector('input[ng-model$=".companyName"]').value, '해피프랜즈');
  assert.deepEqual(detail.seoInfo.sellerTags.map((tag) => tag.text), ['왁뿌', '주물럭', '말랑이']);
  assert.deepEqual(page.log.uploads, [
    { containerId: 'representImage', names: ['rep.jpg'] },
    // 확장자 없는 이름은 형식에 맞춰 붙인다 — 사진 칸이 이름으로 형식을 거른다.
    { containerId: 'optionalImages', names: ['extra1.jpg', 'image3.png'] },
  ]);
  assert.ok(Array.from(outcome.steps).includes('추가이미지 2장'), JSON.stringify(outcome.steps));
  assert.equal(page.log.saved, false);
});

test('⭐ 판매가·즉시할인이 채운 뒤에도 남는다 — 금액 칸은 blur 를 두 번 받으면 빈다', async () => {
  const page = makeSmartstorePage();
  const outcome = await runSmartstoreFill(page);
  // 금액 칸이 blur 뒤 다음 틱에 값을 다시 쓰므로 한 박자 기다려 본다.
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(page.product.salePrice, '6000');
  assert.equal(page.product.customerBenefit.immediateDiscountPolicy.discountMethod.value, 2440);
  assert.equal(page.document.querySelector('#prd_price2').value, '6,000');
  assert.ok(Array.from(outcome.steps).includes('판매가 6000 · 즉시할인 2440 → 3560원'), JSON.stringify(outcome.steps));
});

test('⭐ 이전 작성 내용 창은 취소한다 — 확인하면 옛 내용이 새 값을 덮는다', async () => {
  const page = makeSmartstorePage();
  const outcome = await runSmartstoreFill(page);

  assert.equal(page.log.resumeCancelled, true);
  assert.equal(page.log.resumeLoaded, false);
  assert.ok(Array.from(outcome.steps).includes('이전 작성 내용은 불러오지 않음'));
});

test('⭐ 직전 등록물 값으로 미리 채워진 고시를 전부 덮어쓴다', async () => {
  const page = makeSmartstorePage();
  await runSmartstoreFill(page);

  assert.deepEqual({ ...page.product.detailAttribute.productInfoProvidedNotice.productInfoProvidedNoticeContent }, {
    itemName: '6000초코파이크런치슬랑이',
    modelName: '6000초코파이크런치슬랑이',
    certificateDetails: '상세설명 참조',
    manufacturer: '해피프랜즈',
    afterServiceDirector: '031-908-5401',
  });
});

test('상세 이미지는 네이버 사진 서버에 올리고 https 주소로 HTML 작성에 넣는다', async () => {
  const page = makeSmartstorePage();
  await runSmartstoreFill(page);

  assert.deepEqual(page.log.detailUploads, [['wing-server-jpeg-v1-780.jpg']]);
  assert.equal(page.product.detailContent.editorType, 'NONE');
  assert.equal(
    page.product.detailContent.productDetailInfoContent,
    '<center><img src="https://shop-phinf.pstatic.net/20260914_7/abc_JPEG/detail.jpg"></center>',
  );
});

test('상세 업로드가 실패하면 이미 읽히는 주소로 넣고, 그것도 없으면 말한다', async () => {
  const failing = makeSmartstorePage({ detailUploadFails: true });
  const withFallback = await runSmartstoreFill(failing, {
    detailHtml: '<center><img referrerpolicy="no-referrer" src="https://kiditem.diskn.com/abc"></center>',
  });
  assert.ok(Array.from(withFallback.warnings).some((w) => w.includes('상세이미지를 네이버에 올리지 못했습니다')));
  assert.equal(
    failing.product.detailContent.productDetailInfoContent,
    '<center><img referrerpolicy="no-referrer" src="https://kiditem.diskn.com/abc"></center>',
  );

  const empty = makeSmartstorePage({ detailUploadFails: true });
  const withoutFallback = await runSmartstoreFill(empty);
  assert.ok(Array.from(withoutFallback.warnings).some((w) => w.includes('상세설명에 넣을 이미지를 만들지 못했습니다')));
  assert.equal(empty.product.detailContent.productDetailInfoContent, '');
});

test('⭐ 저장 전 검증에서 막히는 칸을 이름으로 알린다 — 꺼진 칸은 빼고', async () => {
  const page = makeSmartstorePage();
  const outcome = await runSmartstoreFill(page);

  // 인증기관은 우리가 모르는 값이라 비어 있다. 고시 소비자상담 전화는 꺼진 칸이라 말하지 않는다.
  assert.ok(Array.from(outcome.warnings).includes('저장 전 확인: 상품 주요정보 인증기관'), JSON.stringify(outcome.warnings));
  assert.ok(!Array.from(outcome.warnings).some((w) => w.includes('상품정보제공고시')), JSON.stringify(outcome.warnings));

  const noImages = makeSmartstorePage();
  const without = await runSmartstoreFill(noImages, { images: [] });
  assert.ok(
    Array.from(without.warnings).some((w) => w.startsWith('저장 전 확인:') && w.includes('상품이미지/동영상')),
    JSON.stringify(without.warnings),
  );
});

test('⭐ KC 번호가 없으면 인증을 비워 두고 말한다 — 대상 아님을 대신 고르지 않는다', async () => {
  const page = makeSmartstorePage();
  const outcome = await runSmartstoreFill(page, { form: smartstoreForm({ childCert: null }) });

  assert.equal(page.document.querySelector('#childYn_true').checked, false);
  assert.equal(page.product.detailAttribute.certificationTargetExcludeContent.childYn, false);
  assert.ok(Array.from(outcome.warnings).some((w) => w.includes("'대상 아님'")), JSON.stringify(outcome.warnings));
});

test('사용 불가 태그는 화면 안내를 치우고 넣지 못한 태그로 알린다', async () => {
  const page = makeSmartstorePage({ restrictedTag: '주물럭' });
  const outcome = await runSmartstoreFill(page);

  assert.deepEqual(page.product.detailAttribute.seoInfo.sellerTags.map((tag) => tag.text), ['왁뿌', '말랑이']);
  assert.ok(Array.from(outcome.warnings).some((w) => w.includes('태그 주물럭')), JSON.stringify(outcome.warnings));
  assert.ok(Array.from(outcome.warnings).includes('몰 안내: 사용 불가한 태그입니다.'), JSON.stringify(outcome.warnings));
  assert.equal(page.document.querySelectorAll('.modal').length, 0, '안내창이 남아 사람 화면을 가리지 않는다');
});

test('사진 창이 거절하면 창을 치우고 그 말을 붙여 알린다', async () => {
  const page = makeSmartstorePage({ refuseUpload: true });
  const outcome = await runSmartstoreFill(page);

  const warnings = Array.from(outcome.warnings);
  assert.ok(warnings.includes('대표이미지를 올리지 못했습니다: "jpg, jpeg, gif, png, bmp" 형식의 이미지만 입력 가능합니다. 화면에서 올리세요.'), JSON.stringify(warnings));
  assert.ok(warnings.includes('추가이미지 2장을 올리지 못했습니다: "jpg, jpeg, gif, png, bmp" 형식의 이미지만 입력 가능합니다. 화면에서 올리세요.'), JSON.stringify(warnings));
  assert.equal(page.document.querySelectorAll('.modal').length, 0, '사진 창·안내창이 남아 사람 화면을 가리지 않는다');
  // 사진이 막혀도 나머지 칸은 끝까지 채운다.
  assert.equal(page.product.detailAttribute.seoInfo.sellerTags.length, 3);
});

test('⭐ 늦게 뜬 유의사항 안내가 사진 창과 겹쳐도 사진을 끝까지 올린다', async () => {
  // 카테고리 안내가 사진을 올리는 도중에 뜬다. 예전엔 이걸 거절로 보고 사진 창까지 닫아 대표이미지가 빈 칸으로 남았다.
  // 안내를 기다리는 몫(~0.5초)이 끝난 뒤, 사진을 올리는 1.5초 사이에 뜨게 한다.
  const page = makeSmartstorePage({ noticeDelayMs: 900, uploadMs: 1500 });
  const outcome = await runSmartstoreFill(page, { imageWaitMs: 5000 });

  assert.equal(page.log.abortedUploads, 0);
  assert.deepEqual(page.log.uploads.map((upload) => upload.containerId), ['representImage', 'optionalImages']);
  assert.ok(Array.from(outcome.steps).includes('대표이미지'), JSON.stringify(outcome));
  assert.ok(!Array.from(outcome.warnings).some((w) => w.includes('대표이미지')), JSON.stringify(outcome.warnings));
});

test('사진은 창이 닫힌 다음 틱에 칸에 붙는다 — 붙을 때까지 기다린다', async () => {
  // 창이 닫힌 걸 알아채는 간격(0.25초)보다 늦게 붙게 한다.
  const page = makeSmartstorePage({ attachDelayMs: 400 });
  const outcome = await runSmartstoreFill(page);

  assert.ok(Array.from(outcome.steps).includes('대표이미지'), JSON.stringify(outcome));
  assert.ok(Array.from(outcome.steps).includes('추가이미지 2장'), JSON.stringify(outcome));
});

test('사진 창이 안 열리면 한 번 더 누르고, 그래도 안 되면 화면의 안내를 붙여 알린다', async () => {
  const once = makeSmartstorePage({ categoryGuardClicks: 1 });
  const retried = await runSmartstoreFill(once);
  assert.ok(Array.from(retried.steps).includes('대표이미지'), JSON.stringify(retried));

  const always = makeSmartstorePage({ categoryGuardClicks: 99 });
  const failed = await runSmartstoreFill(always);
  assert.ok(
    Array.from(failed.warnings).includes('대표이미지를 올리지 못했습니다: 먼저 카테고리를 선택해 주세요. 화면에서 올리세요.'),
    JSON.stringify(failed.warnings),
  );
});

test('채우는 동안 alert·confirm 을 막고 끝나면 원래대로 돌려준다', async () => {
  const page = makeSmartstorePage();
  await runSmartstoreFill(page);

  assert.equal(page.window.alert, page.nativeAlert);
  assert.equal(page.window.confirm, page.nativeConfirm);
});

test('⭐ 수정 화면이면 아무것도 넣지 않는다 — 해시든 상품번호든', async () => {
  for (const options of [{ hash: '#/products/edit/13660537717' }, { productId: 13660537717 }]) {
    const page = makeSmartstorePage({ ...options, resumePrompt: false });
    const outcome = await runSmartstoreFill(page);
    assert.equal(outcome.ok, false);
    assert.match(outcome.error, /수정 화면/);
    assert.equal(page.product.name, '');
    assert.equal(page.product.category, undefined);
  }
});

test('로그인 화면이면 폼이 없다고 돌려준다 — 확장이 로그인 뒤 다시 채운다', async () => {
  const page = makeSmartstorePage({ loginPage: true });
  const outcome = await runSmartstoreFill(page);

  assert.equal(outcome.ok, false);
  assert.equal(outcome.noForm, true);
});

test('페이지 함수는 저장·임시저장을 부르지 않는다', () => {
  const source = loadModule().pageFunctions.fillSmartstoreProductForm.toString();
  assert.ok(!/저장하기|임시저장|tempSave|func\.submit/.test(source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')));
});
