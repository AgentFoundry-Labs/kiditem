import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const modulePath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/orders/kidsnote-product-register.js',
);
const REGISTER_URL = 'https://shop.kidsnote.com/_manage/?body=product@product_register';

/** vm 샌드박스가 만든 객체는 프로토타입 realm 이 달라 deepEqual 이 걸린다. */
const plain = (value) => JSON.parse(JSON.stringify(value));

function loadModule() {
  const sandbox = { URL, console, setTimeout, clearTimeout, FileReader: class {} };
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(readFileSync(modulePath, 'utf8'), context, { filename: modulePath });
  return context.KidItemKidsnoteProductRegister;
}

function baseForm(overrides = {}) {
  return {
    url: REGISTER_URL,
    formId: 'prdFrm',
    fields: { name: '키링', fieldset: '1083', field437: '키링', sell_prc: '7900' },
    checks: ['auto_code'],
    radios: { ea_type: '1', req_stat: '1' },
    fileUploads: [{ name: 'upfile1', url: 'http://localhost:9000/kiditem/rep.jpg' }],
    richText: [{ name: 'content2', html: '<p><img src="x"/></p>' }],
    manualSteps: ['중분류를 선택하세요.'],
    ...overrides,
  };
}

function createHarness({ fetchImpl, executeResult, tabCreateError } = {}) {
  const calls = { tabs: [], execute: [], fetched: [] };
  let listener = null;
  const chrome = {
    tabs: {
      onUpdated: {
        addListener: (fn) => { listener = fn; },
        removeListener: () => { listener = null; },
      },
    },
    scripting: {
      async executeScript(input) {
        calls.execute.push(input);
        return [{ result: executeResult ?? { ok: true, steps: ['fields:3/3'], warnings: [] } }];
      },
    },
  };
  const interactiveTabs = {
    async createTab(input) {
      if (tabCreateError) throw new Error(tabCreateError);
      calls.tabs.push(input);
      // 탭이 열리면 곧바로 로딩 완료 신호를 준다.
      setTimeout(() => listener?.(7, { status: 'complete' }), 0);
      return { id: 7 };
    },
  };
  const fetchFn = fetchImpl ?? (async (url) => {
    calls.fetched.push(url);
    return { ok: true, blob: async () => ({ size: 10 }) };
  });
  return { chrome, interactiveTabs, fetchFn, calls };
}

function createRegister(harness) {
  const moduleRoot = loadModule();
  return moduleRoot.create({
    chrome: harness.chrome,
    fetch: harness.fetchFn,
    interactiveTabs: harness.interactiveTabs,
    tabReason: 'mall_product_register',
  });
}

test('isRegisterUrl accepts only the kidsnote product register screen', () => {
  const { isRegisterUrl } = loadModule();
  assert.equal(isRegisterUrl(REGISTER_URL), true);
  assert.equal(isRegisterUrl('https://shop.kidsnote.com/_manage/?body=product@product_list'), false);
  assert.equal(isRegisterUrl('https://evil.example/_manage/?body=product@product_register'), false);
  assert.equal(isRegisterUrl('http://shop.kidsnote.com/_manage/?body=product@product_register'), false);
  assert.equal(isRegisterUrl(''), false);
});

test('normalizeForm refuses a form that is not ours', () => {
  const { normalizeForm } = loadModule();
  assert.throws(() => normalizeForm({ url: REGISTER_URL, formId: 'other' }), /알 수 없는 폼/);
  assert.throws(() => normalizeForm({ url: 'https://evil.example', formId: 'prdFrm' }), /주소가 아닙니다/);
  assert.throws(() => normalizeForm(null), /폼 데이터가 없습니다/);
});

test('normalizeForm drops file uploads outside the three real image slots', () => {
  const { normalizeForm } = loadModule();
  const form = normalizeForm(baseForm({
    fileUploads: [
      { name: 'upfile1', url: 'http://localhost:9000/kiditem/a.jpg' },
      { name: 'upfile9', url: 'http://localhost:9000/kiditem/b.jpg' },
      { name: 'prd_upfile1', url: 'http://localhost:9000/kiditem/c.jpg' },
    ],
  }));
  assert.deepEqual(plain(form.fileUploads.map((u) => u.name)), ['upfile1']);
});

test('register fills the form without ever submitting it', async () => {
  const harness = createHarness();
  const result = await createRegister(harness).register({ form: baseForm() });
  assert.equal(result.ok, true);
  assert.equal(result.submitted, false, 'kidsnote registration is an approval request — never auto-submit');
  const [call] = harness.calls.execute;
  assert.equal(call.target.tabId, 7);
  assert.equal(typeof call.func, 'function');
  assert.equal(call.args[0].fields.field437, '키링');
});

test('register opens the tab with the mall registration reason', async () => {
  const harness = createHarness();
  await createRegister(harness).register({ form: baseForm() });
  assert.deepEqual(plain(harness.calls.tabs), [{ url: REGISTER_URL, reason: 'mall_product_register' }]);
});

test('register carries the manual steps back instead of guessing them', async () => {
  const harness = createHarness();
  const result = await createRegister(harness).register({ form: baseForm() });
  assert.deepEqual(plain(result.manualSteps), ['중분류를 선택하세요.']);
});

test('register reports a failed image download instead of silently registering without it', async () => {
  const harness = createHarness({
    fetchImpl: async () => ({ ok: false, status: 404 }),
  });
  const result = await createRegister(harness).register({ form: baseForm() });
  assert.equal(result.ok, true);
  assert.match(result.warnings.join(' '), /이미지 다운로드 실패/);
  assert.deepEqual(plain(harness.calls.execute[0].args[0].images), []);
});

test('register fails loudly when the page could not be filled', async () => {
  const harness = createHarness({ executeResult: { ok: false, error: '상품등록 폼(#prdFrm)이 없습니다.' } });
  const result = await createRegister(harness).register({ form: baseForm() });
  assert.equal(result.ok, false);
  assert.match(result.error, /#prdFrm/);
});

test('register rejects a form pointed at another site before opening any tab', async () => {
  const harness = createHarness();
  const result = await createRegister(harness).register({
    form: baseForm({ url: 'https://evil.example/_manage/?body=product@product_register' }),
  });
  assert.equal(result.ok, false);
  assert.deepEqual(plain(harness.calls.tabs), [], 'no tab may be opened for an untrusted form target');
});
