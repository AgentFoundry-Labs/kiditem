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
 * 11번가 신규 상품등록(셀러오피스 Vue 화면).
 *
 * 사이드바의 `상품등록`(옛 테이블 폼)과 `신규상품 등록`(이 화면)은 필드가 전혀
 * 다르다. 온채널에서 신규≠수정으로 한 번 헛돌았던 자리라 여기서 못 박는다.
 */
test('폼이 iframe 안이라 모든 프레임에 넣는다', () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS['11st'].allFrames, true);
  assert.equal(SPECS['11st'].formSelector, '#app.l-content--product');
  assert.equal(SPECS['11st'].origin, 'https://soffice.11st.co.kr');
  // 메뉴 번호까지 건다. `/view/` 로만 두면 아무 메뉴에나 값을 넣을 수 있다.
  assert.equal(SPECS['11st'].pathPrefix, '/view/123124025');
});

test('분류를 맨 앞에서 끝낸다 — 고시 블록의 방아쇠다', () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS['11st'].categoryFirst, true);
});

test('분류 검색은 첫 낱말로 하고 공백 없는 경로로 맞춘다', () => {
  const { SPECS } = loadModule();
  const s = SPECS['11st'].categorySearch;
  // 라이브 실측: `기능성 팬시` → 0건, `팬시` → 20건.
  assert.equal(s.queryFirstWord, true);
  // 결과 버튼 글자가 `문구/사무용품>디자인/팬시용품>기능성 팬시` 다. 올웨이즈와 다르다.
  assert.equal(s.joiner, '>');
  assert.equal(s.optionSelector, '#section-category .c-dropdown li button');
});

test('해시가 붙는 이름 대신 블록 id + 행 제목으로 잡는다', () => {
  const { SPECS } = loadModule();
  const spec = SPECS['11st'];
  // 라디오 이름이 `nameRadio17207` 처럼 런타임 해시라 스펙 어디에도 있으면 안 된다.
  assert.doesNotMatch(JSON.stringify(spec), /nameRadio/);
  const keys = spec.rowFields.map((f) => f.key);
  assert.deepEqual(Array.from(keys), [
    'productName', 'promoText', 'salePrice', 'consumerPrice', 'stock', 'sellerPrdCd',
  ]);
  for (const f of spec.rowFields) assert.match(f.section, /^section-/);
});

test('값이 계정마다 다른 목록은 보이는 글자로 고른다', () => {
  const { SPECS } = loadModule();
  const keys = SPECS['11st'].rowOptions.map((o) => o.key);
  assert.deepEqual(Array.from(keys), ['salePeriod', 'deliveryTemplate']);
});

/**
 * 이미지가 무너졌던 자리 둘.
 *
 * 1) 파일 칸이 화면에 없다. `+` 를 눌러야 뜨는 창 안에 있고 창 id 가 매번 다르다.
 * 2) `추가이미지` 로 시작하는 줄이 둘이라(라디오 줄 / 사진 줄) 제목만 보면
 *    `+` 없는 줄을 집는다.
 * 둘 다 라이브에서 직접 겪었다(2026-09-10).
 */
test('이미지는 창을 열어서 넣는다 — 화면에 파일 칸이 없다', () => {
  const { SPECS } = loadModule();
  const spec = SPECS['11st'];
  assert.equal(spec.imageFileInputs, undefined, '화면에 붙은 파일 칸으로는 못 넣는다');
  const keys = spec.imageDialogs.map((s) => s.key);
  assert.deepEqual(Array.from(keys), ['representative', 'additional']);
  for (const slot of spec.imageDialogs) assert.equal(slot.section, 'section-image');
});

test("'+' 가 있는 줄만 고른다 — 같은 제목의 줄이 둘이다", () => {
  const { pageFunctions } = loadModule();
  const src = pageFunctions.fillMallProductForm.toString();
  assert.match(src, /startsWith\(want\) && el\.querySelector\("button\.c-addimg__btn-add"\)/);
});

/**
 * 이미지는 분류에 걸려 있다.
 *
 * 분류 전에 `+` 를 누르면 몰이 '카테고리를 먼저 선택해주세요.' 를 **네이티브
 * alert** 으로 띄운다 — 그대로 두면 화면이 통째로 멈춘다(라이브 확인 2026-09-10).
 * 그래서 분류가 먼저여야 하고, alert 은 채움 함수가 삼켜야 한다.
 */
test('분류가 이미지보다 먼저다', () => {
  const { SPECS, pageFunctions } = loadModule();
  assert.equal(SPECS['11st'].categoryFirst, true);
  const src = pageFunctions.fillMallProductForm.toString();
  assert.ok(
    src.indexOf('if (payload.categoryFirst) await runCategorySearch();') < src.indexOf('payload.imageDialogs'),
    '분류가 이미지보다 앞에 와야 한다',
  );
  assert.match(src, /window\.alert = \(message\)/, '몰 alert 을 삼켜야 화면이 안 멈춘다');
});

test('상세설명은 선택자로 넣고 올릴 곳을 갖는다', () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS['11st'].detailSelector, '#section-description textarea');
  assert.equal(SPECS['11st'].detailHost, 'kidsnote');
});

/**
 * 돈이 나가는 자리.
 *
 * 광고 블록에는 포커스클릭·리스팅광고가 있고 켜지면 셀러캐시에서 즉시 빠진다.
 * 스펙의 어떤 선택자도 그 블록을 가리켜서는 안 된다.
 */
test('광고 블록은 어떤 단계도 건드리지 않는다', () => {
  const { SPECS } = loadModule();
  const spec = SPECS['11st'];
  assert.equal(spec.forbiddenSelector, '#section-advertisement');
  const selectors = JSON.stringify({
    rowFields: spec.rowFields, rowOptions: spec.rowOptions,
    selectorFields: spec.selectorFields, selectorChecks: spec.selectorChecks,
    imageFileInputs: spec.imageFileInputs, categorySearch: spec.categorySearch,
    detailSelector: spec.detailSelector,
  });
  assert.doesNotMatch(selectors, /advertisement|section-benefit/);
});

/**
 * 분류 검색이 두 번 무너졌던 자리.
 *
 * 1) 띄어쓴 이름으로 검색하면 0건이라 첫 낱말만 넣어야 한다.
 * 2) 칸에 **포커스가 없으면** 결과가 만들어져도 목록이 접힌 채라
 *    `offsetParent` 가 null 이고 우리 가시성 검사에 걸러진다.
 * 둘 다 라이브에서 직접 겪은 실패다(2026-09-10).
 */
test('분류 검색은 포커스를 주고 결과를 기다린다', () => {
  const { pageFunctions } = loadModule();
  const src = pageFunctions.fillMallProductForm.toString();
  const fn = src.slice(src.indexOf('async function runCategorySearch'), src.indexOf('function findRowInput'));
  assert.match(fn, /box\.focus\(\)/, '포커스를 주지 않으면 목록이 접힌 채라 결과를 못 집는다');
  assert.match(fn, /queryFirstWord/, '띄어쓴 이름으로 검색하면 0건이다');
  // 고정 대기로는 갓 열린 화면에서 놓친다. 결과가 나올 때까지 다시 본다.
  assert.match(fn, /while \(Date\.now\(\) < deadline\)/, '결과를 폴링해야 한다');
});

test('폼이 없는 프레임의 응답은 실패로 올리지 않는다', () => {
  const { pageFunctions } = loadModule();
  // 모든 프레임에 넣으므로 대부분의 프레임은 '여기 아님'으로 돌아온다.
  assert.match(pageFunctions.fillMallProductForm.toString(), /noForm: true/);
});
