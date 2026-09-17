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
 * 떠리몰(샵바이 파트너어드민).
 *
 * 실측 2026-09-11, 등록물 `132154869`(야광 안테나 지시봉) 외 둘 + 목록 479개.
 * 폼이 다른 도메인 iframe 안의 React 앱이고 칸에 이름이 없다.
 */

const FORM_FRAME = 'https://partner-remote.shopby.co.kr/product/management/single/add?serviceType=PARTNER';

/** 프레임 기다리기 주입은 준비 표식(글자) 하나를, 채움 주입은 페이로드(객체)를 넘긴다. */
const isProbe = (call) => typeof call.args?.[0] === 'string';
const isFill = (call) => Boolean(call.args) && typeof call.args[0] === 'object';

function harness() {
  const module = loadModule();
  const calls = [];
  const api = module.create({
    chrome: {
      scripting: {
        executeScript: async (options) => {
          calls.push(options);
          // 프레임 기다리기는 프레임마다 주소·문서·준비 여부를 돌려준다.
          if (isProbe(options)) {
            return [
              { result: { href: 'https://partner.shopby.co.kr/product/add', doc: 1, ready: false } },
              { result: { href: FORM_FRAME, doc: 42, ready: true } },
            ];
          }
          // 채움은 겉 프레임에서 '여기 아님', 폼 프레임에서 성공.
          return [
            { result: { ok: false, noForm: true, error: '겉 프레임' } },
            { result: { ok: true, steps: [], warnings: [] } },
          ];
        },
      },
    },
    fetch: async () => ({
      ok: true, status: 200,
      blob: async () => new Blob([new Uint8Array([1])], { type: 'image/jpeg' }),
    }),
    interactiveTabs: { createTab: async () => ({ id: 7 }) },
    tabReason: 'test',
  });
  return { api, calls };
}

const form = (overrides = {}) => ({
  url: 'https://partner.shopby.co.kr/product/add',
  tableFields: { 상품명: '야광 안테나 지시봉 (24개) (업체별도 무료배송)', 판매가: '8000', 즉시할인: '2940', 재고수량: '999' },
  tableRadios: { '옵션 사용 여부': 'N', 인증정보: 'DETAIL_PAGE', 상품정보제공고시: 'USED' },
  tableSelects: { '배송 템플릿': '기본 - 배송비무료' },
  tablePicks: [
    { row: '담당자', query: '노영우', pick: '노영우(nogoon92)' },
    { row: '브랜드', pick: 'kiditem' },
  ],
  imageGroups: { main: [], additional: [], list: [] },
  detailUploads: [],
  manualSteps: [],
  ...overrides,
});

const source = () => readFileSync(modulePath, 'utf8');
const fillCall = (calls) => calls.find(isFill);

test('겉 등록 주소만 받는다 — 폼은 그 안 iframe 이다', async () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS.thirtymall.origin, 'https://partner.shopby.co.kr');
  assert.equal(SPECS.thirtymall.pathPrefix, '/product/add');
  const { api } = harness();
  await assert.rejects(
    () => api.register({ mall: 'thirtymall', form: form({ url: 'https://partner.shopby.co.kr/product/list' }) }),
    /상품등록 주소가 아닙니다/,
  );
});

/**
 * ⭐ 원격 주소(`partner-remote…/single/add`)를 바로 열면 칸이 하나도 안 그려진다(라이브
 * 실측 — 인증을 겉이 넘겨준다). 겉을 열고 모든 프레임에 넣되 일은 그 프레임에서만 한다.
 */
test('⭐ 모든 프레임에 넣고, 일은 폼 프레임에서만 한다', async () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS.thirtymall.allFrames, true);
  assert.equal(SPECS.thirtymall.frameUrlIncludes, '/product/management/single/add');
  assert.ok(
    source().includes('if (payload.frameUrlIncludes && !location.href.includes(payload.frameUrlIncludes)) {'),
    '폼이 없는 프레임은 바로 비켜야 한다 — 안 그러면 겉 프레임이 30초를 기다린다',
  );

  const { api, calls } = harness();
  const result = await api.register({ mall: 'thirtymall', form: form() });
  assert.equal(result.ok, true, '겉 프레임의 noForm 이 아니라 폼 프레임의 성공을 골라야 한다');
  const fill = fillCall(calls);
  assert.equal(fill.target.allFrames, true);
  assert.equal(fill.args[0].frameUrlIncludes, '/product/management/single/add');
});

/**
 * iframe 은 겉 로딩이 끝난 뒤에 붙고, 붙은 뒤에도 한 번 더 다시 붙는다(라이브 실측: 6.9초에
 * 붙고 10.7초에 다시). 칸이 그려진 같은 문서가 2초 동안 그대로일 때 넣는다.
 */
test('⭐ 채우기 전에 폼 프레임이 붙고 가라앉을 때까지 기다린다', async () => {
  const { api, calls } = harness();
  await api.register({ mall: 'thirtymall', form: form() });
  const probeAt = calls.findIndex((call) => isProbe(call) && call.target.allFrames);
  const fillAt = calls.findIndex(isFill);
  assert.ok(probeAt >= 0 && probeAt < fillAt, '프레임을 먼저 확인해야 한다');
  assert.ok(calls.filter(isProbe).length >= 3, '같은 문서가 두 번 연속 보여야 가라앉은 것이다');
  const code = source();
  assert.ok(code.includes('doc: performance.timeOrigin,'), '문서가 새로 떴는지는 timeOrigin 으로 본다');
  assert.ok(code.includes('steady = hit && hit.ready && hit.doc === lastDoc ? steady + 1 : 0;'));
});

/**
 * 채우는 도중에 폼 프레임이 새로 뜨면(토큰 갱신) 그 프레임의 답이 사라져 겉의 '여기 아님'만
 * 남는다. 가라앉기를 기다려 한 번만 다시 넣는다.
 */
test('폼 프레임의 답이 사라지면 가라앉은 뒤 한 번 더 넣는다', () => {
  assert.ok(source().includes('if (!outcome.ok && outcome.noForm && spec.frameUrlIncludes) {'));
});

test('칸이 생겨야 준비된 것이다 — 앱이 늦게 그린다', () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS.thirtymall.readySelector, 'input[data-cy="productName"]');
  assert.ok(SPECS.thirtymall.formWaitMs >= 20000);
});

/**
 * ⚠️ 회귀(라이브 2026-09-11): 껍데기(`body`)가 처음부터 있어서 기다림을 건너뛰었고, 칸이
 * 그려지기 전에 들어가 줄 제목을 하나도 못 찾았다(4초 만에 경고 17개). 준비 표식이 아직
 * 없으면 기다려야 한다.
 */
test('⚠️ 준비 표식이 생길 때까지 기다린다 — 껍데기만 보고 들어가지 않는다', () => {
  assert.ok(source().includes(
    'if (!form || (payload.readySelector && !document.querySelector(payload.readySelector))) {',
  ));
});

test('줄 제목 값들을 그대로 넘긴다', async () => {
  const { api, calls } = harness();
  await api.register({ mall: 'thirtymall', form: form() });
  const [payload] = fillCall(calls).args;
  assert.equal(payload.tableFields.판매가, '8000');
  assert.equal(payload.tableFields.즉시할인, '2940');
  assert.equal(payload.tableRadios.인증정보, 'DETAIL_PAGE');
  assert.equal(payload.tableSelects['배송 템플릿'], '기본 - 배송비무료');
  assert.equal(payload.tablePicks.map((pick) => pick.row).join(','), '담당자,브랜드');
  // 검색어를 안 주면 고를 글자로 검색한다.
  assert.equal(payload.tablePicks[1].query, 'kiditem');
  assert.ok(payload.tableForm, '표 채움 설정이 같이 가야 한다');
});

/**
 * `상품 상세` 와 `상품 상세(상단)` 처럼 앞이 같은 줄이 있다. 앞부분 비교는 엉뚱한 줄을 집는다.
 */
test('⭐ 줄 제목은 정확히 같아야 한다 — 앞이 같은 줄이 있다', () => {
  const code = source();
  assert.ok(code.includes('const rowOf = (label) => [...document.querySelectorAll("th")]'));
  assert.ok(code.includes('.find((th) => tableNorm(th.textContent) === label)?.closest("tr") || null;'));
});

/**
 * ⚠️ 회귀(라이브 2026-09-11): 표준분류·브랜드는 고른 뒤에도 목록이 떠 있어서 '목록이 닫혔나'
 * 로 보면 멀쩡히 골라진 것을 실패로 알렸다. 목록 **밖**(칩·표 줄·글자칸)에 값이 나타났는지 본다.
 */
test('⚠️ 골랐는지는 목록 밖에 값이 생겼는지로 본다 — 목록은 떠 있기도 하다', () => {
  const code = source();
  assert.ok(code.includes('.some((el) => !(listBox && listBox.contains(el)) && squash(el.textContent).includes(want))'));
  // 검색어와 고를 글자가 같으면(브랜드) 글자칸 값은 증거가 아니다.
  assert.ok(code.includes('|| (squash(entry.query) !== want'));
});

test('배송 템플릿은 번호가 아니라 보이는 글자(label)로 고른다 — 번호는 계정마다 다르다', () => {
  assert.ok(source().includes('.find((option) => tableNorm(option.label || option.textContent) === want);'));
});

test('목록(select)은 늦게 채워지므로 고를 글자가 뜰 때까지 기다린다', () => {
  assert.ok(source().includes('for (let waited = 0; select && !option && waited < 8000; waited += 400) {'));
});

test('이미지 칸은 대표 · 추가(버튼으로 늘림) · 리스트다', async () => {
  const { SPECS } = loadModule();
  const slots = SPECS.thirtymall.tableForm.images;
  assert.equal(slots.map((slot) => `${slot.key}:${slot.row}`).join(','), 'main:대표이미지,additional:추가이미지,list:리스트 이미지');
  assert.equal(slots[1].addLabel, '이미지 추가');

  const { api, calls } = harness();
  await api.register({
    mall: 'thirtymall',
    form: form({
      imageGroups: {
        main: ['https://cdn.example.com/rep.jpg'],
        additional: ['https://cdn.example.com/a1.jpg', 'https://cdn.example.com/a2.jpg'],
        list: ['https://cdn.example.com/rep.jpg'],
      },
    }),
  });
  const [payload] = fillCall(calls).args;
  assert.equal(payload.imageGroups.main.length, 1);
  assert.equal(payload.imageGroups.additional.length, 2);
  assert.equal(payload.imageGroups.list.length, 1);
  assert.ok(payload.imageGroups.additional[0].dataUrl.startsWith('data:'));
});

/**
 * 상세설명은 Summernote 다. 그림 버튼으로 파일을 넣으면 몰이 자기 서버에 올리고 그 주소로
 * 그림을 넣는다. 남의 호스팅(diskn)을 쓰지 않는다.
 */
test('⭐ 상세설명은 몰 편집기로 올린다 — 남의 호스팅을 쓰지 않는다', async () => {
  const { SPECS } = loadModule();
  assert.equal(SPECS.thirtymall.detailHost, undefined);
  assert.equal(SPECS.thirtymall.tableForm.summernote.row, '상품 상세');
  assert.equal(SPECS.thirtymall.tableForm.summernote.radio, 'USE_CONFIG_VALUE');

  const { api, calls } = harness();
  await api.register({ mall: 'thirtymall', form: form({ detailUploads: [{ url: 'https://cdn.example.com/detail.jpg' }] }) });
  const [payload] = fillCall(calls).args;
  assert.ok(payload.detailImage?.dataUrl?.startsWith('data:'), '상세 이미지가 File 로 실려야 한다');

  const code = source();
  assert.ok(code.includes('input.note-image-input'), '그림 창의 파일 칸에 넣는다');
  // 몰 서버 주소로 들어갔는지 본다. data: 로 박히면 올라간 게 아니다. 몰은 스킴 없는
  // `//shopby-images.cdn-nhncommerce.com/…` 로 넣는다(라이브 실측) — 그것도 성공이다.
  assert.ok(code.includes('.find((el) => /^(https?:)?\\/\\//.test(el.getAttribute("src") || "")) || null;'));
  const accepts = /^(https?:)?\/\//;
  assert.ok(accepts.test('//shopby-images.cdn-nhncommerce.com/20260911/x.jpg'));
  assert.ok(accepts.test('https://shopby-images.cdn-nhncommerce.com/x.jpg'));
  assert.ok(!accepts.test('data:image/jpeg;base64,AAAA'));
});

test('⭐ 제출하지 않는다 — 저장은 사람이 누른다', async () => {
  const { api } = harness();
  const result = await api.register({ mall: 'thirtymall', form: form() });
  assert.equal(result.submitted, false);
});

test('겉과 폼 프레임 도메인 둘 다 호스트 권한이 있다', () => {
  const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'extensions/kiditem-os/manifest.json'), 'utf8'));
  const hosts = manifest.host_permissions || [];
  assert.ok(hosts.includes('https://partner.shopby.co.kr/*'));
  assert.ok(hosts.includes('https://partner-remote.shopby.co.kr/*'), '폼 프레임에 넣으려면 이 권한이 있어야 한다');
});
