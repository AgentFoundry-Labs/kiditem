import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const modulePath = path.join(repoRoot, 'extensions/kiditem-os/background/orders/mall-form-register.js');

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
 * 몰 [등록] 누르기(ADR-0015, 사장님 2026-09-20 "끝까지 자동 등록").
 *
 * 지키는 것 —
 *  1. 웹이 `submit: true` 로 부르고, 그 몰의 [등록] 누르기를 확인한 몰(`spec.submit`)일 때만 누른다.
 *  2. 채우다 남긴 경고 · 사람이 할 일이 하나라도 있으면 누르지 않는다(폼은 사람에게 남는다).
 *  3. 누른 것과 몰이 받은 것을 가른다 — 받았으면 탭을 닫고, 모르거나 거절이면 남긴다.
 */
const SUBMIT = {
  buttonSelectors: ['#lBtnRegItem'],
  acceptConfirm: true,
  successText: ['등록되었습니다'],
  failureText: ['등록할 수 없습니다'],
  productNoPattern: '상품번호\\s*(\\d{6,})',
  waitMs: 5000,
};

/** 등록 대상 실행이 준 컨텍스트 — [등록]은 이것이 있을 때만 누른다(KID-322). */
const EXECUTION = {
  executionId: '5f0c2c1e-7a1b-4c8e-9d2a-1b2c3d4e5f60',
  payloadHash: 'a'.repeat(64),
  leaseToken: '0e1d2c3b-4a59-4687-9876-5a4b3c2d1e0f',
};

const form = (manualSteps = []) => ({
  url: 'https://www.domeggook.com/sc/item/regFrm',
  fields: { name: '상품' },
  manualSteps,
});

function harness({ fill = { ok: true, steps: [], warnings: [] }, reads = [{ success: true, failure: false, dialogs: ['상품번호 70123456 등록되었습니다'], productNo: '70123456' }], submitSpec = SUBMIT } = {}) {
  const module = loadModule();
  if (submitSpec) module.SPECS.domeggook.submit = submitSpec;
  const calls = { fill: 0, press: 0, read: 0, removed: [] };
  const chrome = {
    runtime: {},
    scripting: {
      executeScript: async (options) => {
        const name = options.func?.name;
        if (name === 'pressMallRegisterButton') {
          calls.press += 1;
          assert.equal(options.world, 'MAIN', '몰 대화상자를 삼키려면 MAIN 에서 누른다');
          return [{ result: { clicked: true } }];
        }
        if (name === 'readMallRegisterResult') {
          const answer = reads[Math.min(calls.read, reads.length - 1)];
          calls.read += 1;
          return [{ result: { url: 'https://www.domeggook.com/sc/item/regFrm', ...answer } }];
        }
        calls.fill += 1;
        return [{ result: fill }];
      },
    },
    tabs: {
      onUpdated: { addListener: () => {}, removeListener: () => {} },
      onRemoved: { addListener: () => {}, removeListener: () => {} },
      get: (tabId, done) => done({ id: tabId, status: 'complete' }),
      remove: async (tabId) => { calls.removed.push(tabId); },
    },
  };
  const api = module.create({
    chrome,
    fetch: async () => ({ ok: true, status: 200, blob: async () => new Blob([]) }),
    interactiveTabs: { createTab: async () => ({ id: 7 }) },
    tabReason: 'test',
  });
  return { api, calls, module };
}

test('⭐ [등록]까지 부탁하고 폼을 다 채웠으면 몰 [등록]을 누르고, 몰이 받으면 새 상품번호를 돌려주고 탭을 닫는다', async () => {
  const { api, calls } = harness({
    reads: [{ success: false, failure: false, dialogs: [] }, { success: true, failure: false, dialogs: ['상품번호 70123456 등록되었습니다'], productNo: '70123456' }],
  });
  const result = await api.register({ mall: 'domeggook', form: form(), submit: true, executionContext: EXECUTION });
  assert.equal(result.ok, true);
  assert.equal(result.submitted, true);
  assert.equal(result.accepted, true);
  assert.equal(result.productNo, '70123456');
  assert.equal(calls.press, 1);
  assert.equal(calls.read, 2, '받았다는 글이 보일 때까지 읽는다');
  assert.deepEqual(calls.removed, [7]);
});

test('부탁하지 않았거나 그 몰의 [등록] 누르기를 확인하지 않았으면 누르지 않는다', async () => {
  const plain = harness();
  const filled = await plain.api.register({ mall: 'domeggook', form: form() });
  assert.equal(filled.submitted, false);
  assert.equal(plain.calls.press, 0);

  const unverified = harness({ submitSpec: null });
  const skipped = await unverified.api.register({ mall: 'domeggook', form: form(), submit: true, executionContext: EXECUTION });
  assert.equal(skipped.submitted, false);
  assert.match(skipped.submitSkipped, /확인하지 않은 몰/);
  assert.equal(unverified.calls.press, 0);
});

test('⭐ 실행 컨텍스트 없이 [등록]을 부탁하면 폼만 채우고 누르지 않는다 — 빠른 등록은 폼 채우기다(KID-322)', async () => {
  const quick = harness();
  const result = await quick.api.register({ mall: 'domeggook', form: form(), submit: true });
  assert.equal(result.ok, true);
  assert.equal(result.submitted, false);
  assert.equal(result.submitSkipped, 'execution_context_required');
  assert.equal(quick.calls.press, 0);
  assert.deepEqual(quick.calls.removed, []);

  const partial = harness();
  const skipped = await partial.api.register({ mall: 'domeggook', form: form(), submit: true, executionContext: { ...EXECUTION, leaseToken: '' } });
  assert.equal(skipped.ok, false, '반쪽 컨텍스트는 잘못된 요청이다');
  assert.equal(partial.calls.press, 0);
});

test('⭐ 채우다 남긴 경고나 사람이 할 일이 있으면 누르지 않고 폼을 남긴다', async () => {
  const warned = harness({ fill: { ok: true, steps: [], warnings: ['안전인증번호 칸을 찾지 못했습니다.'] } });
  const result = await warned.api.register({ mall: 'domeggook', form: form(), submit: true, executionContext: EXECUTION });
  assert.equal(result.submitted, false);
  assert.match(result.submitSkipped, /안전인증번호/);
  assert.equal(warned.calls.press, 0);
  assert.deepEqual(warned.calls.removed, []);

  const manual = harness();
  const kept = await manual.api.register({ mall: 'domeggook', form: form(['배송 템플릿을 고르세요']), submit: true, executionContext: EXECUTION });
  assert.equal(kept.submitted, false);
  assert.match(kept.submitSkipped, /배송 템플릿/);
});

test('몰이 거절하면 누른 것으로 세되 받지 않았다고 하고, 몰의 말을 싣고, 탭을 남긴다', async () => {
  const { api, calls } = harness({ reads: [{ success: false, failure: true, dialogs: ['등록할 수 없습니다: 금지어'] }] });
  const result = await api.register({ mall: 'domeggook', form: form(), submit: true, executionContext: EXECUTION });
  assert.equal(result.submitted, true);
  assert.equal(result.accepted, false);
  assert.match(result.mallMessage, /금지어/);
  assert.deepEqual(calls.removed, []);
});

test('[등록]을 누르는 페이지 함수 — 확인 창은 받아들이고 알림은 삼켜 글만 모은다 · 결과는 글과 주소로 읽는다', () => {
  const module = loadModule();
  const { pressMallRegisterButton, readMallRegisterResult } = module.pageFunctions;
  const dom = new JSDOM(`<body><form><button id="lBtnRegItem" type="button">상품등록</button></form></body>`, {
    url: 'https://www.domeggook.com/sc/item/regFrm?token=secret',
    runScripts: 'outside-only',
  });
  const { window } = dom;
  // JSDOM 은 레이아웃이 없어 offsetParent 가 늘 null 이다 — 보이는 것으로 둔다.
  Object.defineProperty(window.HTMLElement.prototype, 'offsetParent', { get() { return this.parentNode; } });
  const button = window.document.getElementById('lBtnRegItem');
  let confirmed = null;
  button.addEventListener('click', () => {
    confirmed = window.confirm('등록하시겠습니까?');
    window.alert('상품번호 70123456 등록되었습니다');
  });
  window.eval(`(${pressMallRegisterButton.toString()})`);
  const press = window.eval(`(${pressMallRegisterButton.toString()})(${JSON.stringify(SUBMIT)})`);
  assert.equal(press.clicked, true);
  assert.equal(confirmed, true);
  const read = window.eval(`(${readMallRegisterResult.toString()})(${JSON.stringify(SUBMIT)})`);
  assert.equal(read.success, true);
  assert.equal(read.productNo, '70123456');
  assert.equal(read.url, 'https://www.domeggook.com/sc/item/regFrm', '쿼리는 돌려주지 않는다');
  const missing = window.eval(`(${pressMallRegisterButton.toString()})(${JSON.stringify({ buttonSelectors: ['#none'] })})`);
  assert.equal(missing.clicked, false);
});

const EXECUTION_CONTEXT = {
  executionId: '33333333-3333-4333-8333-333333333333',
  payloadHash: 'sha256:mall-registration-fixture',
  leaseToken: '88888888-8888-4888-8888-888888888888',
};

test('target registration echoes its execution context with the provider observation', async () => {
  const { api } = harness({
    reads: [{ success: true, failure: false, dialogs: ['상품번호 70123456 등록되었습니다'], productNo: '70123456' }],
  });
  const result = await api.register({
    mall: 'domeggook',
    form: form(),
    submit: true,
    executionContext: EXECUTION_CONTEXT,
  });

  assert.deepEqual(JSON.parse(JSON.stringify(result.executionContext)), EXECUTION_CONTEXT);
  assert.equal(result.executionId, EXECUTION_CONTEXT.executionId);
  assert.equal(result.payloadHash, EXECUTION_CONTEXT.payloadHash);
  assert.equal(result.leaseToken, EXECUTION_CONTEXT.leaseToken);
  assert.deepEqual(JSON.parse(JSON.stringify(result.evidence)), {
    submitted: true,
    accepted: true,
    productNo: '70123456',
    mallMessage: '상품번호 70123456 등록되었습니다',
  });
});

test('target context does not turn fill-only work into a submission', async () => {
  const { api, calls } = harness();
  const result = await api.register({
    mall: 'domeggook',
    form: form(),
    executionContext: EXECUTION_CONTEXT,
  });

  assert.equal(result.ok, true);
  assert.equal(result.submitted, false);
  assert.deepEqual(JSON.parse(JSON.stringify(result.executionContext)), EXECUTION_CONTEXT);
  assert.deepEqual(JSON.parse(JSON.stringify(result.evidence)), {
    submitted: false,
    accepted: null,
    productNo: null,
    mallMessage: null,
  });
  assert.equal(calls.press, 0);
});

test('rejects a partial execution context before opening or filling a mall form', async () => {
  const { api, calls } = harness();
  const result = await api.register({
    mall: 'domeggook',
    form: form(),
    executionContext: { executionId: EXECUTION_CONTEXT.executionId },
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /등록 실행 컨텍스트/);
  assert.equal(calls.fill, 0);
  assert.equal(calls.press, 0);
});

test('keeps execution context scoped to mall registration, not availability transport', () => {
  const worker = readFileSync(path.join(repoRoot, 'extensions/kiditem-os/background/orders/worker.js'), 'utf8');
  const registrationStart = worker.indexOf('if (msg?.action === "registerToMallForm")');
  const availabilityStart = worker.indexOf('if (msg?.action === "sendMallAvailability")');
  assert.ok(registrationStart >= 0 && availabilityStart > registrationStart);
  const registrationBranch = worker.slice(registrationStart, availabilityStart);
  assert.match(registrationBranch, /executionContext/);
  assert.doesNotMatch(worker.slice(availabilityStart, worker.indexOf('if (msg?.action === "readMallAvailability")', availabilityStart)), /executionId|payloadHash|leaseToken|executionContext/);
});

test('[등록]까지 누를 수 있는 몰은 확인한 몰뿐이다(지금 없음)', () => {
  assert.deepEqual([...loadModule().SUBMIT_MALL_KEYS], []);
});
