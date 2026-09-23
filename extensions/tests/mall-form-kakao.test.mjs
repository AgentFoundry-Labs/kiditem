import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const modulePath = path.join(repoRoot, 'extensions/kiditem-os/background/orders/mall-form-register.js');

class FakeFileReader {
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type || 'image/jpeg'};base64,${Buffer.from(buffer).toString('base64')}`;
      this.onload?.();
    }).catch((e) => this.onerror?.(e));
  }
}

const plain = (value) => JSON.parse(JSON.stringify(value));

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
 * 카카오 톡스토어 판매자센터 상품등록(`shopping-seller.kakao.com/product/store-seller/insert`).
 *
 * 실측 2026-09-18. 기존 등록물 `793407891` 의 상품 JSON 을 읽고, 새 등록 화면에서 이 페이지 함수를 저장 없이
 * 돌려 칸 상태가 전부 `ng-valid` 가 되는 것까지 봤다. 아래 가짜 화면의 컴포넌트 · 클래스 · 글자는 그 화면 것이다.
 */

const kakaoForm = (overrides = {}) => ({
  productName: '포도 설기 말랑이 1p 주물럭 슬랑이 스트레스볼 찐득볼',
  categoryId: '102106101109',
  salePrice: 2850,
  stock: 999,
  origin: { type: '수입산', region: '아시아', country: '중국' },
  cert: { type: '[어린이제품] 안전확인', number: 'CB065R1010-26001' },
  notice: {
    group: '어린이제품',
    values: {
      '품명 및 모델명': '4500포도설기말랑이',
      'KC 인증정보': '[어린이제품] 안전확인 CB065R1010-26001',
      재질: '고무',
      사용연령: '8세 이상',
      제조자: '해피프랜즈',
      제조국: '중국',
      취급방법: '1. 용도 이외에 사용하지 마십시오.',
      'A/S 책임자': '031-908-5401',
    },
  },
  deliveryTemplate: '기본 배송 탬플릿',
  brand: 'kiditem',
  manufacturer: '해피프랜즈',
  sellerCode: '',
  affiliate: false,
  ...overrides,
});

const form = (overrides = {}) => ({
  url: 'https://shopping-seller.kakao.com/product/store-seller/insert',
  imageGroups: { kakao: ['https://image1.coupangcdn.com/rep.jpg', 'https://image1.coupangcdn.com/extra1.jpg'] },
  detailUploads: [{ url: 'http://localhost:9000/kiditem/detail-page-images/o/r/wing-server-jpeg-v1-780.jpg' }],
  manualSteps: [],
  kakao: kakaoForm(),
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

test('등록 주소 하나만 받는다 — 판매중 상품 수정 화면 · 쿼리 · 다른 도메인에는 채우지 않는다', async () => {
  const { api, calls } = harness();
  for (const url of [
    'https://shopping-seller.kakao.com/product/store-seller/modify/793407891?returnUrl=%2Flist',
    'https://shopping-seller.kakao.com/product/store-seller/insert?copy=793407891',
    'https://shopping-seller.kakao.com/product/store-seller/insert/extra',
    'https://shopping-sell.kakao.com/product/store-seller/insert',
  ]) {
    await assert.rejects(() => api.register({ mall: 'kakao', form: form({ url }) }), /상품등록 주소가 아닙니다/, url);
  }
  assert.equal(calls.length, 0, '거절한 주소로는 탭도 주입도 하지 않는다');
});

test('상품명 · 판매가가 없으면 채우러 가지 않는다', async () => {
  const { api } = harness();
  const reject = (kakao, pattern) => assert.rejects(() => api.register({ mall: 'kakao', form: form({ kakao }) }), pattern);
  await reject(kakaoForm({ productName: ' <> ' }), /상품명/);
  await reject(kakaoForm({ salePrice: 0 }), /판매가/);
  await reject(undefined, /카카오 톡스토어 폼 데이터/);
});

test('⭐ 화면이 자르는 70자에 맞추고, 모양이 틀린 코드 · 인증번호 · 원산지는 비운다', async () => {
  const { api, calls } = harness();
  await api.register({
    mall: 'kakao',
    form: form({
      kakao: kakaoForm({
        productName: `${'가'.repeat(80)} <말랑이>`,
        categoryId: '1021061011',
        cert: { type: '', number: 'KC 번호 없음!' },
        origin: { type: '달나라', region: '아시아', country: '중국' },
        stock: 0,
        notice: { group: '', values: { 재질: '  ', 제조국: '중국' } },
      }),
    }),
  });
  const [{ form: values }] = calls[0].args;
  assert.ok([...values.productName].length <= 70, values.productName);
  assert.ok(!/[<>]/.test(values.productName));
  assert.equal(values.categoryId, '', '세 자리씩 붙지 않는 코드는 AI 추천에 맡긴다');
  assert.equal(values.cert, null);
  assert.deepEqual(plain(values.origin), { type: '수입산', region: '아시아', country: '중국' });
  assert.equal(values.stock, 999);
  assert.deepEqual(plain(values.notice), { group: '어린이제품', values: { 제조국: '중국' } });
});

test('⭐ 전용 페이지 함수에 값 묶음 · 사진 · 상세 이미지(편집기 업로드용 파일)를 MAIN 월드로 넘긴다', async () => {
  const { api, calls } = harness();
  const result = await api.register({ mall: 'kakao', form: form() });
  assert.equal(result.submitted, false);
  const [options] = calls;
  assert.equal(options.func.name, 'fillKakaoProductForm');
  assert.equal(options.world, 'MAIN');
  const [payload] = options.args;
  assert.equal(payload.form.categoryId, '102106101109');
  assert.equal(payload.maxImages, 6);
  assert.equal(payload.images.length, 2);
  assert.match(payload.images[0].dataUrl, /^data:image\/jpeg;base64,/);
  // 로컬 렌더 산출물이라도 남의 호스팅에 올리지 않는다 — 편집기 업로드가 톡스토어에 넣는다.
  assert.match(payload.detailImage.dataUrl, /^data:image\/jpeg;base64,/);
  assert.equal(payload.detailHtml, '');
});

// ── 페이지 함수 ────────────────────────────────────────────────────────────────

const CATEGORY_NAMES = {
  102106: '완구/장난감/교구',
  102106101: '교육/학습완구',
  102106101109: '클레이',
};
const NOTICE_LABELS = [
  '품명 및 모델명', 'KC 인증정보', '크기, 중량', '색상', '재질', '사용연령 또는 권장사용연령', '크기ㆍ체중의 한계',
  '동일모델의 출시년월', '제조자', '제조국', '취급방법 및 취급시 주의사항, 안전표시 (주의, 경고 등)', '품질보증기준',
  'A/S 책임자와 전화번호',
];

function makeKakaoPage({ loginPage = false, originResetsOnce = false } = {}) {
  const dom = new JSDOM(loginPage ? '<input type="password">' : '<body></body>', {
    url: loginPage ? 'https://accounts.kakao.com/login/' : 'https://shopping-seller.kakao.com/product/store-seller/insert',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const { document } = window;
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
  window.alert = () => { throw new Error('native alert'); };
  window.confirm = () => { throw new Error('native confirm'); };
  const log = { clicks: [], uploads: [], editorUploads: [], lookups: [], categoryFetches: [] };
  if (loginPage) return { dom, window, document, log };

  const el = (tag, attrs = {}, html = '') => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    node.innerHTML = html;
    return node;
  };
  const setValid = (node, valid) => {
    node.classList.toggle('ng-valid', valid);
    node.classList.toggle('ng-invalid', !valid);
  };
  const dropdown = (selected, options, onPick) => {
    const box = el('cu-dropdown', {}, '<div class="box-tf"><a class="link-selected dropdown-toggle"></a><ul class="list-opt"></ul></div>');
    const shown = box.querySelector('a.link-selected');
    shown.textContent = selected;
    box.setOptions = (labels) => {
      const list = box.querySelector('ul');
      list.innerHTML = '';
      for (const label of labels) {
        const link = el('a', { class: 'link-opt' });
        link.textContent = label;
        link.addEventListener('click', () => {
          shown.textContent = label;
          onPick?.(label, box);
        });
        list.append(el('li'));
        list.lastChild.append(link);
      }
    };
    box.show = (text) => { shown.textContent = text; };
    box.setOptions(options);
    return box;
  };
  const textbox = () => el('cu-textbox', { class: 'box-textbox' }, '<div class="inner-tf"><input type="text" class="tf-g"></div>');
  const button = (label) => {
    const node = el('button', { type: 'button' });
    node.textContent = label;
    node.addEventListener('click', () => log.clicks.push(label));
    return node;
  };
  const component = (tag, name, valid = true) => {
    const node = el(tag, { formcontrolname: name });
    setValid(node, valid);
    return node;
  };

  const formElement = el('form');
  document.body.append(formElement);

  // 상품명 — 치면 AI 추천 카테고리가 뜬다.
  const name = component('product-form-product-name', 'name', false);
  name.append(textbox());
  const nameInput = name.querySelector('input');
  const recommend = el('div', { class: 'box_recommcate', hidden: '' }, '<ul class="list_cate"><li>완구/장난감/교구>교육/학습완구>클레이</li></ul>');
  const choose = button('선택');
  choose.className = 'btn_choice';
  recommend.querySelector('li').append(choose);
  nameInput.addEventListener('input', () => {
    setValid(name, Boolean(nameInput.value));
    setTimeout(() => recommend.removeAttribute('hidden'), 30);
  });

  // 카테고리 — 네 단계. 고르면 다음 단계가 열린다. 마지막 단계에서 원산지 · 인증 목록이 생긴다.
  const category = component('product-form-store-product-category', 'categoryId', false);
  const levelNames = [['프린터/PC주변/사무기기', '완구/장난감/교구'], ['교육/학습완구', '퍼즐/감각발달완구'], ['클레이', '촉감인형'], []];
  const levels = levelNames.map((options, index) => {
    const item = el('lib-form-cascading-item');
    if (index > 0) item.classList.add('cascading-item-disabled');
    const box = dropdown(['대분류', '중분류', '소분류', '세분류'][index], index === 0 ? options : [], (label) => {
      const next = levels[index + 1];
      if (next && levelNames[index + 1].length > 0) {
        next.item.classList.remove('cascading-item-disabled');
        next.box.setOptions(levelNames[index + 1]);
      }
      if (label === '클레이' || label === '촉감인형') {
        levels[3].box.show('세분류 카테고리 없음');
        setValid(category, true);
        categoryChosen();
      }
    });
    item.append(box);
    category.append(item);
    return { item, box };
  });
  category.append(recommend);
  choose.addEventListener('click', () => {
    levels[0].box.show('완구/장난감/교구');
    levels[1].box.show('교육/학습완구');
    levels[2].box.show('클레이');
    levels[3].box.show('세분류 카테고리 없음');
    setValid(category, true);
    categoryChosen();
  });

  // 원산지 — 구분 → 지역 → 나라. 뒤 목록은 앞을 고르기 전에는 숨어 있다.
  const origin = component('product-form-product-origin-area-info', 'productOriginAreaInfo', false);
  let resetPending = originResetsOnce;
  const originBoxes = [];
  const resetOrigin = () => {
    originBoxes[0].show('원산지 선택');
    for (const box of originBoxes.slice(1)) {
      box.setAttribute('hidden', '');
      box.setOptions([]);
      box.show('상세지역선택');
    }
    setValid(origin, false);
  };
  originBoxes.push(dropdown('원산지 선택', [], (label) => {
    originBoxes[1].removeAttribute('hidden');
    originBoxes[1].setOptions(label === '수입산' ? ['상세지역선택', '아시아', '유럽'] : []);
    // 카테고리 정보가 늦게 도착해 화면이 원산지를 다시 그린다(라이브 2026-09-18).
    if (resetPending) {
      resetPending = false;
      setTimeout(resetOrigin, 100);
    }
  }));
  originBoxes.push(dropdown('상세지역선택', [], (label) => {
    originBoxes[2].removeAttribute('hidden');
    originBoxes[2].setOptions(label === '아시아' ? ['상세지역선택', '대만', '중국'] : []);
  }));
  originBoxes.push(dropdown('상세지역선택', [], () => setValid(origin, true)));
  originBoxes[1].setAttribute('hidden', '');
  originBoxes[2].setAttribute('hidden', '');
  origin.append(...originBoxes);

  // 인증 — 목록에서 고르면 줄이 생기고 목록은 '선택' 으로 돌아간다.
  const certs = component('product-form-certs', 'certs');
  const certBox = dropdown('선택', [], (label, box) => {
    box.show('선택');
    const row = el('lib-form-cert-item');
    row.append(textbox());
    const lookup = button('인증번호확인');
    row.append(lookup);
    row.append(textbox());
    const [numberInput, modelInput] = row.querySelectorAll('input');
    lookup.addEventListener('click', () => {
      log.lookups.push({ type: label, number: numberInput.value });
      setTimeout(() => {
        if (numberInput.value === 'CB065R1010-26001') {
          modelInput.value = '주물럭';
          return;
        }
        const popup = el('div', { class: '_cu-popup-anim' }, '<p>인증정보를 확인할 수 없습니다.</p>');
        const close = button('닫기');
        close.addEventListener('click', () => popup.remove());
        popup.append(close);
        document.body.append(popup);
      }, 50);
    });
    certs.append(row);
  });
  certs.append(certBox);

  const categoryChosen = () => {
    originBoxes[0].setOptions(['원산지 선택', '국내산', '수입산', '혼합', '기타']);
    certBox.setOptions(['선택', '[생활용품] 안전확인', '[어린이제품] 안전확인']);
  };

  // 가격 · 톡딜(안에 숨은 `stock` 이 먼저 나온다) · 재고.
  const price = component('product-form-sale-price', 'salePrice');
  price.append(textbox());
  const groupDiscount = component('product-form-group-discount', 'groupDiscount');
  const hiddenStock = textbox();
  hiddenStock.setAttribute('formcontrolname', 'stock');
  hiddenStock.setAttribute('hidden', '');
  groupDiscount.append(hiddenStock);
  const stock = component('product-form-store-stock-quantity', 'stock');
  stock.append(textbox());

  // 상품이미지 — 대표 한 칸 + 추가 다섯 칸. 파일을 넣으면 화면이 올리고 썸네일을 그린다.
  const images = component('product-form-product-image', 'productImage', false);
  const card = (className) => {
    const node = el('div', { class: className }, '<input type="file" accept=".png,.jpg,.jpeg">');
    const input = node.querySelector('input');
    Object.defineProperty(input, 'files', {
      configurable: true,
      get() { return this._files || []; },
      set(value) { this._files = value; },
    });
    input.addEventListener('change', () => {
      const file = input.files[0];
      log.uploads.push({ name: file.name, type: file.type });
      setTimeout(() => {
        node.append(el('img', { src: `https://st.kakaocdn.net/thumb/R750x0/${log.uploads.length}` }));
        setValid(images, true);
      }, 30);
    });
    return node;
  };
  const rep = el('div', { class: 'box_img_register' });
  rep.append(card('card-register'));
  const extras = el('div', { class: 'cdk-drop-list inner-row' });
  for (let i = 0; i < 5; i += 1) extras.append(card('cdk-drag card-register'));
  images.append(rep, extras);

  const detail = component('product-form-product-detail-description', 'productDetailDescription', false);
  window.CKEDITOR = {
    instances: {
      editor1: {
        data: '',
        setData(html, options) {
          this.data = html;
          setTimeout(() => options?.callback?.(), 10);
        },
        fire(name) {
          if (name === 'change') setValid(detail, Boolean(this.data));
        },
      },
    },
  };

  // 상품정보고시 — 설정 창. 상품군을 고르면 줄이 그려진다. [확인] 은 줄마다 값이나 참조 체크가 있어야 닫힌다.
  const notice = component('product-form-announcement-info', 'announcementInfo', false);
  notice.append(textbox());
  notice.querySelector('input').value = '설정 안함';
  const openNotice = button('상품정보고시 설정');
  notice.append(openNotice);
  const layer = el('div', { class: '_cu-popup-anim', hidden: '' }, '<strong>상품정보고시 설정</strong><div class="rows"></div>');
  const template = dropdown('선택된 템플릿이 없습니다', ['선택된 템플릿이 없습니다', '어린이제품-완구', '기타 재화-문구']);
  const group = dropdown('상품군을 선택해주세요', ['상품군을 선택해주세요', '의류', '어린이제품'], () => {
    const rows = layer.querySelector('.rows');
    rows.innerHTML = '';
    for (const label of NOTICE_LABELS) {
      const row = el('div', { class: 'grid-row field-row' }, `<strong class="tit-field">${label} <span class="txt-require">*<span class="screen_out">필수입력</span></span></strong>`);
      row.append(textbox());
      row.append(el('cu-checkbox', {}, '<label><input type="checkbox"> 상품상세설명 참조</label>'));
      rows.append(row);
    }
  });
  const cancel = button('취소');
  const apply = button('확인');
  layer.prepend(template, group);
  layer.append(cancel, apply);
  document.body.append(layer);
  openNotice.addEventListener('click', () => layer.removeAttribute('hidden'));
  cancel.addEventListener('click', () => layer.setAttribute('hidden', ''));
  apply.addEventListener('click', () => {
    const rows = [...layer.querySelectorAll('.field-row')];
    const empty = rows.filter((row) => !row.querySelector('cu-checkbox input').checked && !row.querySelector('cu-textbox input').value);
    if (rows.length === 0 || empty.length > 0) return;
    layer.setAttribute('hidden', '');
    notice.querySelector('input').value = '어린이제품';
    setValid(notice, true);
  });

  const delivery = component('product-form-store-delivery', 'delivery');
  delivery.append(dropdown('배송비 템플릿을 선택하세요.', ['배송비 템플릿을 선택하세요.', '기본 배송 탬플릿', '무료배송']));
  const brand = component('product-form-brand', 'brand');
  brand.append(textbox());
  const maker = component('product-form-manufacturer', 'manufacturer');
  maker.append(textbox());
  const code = component('product-form-seller-model-number', 'storeManagementCode');
  code.append(textbox());
  const affiliate = component('product-form-affiliate', 'affiliate');
  affiliate.append(el('label', {}, '<input type="checkbox" checked> 추천 구매시 리워드'));

  formElement.append(name, category, origin, certs, price, groupDiscount, stock, images, detail, notice, delivery, brand, maker, code, affiliate);
  const footer = el('div', { class: 'footer' });
  footer.append(button('취소'), button('상품정보 임시저장'), button('저장하기'));
  document.body.append(footer);

  window.fetch = async (url, init = {}) => {
    const text = String(url);
    const categoryId = (text.match(/\/api\/tstore\/categories\/(\d+)$/) || [])[1];
    if (categoryId) {
      log.categoryFetches.push(categoryId);
      const found = CATEGORY_NAMES[categoryId];
      return { ok: Boolean(found), status: found ? 200 : 404, json: async () => ({ id: categoryId, name: found }) };
    }
    if (text === '/api/tstore/images' && init.method === 'POST') {
      log.editorUploads.push({ type: init.body.get('type'), ratio: init.body.get('ratio'), file: init.body.get('image[]')?.name });
      return {
        ok: true,
        status: 200,
        json: async () => [{ result: 'SUCCESS', data: { originUrl: 'https://st.kakaocdn.net/shoppingstore/editor/detail.jpg' } }],
      };
    }
    throw new Error(`unexpected fetch ${text}`);
  };

  const q = (selector) => document.querySelector(selector);
  return {
    dom, window, document, log, q,
    shown: (root) => [...root.querySelectorAll('a.link-selected')].map((link) => link.textContent),
    parts: { name, category, origin, certs, price, stock, hiddenStock, images, detail, notice, layer, delivery, brand, maker, affiliate },
  };
}

async function runKakaoFill(page, payloadOverrides = {}) {
  const { pageFunctions } = loadModule();
  const fill = page.window.eval(`(${pageFunctions.fillKakaoProductForm.toString()})`);
  return fill({
    form: kakaoForm(),
    images: [
      { name: 'kakao0', dataUrl: 'data:image/jpeg;base64,AAEC', fileName: 'rep.jpg' },
      { name: 'kakao1', dataUrl: 'data:image/jpeg;base64,AAED', fileName: 'extra1' },
    ],
    maxImages: 6,
    formWaitMs: 1500,
    stepWaitMs: 800,
    detailImage: { name: 'detail', dataUrl: 'data:image/jpeg;base64,DETAIL', fileName: 'wing-server-jpeg-v1-780.jpg' },
    detailHtml: '',
    ...payloadOverrides,
  });
}

test('⭐ 칸을 사람 순서대로 채워 폼의 칸 상태가 전부 받아들여진다 — 저장은 누르지 않는다', async () => {
  const page = makeKakaoPage();
  const result = await runKakaoFill(page);
  const { parts, log, shown } = page;

  assert.equal(result.ok, true, result.error);
  assert.deepEqual(plain(result.warnings), []);
  assert.equal(result.submitted, false);
  assert.ok(result.steps.includes('필수 칸 확인'), result.steps.join(' / '));

  assert.equal(parts.name.querySelector('input').value, '포도 설기 말랑이 1p 주물럭 슬랑이 스트레스볼 찐득볼');
  // 카테고리 이름은 카테고리 API 가 안다. 맨 앞 세 자리(대대분류)는 묻지 않는다.
  assert.deepEqual(log.categoryFetches, ['102106', '102106101', '102106101109']);
  assert.deepEqual(shown(parts.category).slice(0, 3), ['완구/장난감/교구', '교육/학습완구', '클레이']);
  assert.deepEqual(shown(parts.origin), ['수입산', '아시아', '중국']);
  const [numberInput, modelInput] = parts.certs.querySelectorAll('lib-form-cert-item input');
  assert.equal(numberInput.value, 'CB065R1010-26001');
  assert.equal(modelInput.value, '주물럭');
  assert.deepEqual(log.lookups, [{ type: '[어린이제품] 안전확인', number: 'CB065R1010-26001' }]);
  assert.equal(parts.price.querySelector('input').value, '2850');
  // 톡딜 할인 안에 숨은 같은 이름(`stock`) 칸이 아니라 폼 맨 위 재고 칸이다.
  assert.equal(parts.stock.querySelector('input').value, '999');
  assert.equal(parts.hiddenStock.querySelector('input').value, '');
  assert.deepEqual(log.uploads.map((upload) => upload.name), ['rep.jpg', 'extra1.jpg']);
  assert.equal(parts.images.querySelector('.box_img_register img') !== null, true, '첫 사진은 대표 칸');
  assert.deepEqual(log.editorUploads, [{ type: 'EDITOR', ratio: 'NONE', file: 'wing-server-jpeg-v1-780.jpg' }]);
  assert.equal(page.window.CKEDITOR.instances.editor1.data, '<center><img src="https://st.kakaocdn.net/shoppingstore/editor/detail.jpg"></center>');

  // 고시: 값이 있는 줄은 참조 체크를 풀고 치고, 없는 줄은 참조를 체크한다.
  assert.equal(parts.notice.querySelector('input').value, '어린이제품');
  const rows = Object.fromEntries([...parts.layer.querySelectorAll('.field-row')].map((row) => [
    row.querySelector('strong').childNodes[0].textContent.trim(),
    { value: row.querySelector('cu-textbox input').value, refer: row.querySelector('cu-checkbox input').checked },
  ]));
  assert.deepEqual(rows['품명 및 모델명'], { value: '4500포도설기말랑이', refer: false });
  assert.deepEqual(rows['사용연령 또는 권장사용연령'], { value: '8세 이상', refer: false });
  assert.deepEqual(rows['취급방법 및 취급시 주의사항, 안전표시 (주의, 경고 등)'], { value: '1. 용도 이외에 사용하지 마십시오.', refer: false });
  assert.deepEqual(rows['크기ㆍ체중의 한계'], { value: '', refer: true });
  assert.deepEqual(rows['품질보증기준'], { value: '', refer: true });

  assert.deepEqual(shown(parts.delivery), ['기본 배송 탬플릿']);
  assert.equal(parts.brand.querySelector('input').value, 'kiditem');
  assert.equal(parts.maker.querySelector('input').value, '해피프랜즈');
  assert.equal(parts.affiliate.querySelector('input').checked, false);
  // 누른 단추는 창 여는 단추 · KC 조회 · 고시 창 [확인] 뿐이다.
  assert.deepEqual(log.clicks, ['인증번호확인', '상품정보고시 설정', '확인']);
});

test('⭐ 카테고리 코드가 없으면 상품명을 치면 뜨는 톡스토어 AI 추천 카테고리의 [선택] 을 누른다', async () => {
  const page = makeKakaoPage();
  const result = await runKakaoFill(page, { form: kakaoForm({ categoryId: '' }) });
  assert.equal(result.ok, true, result.error);
  assert.ok(result.steps.includes('카테고리(톡스토어 AI 추천) 완구/장난감/교구>교육/학습완구>클레이'), result.steps.join(' / '));
  assert.deepEqual(page.log.categoryFetches, []);
  assert.equal(page.parts.category.classList.contains('ng-valid'), true);
});

test('⭐ 카테고리를 고른 뒤 화면이 원산지를 다시 그리면(늦게 온 카테고리 정보) 한 번 더 고른다', async () => {
  const page = makeKakaoPage({ originResetsOnce: true });
  const result = await runKakaoFill(page);
  assert.ok(result.steps.includes('원산지 수입산 > 아시아 > 중국'), `${result.steps.join(' / ')} | ${result.warnings.join(' / ')}`);
  assert.deepEqual(page.shown(page.parts.origin), ['수입산', '아시아', '중국']);
});

test('KC 조회가 안 되면 화면이 한 말을 싣고, 그 안내 창은 닫기로 닫는다', async () => {
  const page = makeKakaoPage();
  const result = await runKakaoFill(page, { form: kakaoForm({ cert: { type: '[어린이제품] 안전확인', number: 'CB000X0000-00000' } }) });
  assert.equal(result.ok, true);
  assert.ok(result.warnings.some((warning) => /조회 결과를 받지 못했습니다: 인증정보를 확인할 수 없습니다/.test(warning)), result.warnings.join(' / '));
  assert.equal(page.document.querySelectorAll('div._cu-popup-anim:not([hidden])').length, 0);
  assert.ok(!page.log.clicks.includes('저장하기'));
});

test('고를 수 없는 배송 템플릿 · 채우지 못한 칸은 이름을 대어 알린다', async () => {
  const page = makeKakaoPage();
  const result = await runKakaoFill(page, {
    form: kakaoForm({ deliveryTemplate: '없는 템플릿' }),
    images: [],
    detailImage: null,
  });
  assert.equal(result.ok, true);
  assert.ok(result.warnings.includes("배송비 템플릿 '없는 템플릿' 을 찾지 못했습니다. 배송비를 확인하세요."));
  assert.ok(result.warnings.includes('상품이미지가 없습니다. 대표이미지를 직접 넣으세요.'));
  assert.ok(result.warnings.includes('아직 화면이 받지 않은 칸: 상품이미지, 상품상세'), result.warnings.join(' / '));
});

test('로그인 화면이면 폼이 없다고 돌려준다', async () => {
  const page = makeKakaoPage({ loginPage: true });
  const result = await runKakaoFill(page);
  assert.equal(result.ok, false);
  assert.equal(result.noForm, true);
});

test('페이지 함수가 누르는 단추는 정해져 있다 — [저장하기] · [상품정보 임시저장] 은 없다', () => {
  const { pageFunctions } = loadModule();
  const source = pageFunctions.fillKakaoProductForm.toString();
  const pressed = [...source.matchAll(/buttonIn\(([^,]+),\s*"([^"]+)"\)/g)].map(([, root, label]) => `${root.trim()}:${label}`);
  assert.deepEqual([...new Set(pressed)].sort(), [
    'added:인증번호확인',
    'control("announcementInfo"):상품정보고시 설정',
    'layer:취소',
    'layer:확인',
    'popup:닫기',
    'popup:취소',
  ]);
  assert.ok(!/저장하기"|임시저장"/.test(source));
});
