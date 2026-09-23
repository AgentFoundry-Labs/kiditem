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
  vm.runInContext(readFileSync(path.join(repoRoot, 'extensions/kiditem-os/shared/mall-form-submit-gate.js'), 'utf8'), context);
  vm.runInContext(readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
  return context.self.KidItemMallFormRegister;
}

/**
 * 올웨이즈.
 *
 * 폼이 없는 React 화면이라 전부 선택자로 잡는다. 값도 프로토타입 setter 로 넣어야
 * React 가 알아챈다 — 그냥 `el.value =` 로는 화면에만 보이고 제출 때 빈 값이 간다.
 */
test('폼이 없는 화면이라 body 를 기준점으로 쓴다', () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS.always.formSelector, 'body');
  assert.deepEqual(Array.from(SPECS.always.imageSlots), []);
});

test('이름 있는 칸이 하나뿐이라 선택자로 잡는다', () => {
  const { SPECS } = loadModule();
  const keys = SPECS.always.selectorFields.map((f) => f.key);
  assert.deepEqual(Array.from(keys), [
    'productName', 'optionName', 'optionDetail',
    'individualPrice', 'teamPrice', 'keyword', 'shippingCompany',
  ]);
});

test('분류는 검색해서 고른다 — 요청이 나가지 않는다', () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS.always.categorySearch.inputSelector, '#category-search-input');
  assert.equal(SPECS.always.categorySearch.optionSelector, 'button');
});

test('이미지 칸 셋을 화면 순서로 잡는다', () => {
  const { SPECS } = loadModule();
  assert.deepEqual(
    Array.from(SPECS.always.imageFileInputs.map((s) => s.key)),
    ['representative', 'additional', 'detail'],
  );
  // 위지윅 에디터가 없다. 상세설명도 이미지 파일이라 편집기 설정이 없어야 한다.
  assert.equal(SPECS.always.detailRich, undefined);
  assert.equal(SPECS.always.detailSelfUpload, undefined);
});

test('값은 프로토타입 setter 로 넣는다 — React 가 알아채야 한다', () => {
  // `el.value = v` 만 하면 화면엔 글자가 보여도 React 는 모르고 제출 때 빈 값이 간다.
  const source = readFileSync(modulePath, 'utf8');
  assert.ok(/Object\.getOwnPropertyDescriptor\(proto, "value"\)\?\.set/.test(source));
  assert.ok(/function assign\(el, value\)/.test(source));
});

test('제출하지 않는다 — 승인이 붙는 몰이다', () => {
  const source = readFileSync(modulePath, 'utf8');
  assert.ok(/submitted: false/.test(source));
});
