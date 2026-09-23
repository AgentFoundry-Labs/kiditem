import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

/**
 * 확장이 WING 폼 작업을 마치고 위로 돌려주는 보고.
 *
 * 이 보고 하나로 웹이 등록 실행 울타리에 무엇을 말할지 갈린다(ADR-0014):
 *  - 채우다 멈췄다 → 제출이 없었으므로 확정 실패로 닫고 재시도를 연다
 *  - 제출을 시도했는데 결과를 모른다 → 미해결로 남겨 중복 등록을 막는다
 * 이 둘이 섞이면 수집상품이 `reconciling` 에 갇히거나 같은 상품이 두 번 올라간다.
 */

const workerSource = await readFile(
  new URL('../../kiditem-os/background/coupang/worker.js', import.meta.url), 'utf8',
);

function extractRegisterToWingForm() {
  const normalized = workerSource.replace(/\r\n?/g, '\n');
  const start = normalized.indexOf('async function registerToWingForm(message)');
  const end = normalized.indexOf('\n}\n', start) + 2;
  assert.ok(start >= 0 && end > start, 'registerToWingForm source must be extractable');
  return normalized.slice(start, end);
}

function workerHarness(fillResult) {
  const openedTabs = [];
  const context = vm.createContext({
    INTERACTIVE_TAB_REASONS: { PRODUCT_EDIT: 'product-edit' },
    interactiveTabs: {
      createTab: async () => {
        openedTabs.push('formV2');
        return { id: 21 };
      },
    },
    waitForTabComplete: async () => true,
    wingFormReadiness: { wait: async () => ({ ok: true }) },
    wingFormRuntimeCompat: {
      prepareNavigation: async () => ({ ok: true, status: 'prepared' }),
      ensure: async () => ({ ok: true, status: 'already-compatible' }),
    },
    chrome: { tabs: { sendMessage: async () => fillResult } },
    setTimeout(callback) { callback(); return 0; },
  });
  vm.runInContext(extractRegisterToWingForm(), context, {
    filename: 'service-worker.registerToWingForm.js',
  });
  return { context, openedTabs };
}

test('refuses an auto-submit without the server-issued execution identity, before opening a tab', async () => {
  const { context, openedTabs } = workerHarness({ ok: true, submission: { attempted: false } });

  const result = await context.registerToWingForm({
    product: { productName: 'test' },
    autoSubmit: true,
    executionId: 'not-a-uuid',
    expectedVendorId: 'A00012345',
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /등록 실행 ID/);
  assert.deepEqual(openedTabs, []);
});

test('refuses any fill without an approved WING seller identity', async () => {
  const { context, openedTabs } = workerHarness({ ok: true, submission: { attempted: false } });

  const result = await context.registerToWingForm({
    product: { productName: 'test' },
    expectedVendorId: '',
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /판매자 식별자/);
  assert.deepEqual(openedTabs, []);
});

test('reports a fill failure without claiming a submission, so the fence can be closed as not submitted', async () => {
  const { context } = workerHarness({
    ok: false,
    error: '옵션 행을 만들지 못했습니다.',
  });

  const result = await context.registerToWingForm({
    product: { productName: 'test' },
    autoSubmit: true,
    executionId: '33333333-3333-4333-8333-333333333333',
    expectedVendorId: 'A00012345',
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /옵션 행을 만들지 못했습니다/);
  // 제출을 주장하지 않는다. 여기에 attempted:true 가 섞이면 웹이 미해결로 닫아
  // 그 수집상품을 다시 보낼 수 없게 된다.
  assert.equal(result.submission, undefined);
});

test('passes an unconfirmed submit result through untouched, so the fence stays unresolved', async () => {
  const { context } = workerHarness({
    ok: true,
    submission: { attempted: true, ok: false, status: 'unknown' },
    evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'dom:data-vendor-id' },
  });

  const result = await context.registerToWingForm({
    product: { productName: 'test' },
    autoSubmit: true,
    executionId: '33333333-3333-4333-8333-333333333333',
    expectedVendorId: 'A00012345',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.submission, { attempted: true, ok: false, status: 'unknown' });
  assert.deepEqual(result.evidence, {
    wingVendorId: 'A00012345',
    wingIdentitySource: 'dom:data-vendor-id',
  });
});

test('reports a confirmed registration with the external listing id the fence will freeze', async () => {
  const { context } = workerHarness({
    ok: true,
    submission: { attempted: true, ok: true, status: 'registered', externalListingId: '427011919' },
    evidence: { wingVendorId: 'A00012345', wingIdentitySource: 'dom:inline-script' },
  });

  const result = await context.registerToWingForm({
    product: { productName: 'test' },
    autoSubmit: true,
    executionId: '33333333-3333-4333-8333-333333333333',
    expectedVendorId: 'A00012345',
  });

  assert.equal(result.ok, true);
  assert.equal(result.submission.externalListingId, '427011919');
  assert.equal(result.evidence.wingVendorId, 'A00012345');
});

test('never posts the result itself — the web owns the fence call', () => {
  const normalized = workerSource.replace(/\r\n?/g, '\n');
  const start = normalized.indexOf('async function registerToWingForm(message)');
  const end = normalized.indexOf('\n}\n', start) + 2;
  const body = normalized.slice(start, end);

  // 확장은 마켓 화면만 만진다. 울타리에 쓰는 것은 웹 하나뿐이라, 실행 상태를 두
  // 곳에서 바꾸는 경로가 생기지 않는다.
  assert.equal(/authedFetch|registration-executions|\/api\//.test(body), false);
});
