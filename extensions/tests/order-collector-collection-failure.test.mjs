import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const helperPath = path.join(
  repoRoot,
  'extensions/kiditem-os/background/orders/collection-failure.js',
);

function loadHelper() {
  const context = vm.createContext({});
  vm.runInContext(readFileSync(helperPath, 'utf8'), context);
  return context.KidItemOrderCollectionFailure;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('normalizes provider failures into stable operator evidence', () => {
  const helper = loadHelper();
  const cases = [
    {
      provider: 'gs-shop',
      value: { success: false, pendingLogin: true, error: 'GS샵 SMS 인증이 필요합니다.' },
      expected: ['operator_action_required', true, 'complete_sms_auth'],
    },
    {
      provider: 'teacher-mall',
      value: { success: false, error: 'teacherville 로그인을 확인하세요.' },
      expected: ['login_required', true, 'complete_login'],
    },
    {
      provider: 'always',
      value: { success: false, error: '배송관리 화면을 불러오지 못했습니다. 로그인을 확인하세요.' },
      expected: ['login_required', true, 'complete_login'],
    },
    {
      provider: 'kakao',
      value: { success: false, error: '카카오쇼핑 판매자센터 로그인이 필요합니다.' },
      expected: ['login_required', true, 'complete_login'],
    },
    {
      provider: 'lotte-on',
      value: { success: false, pendingLogin: true, error: '롯데ON 판매자센터 로그인이 필요합니다.' },
      expected: ['login_required', true, 'complete_login'],
    },
    {
      provider: 'domeggook',
      value: { success: false, error: '도매꾹 생성 요청 모달을 열지 못했습니다.' },
      expected: ['provider_contract_changed', false, null],
    },
    {
      provider: 'icecream-mall',
      value: { success: false, error: '로그인 후 화면으로 넘어가지 않았습니다.' },
      expected: ['provider_contract_changed', false, null],
    },
    {
      provider: 'art09',
      value: { success: false, error: '주문목록에서 주문번호를 찾지 못했습니다.' },
      expected: ['provider_contract_changed', false, null],
    },
    {
      provider: 'boribori',
      value: new Error('Failed to fetch'),
      expected: ['network_failed', true, null],
    },
    {
      provider: 'kidkids',
      value: { success: false, error: 'unexpected value' },
      expected: ['unknown_failure', false, null],
    },
  ];

  for (const item of cases) {
    assert.deepEqual(
      plain(helper.createEvidence(item.provider, item.value)),
      {
        version: 1,
        provider: item.provider,
        action: 'collect_orders',
        code: item.expected[0],
        retryable: item.expected[1],
        operatorAction: item.expected[2],
      },
      item.provider,
    );
  }
});

test('treats an explicit pending-login result as login evidence for every provider', () => {
  const helper = loadHelper();

  assert.deepEqual(
    plain(helper.createEvidence('kidsnote', {
      success: false,
      pendingLogin: true,
      error: '세션이 만료되었습니다.',
    })),
    {
      version: 1,
      provider: 'kidsnote',
      action: 'collect_orders',
      code: 'login_required',
      retryable: true,
      operatorAction: 'complete_login',
    },
  );
});

test('preserves explicit stable collector error codes without re-parsing display text', () => {
  const helper = loadHelper();

  assert.deepEqual(
    plain(helper.createEvidence('gs-shop', {
      success: false,
      errorCode: 'provider_contract_changed',
      error: 'GS샵 주문 조회 결과를 확인하지 못했습니다.',
    })),
    {
      version: 1,
      provider: 'gs-shop',
      action: 'collect_orders',
      code: 'provider_contract_changed',
      retryable: false,
      operatorAction: null,
    },
  );
});
