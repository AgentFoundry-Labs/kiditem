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
 * 로그인이 풀렸을 때의 자동 로그인.
 *
 * 라이브(2026-09-10)에서 온채널이 `상품등록 폼(#registProductForm)이 없습니다` 로 실패했다.
 * 폼이 없는 대부분의 이유는 **로그인이 풀려 로그인 화면이 열린 것**이다.
 *
 * 지키는 것 넷 —
 *  1. **폼이 있으면 로그인을 건드리지 않는다.** 멀쩡한 세션에 손대지 않는다.
 *  2. **새 탭을 열지 않는다.** 이미 연 탭에서 로그인한다 — 몰이 원래 주소로 되돌려 준다.
 *  3. **한 번만 다시 채운다.** 무한 재시도는 계정을 잠근다.
 *  4. **자격증명은 결과 어디에도 남지 않는다.**
 */

const CREDENTIALS = { loginId: 'seller', password: 'secret-pw' };

const form = () => ({
  url: 'https://www.domeggook.com/sc/item/regFrm',
  fields: { name: '상품' },
  manualSteps: [],
});

function harness({ fills, login }) {
  const module = loadModule();
  const injectCalls = [];
  const loginCalls = [];
  const createdTabs = [];
  let injected = 0;
  const chrome = {
    runtime: {},
    scripting: {
      executeScript: async (options) => {
        injectCalls.push(options);
        const next = fills[Math.min(injected, fills.length - 1)];
        injected += 1;
        return [{ result: next }];
      },
    },
    tabs: {
      onUpdated: { addListener: () => {}, removeListener: () => {} },
      onRemoved: { addListener: () => {}, removeListener: () => {} },
      get: (tabId, done) => done({ id: tabId, status: 'complete' }),
    },
  };
  const api = module.create({
    chrome,
    fetch: async () => ({ ok: true, status: 200, blob: async () => new Blob([]) }),
    interactiveTabs: {
      createTab: async (options) => { createdTabs.push(options); return { id: 1 }; },
    },
    tabReason: 'test',
    ensureLogin: login
      ? async (tabId, credentials, mallKey) => {
        loginCalls.push({ tabId, credentials, mallKey });
        return login;
      }
      : undefined,
  });
  return { api, injectCalls, loginCalls, createdTabs };
}

const ok = { ok: true, steps: [], warnings: [] };
const noForm = { ok: false, noForm: true, error: '상품등록 폼이 없습니다.' };

test('폼이 있으면 로그인을 건드리지 않는다', async () => {
  const { api, loginCalls } = harness({ fills: [ok], login: { success: true, submitted: true } });
  const result = await api.register({
    mall: 'domeggook', form: form(), accountKey: 'domeggook', credentials: CREDENTIALS,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(loginCalls, [], '멀쩡한 세션에 손대지 않는다');
});

test('⭐ 폼을 찾았는데 채우다 실패하면 로그인하지 않고 그 오류를 남긴다', async () => {
  // 분류 선택 실패 · 기존 상품 수정 화면처럼 폼은 있는데 실패한 경우다. 여기서 로그인을 돌리면
  // 등록 화면의 칸에 아이디 · 비밀번호를 넣고 제출 폴백까지 누를 수 있다.
  const formFailure = { ok: false, error: '분류를 고르지 못했습니다.' };
  const { api, loginCalls, injectCalls } = harness({
    fills: [formFailure],
    login: { success: true, submitted: true },
  });
  const result = await api.register({
    mall: 'domeggook', form: form(), accountKey: 'domeggook', credentials: CREDENTIALS,
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /분류를 고르지 못했습니다/);
  assert.deepEqual(loginCalls, [], '폼이 있으면 로그인을 건드리지 않는다');
  assert.equal(injectCalls.length, 1, '다시 채우지 않는다');
});

test('⭐ 로그인 버튼을 눌렀어도 로그인 화면이 남았으면(확인 못 함) 다시 채우지 않는다', async () => {
  const { api, injectCalls } = harness({
    fills: [noForm, ok],
    login: { success: true, submitted: true, verified: false, verifyReason: 'login_form_remains' },
  });
  const result = await api.register({
    mall: 'domeggook', form: form(), accountKey: 'domeggook', credentials: CREDENTIALS,
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /직접 로그인/);
  assert.equal(injectCalls.length, 1, '로그인이 안 됐으면 다시 채우지 않는다');
});

test('폼이 없으면 그 탭에서 로그인하고 한 번 더 채운다', async () => {
  const { api, loginCalls, injectCalls, createdTabs } = harness({
    fills: [noForm, ok],
    login: { success: true, submitted: true },
  });
  const result = await api.register({
    mall: 'domeggook', form: form(), accountKey: 'domeggook', credentials: CREDENTIALS,
  });
  assert.equal(result.ok, true);
  assert.equal(loginCalls.length, 1);
  assert.equal(loginCalls[0].tabId, 1, '이미 연 탭에서 로그인한다');
  assert.equal(loginCalls[0].mallKey, 'domeggook', '계정 키를 그대로 넘긴다');
  assert.equal(injectCalls.length, 2, '한 번만 다시 채운다');
  assert.equal(createdTabs.length, 1, '로그인하려고 탭을 더 열지 않는다');
  assert.ok(
    result.warnings.some((warning) => warning.includes('자동 로그인')),
    '사람에게 로그인이 풀렸었다고 알린다',
  );
});

test('로그인해도 폼이 없으면 실패로 남긴다 — 무한히 다시 시도하지 않는다', async () => {
  const { api, injectCalls } = harness({
    fills: [noForm, noForm],
    login: { success: true, submitted: true },
  });
  const result = await api.register({
    mall: 'domeggook', form: form(), accountKey: 'domeggook', credentials: CREDENTIALS,
  });
  assert.equal(result.ok, false);
  assert.equal(injectCalls.length, 2, '두 번까지만');
});

test('로그인 폼이 없는 몰은 사람에게 넘긴다 — 11번가·올웨이즈', async () => {
  const { api, injectCalls } = harness({
    fills: [noForm],
    login: { success: false, pendingLogin: true },
  });
  const result = await api.register({
    mall: '11st',
    form: { ...form(), url: 'https://soffice.11st.co.kr/view/123124025' },
    accountKey: '11st',
    credentials: CREDENTIALS,
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /직접 로그인/);
  assert.equal(injectCalls.length, 1, '로그인이 안 됐으면 다시 채우지 않는다');
});

test('저장해 둔 계정이 없으면 예전대로 지금 세션에 기댄다', async () => {
  const { api, loginCalls } = harness({ fills: [noForm], login: { success: true, submitted: true } });
  const result = await api.register({ mall: 'domeggook', form: form(), accountKey: 'domeggook' });
  assert.equal(result.ok, false);
  assert.deepEqual(loginCalls, [], '자격증명이 없으면 로그인을 시도하지 않는다');
});

test('⭐ 자격증명은 결과 어디에도 남지 않는다', async () => {
  const { api } = harness({ fills: [noForm, ok], login: { success: true, submitted: true } });
  const result = await api.register({
    mall: 'domeggook', form: form(), accountKey: 'domeggook', credentials: CREDENTIALS,
  });
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes('secret-pw'), '비밀번호가 응답에 실리면 안 된다');
  assert.ok(!serialized.includes('seller'), '아이디도 실리면 안 된다');
});

test('ensureLogin 이 없는 환경에서도 등록은 된다', async () => {
  const { api } = harness({ fills: [ok], login: null });
  const result = await api.register({
    mall: 'domeggook', form: form(), accountKey: 'domeggook', credentials: CREDENTIALS,
  });
  assert.equal(result.ok, true);
});
