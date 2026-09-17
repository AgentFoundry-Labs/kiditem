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
  const context = {
    self: {}, console, URL, URLSearchParams, TextDecoder, TextEncoder,
    FormData, Blob, File, Promise, Date, setTimeout, clearTimeout,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
  return context.self.KidItemMallFormRegister;
}

/**
 * 아트공구(Cafe24).
 *
 * 세 폼 몰 중 가장 순하다 — 이미지를 주소로 넣어 업로드가 없고, 상세설명 호스팅을
 * 도매꾹과 공유한다. 대신 상품분류가 4단 이름 경로라 한 단씩 눌러 들어가야 한다.
 */
test('대표이미지는 파일로 올린다 — 주소로 넣으면 몰이 못 읽는다', () => {
  const { SPECS } = loadModule();
  const spec = SPECS.art09;
  // 주소로 넣는 길도 있지만 우리 산출물은 로컬이고 남의 호스팅은 핫링크에 걸린다.
  // 파일을 올리면 Cafe24 가 자기 서버에 네 크기를 만든다(라이브 확인 2026-09-10).
  assert.equal(spec.imageFileInput.selector, '#imageFiles');
  assert.equal(spec.imageUrlSlots, undefined);
  assert.equal(spec.detailHost, undefined);
});

test('상세설명도 몰이 자기 서버에 받는다', () => {
  const { SPECS } = loadModule();
  assert.deepEqual(
    Array.from(SPECS.art09.detailSelfUpload.editors),
    ['product_description', 'product_description_mobile'],
  );
});

test('분류는 이름으로 한 단씩 눌러 들어간 뒤 적용한다', () => {
  const { SPECS } = loadModule();
  const picker = SPECS.art09.categoryPicker;
  assert.equal(picker.itemSelector, 'li.category-item');
  assert.equal(picker.applyText, '적용');
  // 앞 단을 누르면 다음 칸이 채워진다. 기다리지 않으면 뒤 단이 비어 있다.
  assert.ok(picker.stepWaitMs >= 1000);
});

test('편집기 업로드 주소는 화면에서 읽는다 — 상점마다 다르다', () => {
  const source = readFileSync(modulePath, 'utf8');
  assert.ok(/filesManagerUploadURL/.test(source));
  // Froala 는 제출할 때 동기화하므로 숨은 textarea 도 직접 맞춘다.
  assert.ok(/editor\.\$oel\.val\(editor\.html\.get\(\)\)/.test(source));
});

test('제출하지 않는다 — 승인이 붙는 몰이다', () => {
  const source = readFileSync(modulePath, 'utf8');
  assert.ok(/submitted: false/.test(source));
});

/**
 * 상세설명 단계로 들어가는 문.
 *
 * 몰이 자기 서버에 받아 주는 경우(아트공구)는 주소를 미리 만들지 않아 넘겨줄
 * HTML 이 비어 있다. HTML 만 보고 막으면 그 몰은 이 단계가 통째로 건너뛰어져
 * **상세설명도, 편집기 탭 전환도 일어나지 않는다**(라이브에서 실제로 그랬다).
 */
async function runDetailStep({ detailHtml, detailImage }) {
  const { pageFunctions } = loadModule();
  const clicked = [];
  const editorSet = [];
  const editor = {
    html: { set: (h) => editorSet.push(h), get: () => editorSet[editorSet.length - 1] || '' },
    $oel: { val: () => {} },
    opts: { filesManagerUploadURL: '/upload', fileUploadParam: 'file' },
  };
  const context = {
    document: {
      querySelector: (selector) => {
        if (selector === '#eProductRegisterForm') {
          return { querySelector: () => null, querySelectorAll: () => [], elements: [] };
        }
        if (selector === 'a#nnedit') return { click: () => clicked.push('tab') };
        return null;
      },
      querySelectorAll: () => [],
    },
    window: { alert: () => {}, $Editor: { product_description: editor } },
    fetch: async () => ({ json: async () => ({ result: 'success', link: '/web/upload/NNEditor/x.jpg' }) }),
    FormData: class { append() {} },
    File: class { constructor() {} },
    atob: (v) => v,
    Uint8Array,
    CSS: { escape: (v) => v },
    Event: class { constructor(type) { this.type = type; } },
    Set, setTimeout, Promise, Date, Object, Array, String, Boolean, JSON,
  };
  context.globalThis = context;
  vm.createContext(context);
  const fill = vm.runInContext(`(${pageFunctions.fillMallProductForm.toString()})`, context);
  const outcome = await fill({
    formSelector: '#eProductRegisterForm',
    wizardSteps: [], dynamic: null, acceptRecommendation: null,
    groupInputs: [], groups: {}, selectorChecks: [], selectorCheckValues: {},
    selectorFields: [], selectorFieldValues: {},
    fields: {}, radios: {}, checks: {}, images: [],
    detailHtmlTarget: 'product_description',
    detailHtml,
    detailImage,
    detailSelfUpload: { editors: ['product_description'], tabSelector: 'a#nnedit' },
  });
  return { outcome, clicked, editorSet };
}

test('넘겨줄 HTML 이 없어도 올릴 이미지가 있으면 상세설명 단계로 들어간다', async () => {
  const { clicked, editorSet } = await runDetailStep({
    detailHtml: '',
    detailImage: { name: 'detail', dataUrl: 'data:image/jpeg;base64,AAA', fileName: 'd.jpg' },
  });

  // 편집기 탭을 먼저 연다 — 기본 탭에서는 편집기가 숨어 있어 빈 칸으로 보인다.
  assert.deepEqual(Array.from(clicked), ['tab']);
  assert.ok(editorSet[0].includes('/web/upload/NNEditor/x.jpg'));
});

test('넣을 것이 하나도 없으면 들어가지 않는다', async () => {
  const { clicked, editorSet } = await runDetailStep({ detailHtml: '', detailImage: null });

  assert.deepEqual(Array.from(clicked), []);
  assert.deepEqual(Array.from(editorSet), []);
});
