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
  vm.runInContext(readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
  return context.self.KidItemMallFormRegister;
}

/**
 * 보리보리(셀러클럽 · TRICYCLE).
 *
 * 실측 2026-09-11, 등록물 `435316017`(`킬러볼 스피너 키링 (1p) …`).
 * 백오피스에 **하프클럽과 보리보리가 같이 있고 화면은 하프클럽으로 열린다.**
 */

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
    fetch: async () => ({
      ok: true, status: 200,
      blob: async () => new Blob([new Uint8Array([1])], { type: 'image/jpeg' }),
    }),
    interactiveTabs: { createTab: async () => ({ id: 1 }) },
    tabReason: 'test',
  });
  return { api, calls };
}

const form = (overrides = {}) => ({
  url: 'https://seller-club.co.kr/product/productRegisterDetail',
  selectorFields: {
    site: '2',
    category1: '241', category2: '217009', category3: '217009001',
    md: '118003',
    name: '킬러볼스피너키링 (1p) 스핀 장난감 열쇠고리',
    listPrice: '3500', salePrice: '2410', marginRate: '18',
    optionName: '단품', optionValue: '단품',
  },
  radios: { dispYn: 'Y', outStockDispYn: 'N', refundYn: 'Y', piInfoYn: 'N' },
  imageGroups: { representative: [], additional: [] },
  detailUploads: [],
  manualSteps: [],
  ...overrides,
});

test('상품등록 주소만 받는다', () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS.boribori.origin, 'https://seller-club.co.kr');
  assert.equal(SPECS.boribori.pathPrefix, '/product/productRegister');
});

test('다른 몰 주소는 거절한다', async () => {
  const { api } = harness();
  await assert.rejects(
    () => api.register({ mall: 'boribori', form: form({ url: 'https://seller-club.co.kr/order/orderDeliList' }) }),
    /상품등록 주소가 아닙니다/,
  );
});

/**
 * ⭐⭐ 회귀(실측 2026-09-11): 화면이 **하프클럽으로 열린다.** 사이트를 보리보리로
 * 바꾸지 않으면 1단 분류가 패션 17개(여성의류…)라 우리 분류(`241 문구/팬시`)가
 * 목록에 **아예 없다.** 그래서 사이트가 분류보다 먼저여야 한다.
 */
test('⭐⭐ 사이트가 분류보다 먼저다 — 사이트가 분류 목록을 갈아치운다', () => {
  const { SPECS } = loadModule();
  const keys = SPECS.boribori.selectorFields.map((entry) => entry.key);
  assert.equal(keys[0], 'site', '사이트가 맨 처음이어야 한다');
  // ⚠️ vm 안에서 만들어진 배열이라 realm 이 달라 deepEqual 이 실패한다. 값으로 본다.
  assert.equal(keys.slice(0, 4).join(','), 'site,category1,category2,category3');
});

test('⭐ 분류는 계단식이라 단마다 기다린다 — 고정 없이 바로 넣으면 목록이 비어 있다', () => {
  const { SPECS } = loadModule();
  const byKey = Object.fromEntries(SPECS.boribori.selectorFields.map((e) => [e.key, e]));
  assert.ok(byKey.site.waitMs >= 2000, '사이트 뒤에 목록이 다시 그려진다');
  assert.ok(byKey.category1.waitMs >= 2000);
  assert.ok(byKey.category2.waitMs >= 2000);
  assert.equal(byKey.site.selector, '[name="siteCd"]');
  assert.equal(byKey.category1.selector, '[name="stdCtgrNo1"]');
});

/**
 * ⚠️ 칸이 `<form>` 밖에 있다. 라디오를 문서 전체에서 찾아야 해서 `formSelector` 를
 * 넓게 뒀는데, 그러면 '화면이 그려졌나' 를 그것으로 판단할 수 없다.
 */
test('⭐ 넓은 표식을 쓰되 화면 준비는 readySelector 로 본다', () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS.boribori.formSelector, 'body');
  assert.equal(SPECS.boribori.readySelector, '[name="siteCd"]');
  assert.ok(SPECS.boribori.formWaitMs >= 15000, '백오피스가 느리다');

  const source = readFileSync(modulePath, 'utf8');
  // 껍데기는 언제나 있다. 첫 탐색에서도 칸을 확인해야 기다림이 헛돌지 않는다.
  assert.ok(
    source.includes('if (payload.readySelector && !document.querySelector(payload.readySelector)) return null;'),
    '첫 탐색에서도 readySelector 를 봐야 한다',
  );
});

test('값을 그대로 실어 보낸다', async () => {
  const { api, calls } = harness();
  await api.register({ mall: 'boribori', form: form() });
  const [payload] = calls[0].args;
  assert.equal(payload.selectorFieldValues.site, '2');
  assert.equal(payload.selectorFieldValues.category1, '241');
  assert.equal(payload.selectorFieldValues.name, '킬러볼스피너키링 (1p) 스핀 장난감 열쇠고리');
  assert.equal(payload.radios.dispYn, 'Y');
  assert.equal(payload.radios.outStockDispYn, 'N');
});

test('이미지를 File 로 실어 보낸다 — 대표와 추가가 칸이 다르다', async () => {
  const { SPECS } = loadModule();
  const slots = SPECS.boribori.imageFileInputs.map((s) => s.key);
  assert.equal(slots.join(','), 'representative,additional');
  assert.equal(SPECS.boribori.imageFileInputs[0].selector, 'input[name="uploadImgMain"]');

  const { api, calls } = harness();
  await api.register({
    mall: 'boribori',
    form: form({
      imageGroups: {
        representative: ['https://cdn.example.com/rep.jpg'],
        additional: ['https://cdn.example.com/a1.jpg', 'https://cdn.example.com/a2.jpg'],
      },
    }),
  });
  const [payload] = calls[0].args;
  assert.equal(payload.imageGroups.representative.length, 1);
  assert.equal(payload.imageGroups.additional.length, 2);
  assert.ok(payload.imageGroups.representative[0].dataUrl.startsWith('data:'));
});

/**
 * 등록이 네 단계(코드생성 → 상품정보생성 → 상세정보 → 승인요청)다. 상세설명 칸은
 * 저장 뒤에야 생기므로 **이번 회차에 넣을 곳이 없다.** 남의 몰(키즈노트) 호스팅에
 * 미리 올려 둘 이유도 없다 — ESM 에서 그 의존 때문에 등록이 통째로 막혔다.
 */
test('⭐ 상세설명 호스팅에 기대지 않는다 — 칸이 저장 뒤에 생긴다', () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS.boribori.detailHost, undefined);
  assert.equal(SPECS.boribori.detailSmartEditor, undefined);
  assert.equal(SPECS.boribori.detailRich, undefined);
});

test('배송은 건드리지 않는다 — 템플릿 하나에 다 묶여 있다', () => {
  const { SPECS } = loadModule();
  for (const entry of SPECS.boribori.selectorFields) {
    assert.ok(!/dlvTmpl|rtrn/i.test(entry.selector), `${entry.key} 가 배송을 건드린다`);
  }
});

test('⭐ 제출하지 않는다 — 저장·상세정보·승인요청이 남아 있다', async () => {
  const { api } = harness();
  const result = await api.register({ mall: 'boribori', form: form() });
  assert.equal(result.submitted, false);
  assert.equal(result.ok, true);
});

/**
 * ⚠️⚠️ 회귀(라이브 2026-09-11, 사장님 화면): **담당MD 칸이 `disabled`** 였는데
 * 값을 넣고 '채웠다' 고 보고했다. 잠긴 칸에 넣으면 아무 일도 안 일어난다.
 * 필수 칸이 빈 채로 남아 사장님 눈에는 **거기서 멈춘 것처럼** 보였다.
 */
test('⭐⭐ 잠긴 칸은 조용히 지나가지 않는다 — 못 넣었으면 못 넣었다고 말한다', () => {
  const source = readFileSync(modulePath, 'utf8');
  assert.ok(
    source.includes('if (el.disabled) {'),
    'disabled 칸을 확인해야 한다',
  );
  assert.ok(
    source.includes('칸이 잠겨 있어 넣지 못했습니다'),
    '못 넣은 이유를 말해야 한다',
  );
});

/**
 * ⚠️ 업체상품코드는 **우리가 정하는 코드**다. 몰이 주는 `상품코드` 는 등록할 때
 * 자동 발급된다. 둘을 헷갈려 이 칸을 안 채웠더니 필수 칸이 비어 막혔다.
 */
test('⭐⭐ 업체상품코드 칸을 채운다 — 필수인데 빠져 있었다', () => {
  const { SPECS } = loadModule();
  const byKey = Object.fromEntries(SPECS.boribori.selectorFields.map((e) => [e.key, e]));
  assert.equal(byKey.sellerCode.selector, '[name="prdCd"]');
  assert.equal(byKey.sellerCode.label, '업체상품코드');
});
