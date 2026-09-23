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
 * 키드키즈 스토어 파트너센터(`partner.kidkids.net`).
 *
 * 실측 2026-09-14, 목록 3,478개 + 최근 등록물 60개. 칸 이름은 다 있지만 분류가 계단식,
 * 공정위 고시가 `gs_id` 로 그려지는 동적 줄(이름이 전부 `spec_contents`), 상세설명이
 * TinyMCE 3 이다.
 */

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
      return {
        ok: true, status: 200,
        blob: async () => new Blob([new Uint8Array([1])], { type: 'image/jpeg' }),
      };
    },
    interactiveTabs: { createTab: async () => ({ id: 1 }) },
    tabReason: 'test',
  });
  return { api, calls, fetched };
}

const form = (overrides = {}) => ({
  url: 'https://partner.kidkids.net/sales/goods_reg_renewal.htm',
  fields: { goods_name: '[키드아이템] 애니멀 회전 주사위 키링 1p', sales_price: '2220', supplier_price: '1776' },
  radios: { tax_type: 'A', kc_view: 'N' },
  selectorFields: { category1: '5', category2: '359', category3: '2556', noticeGroup: '54' },
  infoRows: { 373: '3500애니멀회전주사위키링', 377: '[키드키즈 고객센터 02-588-0115]' },
  imageGroups: {
    main: ['https://cdn.example.com/rep.jpg'],
    img2: ['https://cdn.example.com/a1.jpg'],
    img3: [], img4: [], img5: [],
  },
  detailHtmlTarget: 'goods_desc',
  detailUploads: [{ url: 'https://kiditem.diskn.com/abc' }],
  manualSteps: [],
  ...overrides,
});

const source = () => readFileSync(modulePath, 'utf8');

test('등록 폼 iframe 주소만 받는다', () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS.kidkids.origin, 'https://partner.kidkids.net');
  assert.equal(SPECS.kidkids.pathPrefix, '/sales/goods_reg_renewal.htm');
  assert.equal(SPECS.kidkids.formSelector, 'form[name="goods_form"]');
});

test('다른 화면 주소는 거절한다 — 목록·겉 껍데기에 값을 넣지 않는다', async () => {
  const { api } = harness();
  for (const url of [
    'https://partner.kidkids.net/sales/goods_list_renewal.htm',
    'https://partner.kidkids.net/new/pages/sales/goods_register.htm',
  ]) {
    await assert.rejects(() => api.register({ mall: 'kidkids', form: form({ url }) }), /상품등록 주소가 아닙니다/);
  }
});

test('⭐ 분류 세 단과 고시 분류는 목록이 올 때까지 기다리며 이 순서로 고른다', () => {
  const { SPECS } = loadModule();
  const entries = SPECS.kidkids.selectorFields;
  assert.equal(entries.map((entry) => entry.key).join(','), 'category1,category2,category3,noticeGroup');
  for (const entry of entries) assert.equal(entry.waitForOption, true, `${entry.key} 는 목록을 기다려야 한다`);
});

test('⭐ 고시 줄은 이름이 같아 info 속성으로 가려 넣는다 — 고시 분류를 고른 뒤에', async () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS.kidkids.infoRows.itemSelector, 'textarea.spec_contents');
  assert.equal(SPECS.kidkids.infoRows.attr, 'info');

  const { api, calls } = harness();
  await api.register({ mall: 'kidkids', form: form() });
  const [payload] = calls[0].args;
  assert.equal(payload.infoRows.attr, 'info');
  assert.equal(payload.infoRowValues['373'], '3500애니멀회전주사위키링');

  const code = source();
  const selectors = code.indexOf('// 5) 이름 없는 칸들.');
  const rows = code.indexOf('// 5-2) 고른 분류가 그려 주는 줄들.');
  assert.ok(selectors > 0 && rows > selectors, '고시 줄은 고시 분류를 고른 뒤에 채워야 한다');
});

test('이미지는 칸마다 한 장씩 파일 칸에 넣는다', async () => {
  const { SPECS } = loadModule();
  // vm 안에서 만든 배열이라 deepEqual 이 참조를 따진다. 글자로 비교한다.
  assert.equal(
    SPECS.kidkids.imageFileInputs.map((slot) => slot.selector).join('|'),
    ['goods_photo_new', 'goods_img_2', 'goods_img_3', 'goods_img_4', 'goods_img_5']
      .map((name) => `input[type="file"][name="${name}"]`).join('|'),
  );
  const { api, calls, fetched } = harness();
  await api.register({ mall: 'kidkids', form: form() });
  const [payload] = calls[0].args;
  assert.equal(payload.imageGroups.main.length, 1);
  assert.equal(payload.imageGroups.img2.length, 1);
  assert.equal(payload.imageGroups.img3, undefined);
  assert.ok(fetched.includes('https://cdn.example.com/rep.jpg'));
});

test('⭐ 상세설명은 TinyMCE 에 넣고 referrerpolicy 속성을 허용한다', async () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS.kidkids.detailRich.kind, 'tinymce');
  assert.equal(SPECS.kidkids.detailRich.editorId, 'goods_desc');
  assert.match(SPECS.kidkids.detailRich.validElements, /referrerpolicy/);

  const { api, calls } = harness();
  await api.register({ mall: 'kidkids', form: form() });
  const [payload] = calls[0].args;
  assert.equal(payload.detailHtmlTarget, 'goods_desc');
  assert.match(payload.detailHtml, /<center><img referrerpolicy="no-referrer" src="https:\/\/kiditem\.diskn\.com\/abc"><\/center>/);
  assert.ok(source().includes('editor.setContent(html);'));
});

/**
 * 키드키즈 상세 이미지는 키드키즈 서버에 올린다.
 *
 * 에디터 `이미지 삽입/편집` 창의 [...] 이 여는 업로드(`galery_ftp.htm`)다. 예전엔 키즈노트
 * 첨부 저장소에 올려 주소를 받았는데, 키즈노트 관리자가 로그아웃이면 키드키즈 상세가 통째로
 * 빠졌다 — 사장님 눈에는 "키드키즈를 채우는데 왜 키즈노트를 찾나" 였다(2026-09-14).
 */
test('⭐ 상세 이미지는 키드키즈 자체 업로드로 올린다 — 키즈노트를 찾지 않는다', async () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS.kidkids.detailHost, undefined);
  const upload = SPECS.kidkids.detailRich.upload;
  assert.equal(upload.endpoint, '/sales/js/tiny_mce/plugins/advimage/galery_ftp.htm?dirname=https://img.kidkids.net/upimage/');
  assert.equal(upload.field, 'upload');
  assert.equal(upload.fields.act, 'upload');

  const { api, calls, fetched } = harness();
  const result = await api.register({
    mall: 'kidkids',
    form: form({ detailUploads: [{ url: 'http://localhost:9000/kiditem/detail-page-images/o/r/render.jpg' }] }),
  });

  assert.ok(!fetched.some((url) => url.includes('kidsnote')), fetched.join(' / '));
  assert.ok(!result.warnings.some((warning) => warning.includes('키즈노트')), result.warnings.join(' / '));
  const [payload] = calls[0].args;
  // 올릴 파일은 서비스워커가 읽어 넘긴다. 화면에서 우리 저장소(localhost:9000)를 부르면 CORS 로 막힌다.
  assert.match(payload.detailImage.dataUrl, /^data:image\/jpeg;base64,/);
  assert.equal(payload.detailRich.upload.field, 'upload');
});

/** 업로드 창 응답(라이브 2026-09-14 실측을 줄인 것). 올리기 전 화면과 파일명 두 곳만 다르다. */
const galleryResponse = (fileName) => `
  <script language="JavaScript">
    function insertimg() {
      opener.document.forms[0].src.value = 'https://img.kidkids.net/upimage/${fileName}';
      window.close();
    }
    function viewimg() {
      fnev = 'https://img.kidkids.net/upimage//' + img.alt;
    }
    selected = -1;
    ${fileName ? 'insertimg();' : ''}
  </script>
  <form name="imgupload" method="post" action="./galery_ftp.htm?dirname=https://img.kidkids.net/upimage/${fileName}" enctype="multipart/form-data">`;

async function runKidkidsDetail({ response, detailHtml = '', detailImage = { name: 'detail', dataUrl: 'data:image/jpeg;base64,AAA', fileName: 'render.jpg' } }) {
  const { SPECS, pageFunctions } = loadModule();
  const content = [];
  const requests = [];
  const editor = {
    setContent: (html) => content.push(html),
    schema: { addValidElements: () => {} },
  };
  const context = {
    document: {
      querySelector: (selector) => (selector === 'form[name="goods_form"]'
        ? { querySelector: () => null, querySelectorAll: () => [], elements: [] }
        : null),
      querySelectorAll: () => [],
    },
    window: { alert: () => {}, tinyMCE: { get: (id) => (id === 'goods_desc' ? editor : null), triggerSave: () => {} } },
    fetch: async (url, init) => {
      requests.push({ url: String(url), fields: init.body.entries, method: init.method });
      return { ok: true, status: 200, text: async () => response };
    },
    FormData: class { constructor() { this.entries = []; } append(name, value) { this.entries.push([name, value?.name ?? value]); } },
    File: class { constructor(parts, name, options) { this.name = name; this.type = options?.type || ''; } },
    atob: (value) => value,
    Uint8Array,
    CSS: { escape: (value) => value },
    Event: class { constructor(type) { this.type = type; } },
    setTimeout, Promise, Date,
  };
  context.globalThis = context;
  vm.createContext(context);
  const fill = vm.runInContext(`(${pageFunctions.fillMallProductForm.toString()})`, context);
  const outcome = await fill({
    formSelector: 'form[name="goods_form"]',
    wizardSteps: [], dynamic: null, acceptRecommendation: null,
    groupInputs: [], groups: {}, selectorChecks: [], selectorCheckValues: {},
    selectorFields: [], selectorFieldValues: {},
    fields: {}, radios: {}, checks: {}, images: [],
    detailHtmlTarget: 'goods_desc',
    detailHtml,
    detailImage,
    detailSelfUpload: SPECS.kidkids.detailSelfUpload,
    detailRich: SPECS.kidkids.detailRich,
  });
  return { outcome, content, requests };
}

test('⭐ 업로드 응답에 실린 새 파일 주소로 에디터에 넣는다 — 올린 파일명으로 찾지 않는다', async () => {
  const { outcome, content, requests } = await runKidkidsDetail({
    response: galleryResponse('20260914131122_5918.jpg'),
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'POST');
  assert.ok(requests[0].url.endsWith('galery_ftp.htm?dirname=https://img.kidkids.net/upimage/'));
  assert.equal(
    requests[0].fields.map(([name, value]) => `${name}=${value}`).join('&'),
    'upload=render.jpg&act=upload&fname=',
  );
  assert.deepEqual(Array.from(content), ['<center><img src="https://img.kidkids.net/upimage/20260914131122_5918.jpg"></center>']);
  assert.ok(Array.from(outcome.steps).includes('상세이미지 몰 업로드'));
  assert.ok(Array.from(outcome.steps).includes('상세설명(에디터)'));
});

test('응답에 파일 주소가 없으면 기본 주소를 넣지 않고 이유를 말한다', async () => {
  // 올리기 전 화면과 같은 응답 — `…/upimage/'` 와 `…/upimage//' + img.alt` 만 있다.
  const { outcome, content } = await runKidkidsDetail({ response: galleryResponse('') });

  assert.deepEqual(Array.from(content), []);
  const warnings = Array.from(outcome.warnings);
  assert.ok(warnings.some((w) => w.includes('상세이미지를 몰에 올리지 못했습니다')), warnings.join(' / '));
  assert.ok(warnings.some((w) => w.includes('상세설명에 넣을 이미지를 만들지 못했습니다')), warnings.join(' / '));
});

test('업로드가 실패해도 이미 읽히는 주소가 있으면 그것으로 넣는다', async () => {
  const fallback = '<center><img referrerpolicy="no-referrer" src="https://kiditem.diskn.com/abc"></center>';
  const { content } = await runKidkidsDetail({ response: galleryResponse(''), detailHtml: fallback });

  assert.deepEqual(Array.from(content), [fallback]);
});

test('확장자 없는 파일명은 형식에 맞춰 붙여 올린다 — 서버가 확장자로 이름을 새로 짓는다', async () => {
  const { requests } = await runKidkidsDetail({
    response: galleryResponse('20260914131122_1.jpg'),
    detailImage: { name: 'detail', dataUrl: 'data:image/jpeg;base64,AAA', fileName: 'wing-server-jpeg-v1-780' },
  });

  assert.equal(requests[0].fields[0].join('='), 'upload=detail.jpg');
});

test('KC 라디오를 칸보다 먼저 누른다', () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS.kidkids.preRadios.join(','), 'kc_view');
});

test('제출하지 않는다', async () => {
  const { api } = harness();
  const result = await api.register({ mall: 'kidkids', form: form() });
  assert.equal(result.submitted, false);
  assert.ok(!/go_update\(/.test(source()), '등록 함수(go_update)를 부르지 않는다');
});

test('글자 수 표시가 keyup 으로만 바뀌는 화면이라 keyup 도 준다 — 키드키즈만', async () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS.kidkids.fireKeyup, true);
  for (const [mall, spec] of Object.entries(SPECS)) {
    if (mall !== 'kidkids') assert.ok(!spec.fireKeyup, `${mall} 는 keyup 을 주지 않는다`);
  }
  const { api, calls } = harness();
  await api.register({ mall: 'kidkids', form: form() });
  assert.equal(calls[0].args[0].fireKeyup, true);
});
