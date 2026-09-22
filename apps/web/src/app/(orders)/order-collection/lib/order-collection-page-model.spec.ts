import { describe, expect, it, vi } from 'vitest';
import {
  classifyOrderCollectionFailure,
  collectionAttentionNotice,
  draftFromMallAccount,
  getOrderCount,
  getOrderCollectionFailureCode,
  groupHistoryByDay,
  hasSellpiaTransmissionRequest,
  isAuthRequiredMessage,
  isBrowserCollectableMall,
  isLoginRequiredMessage,
  isNoNewOrdersMessage,
  orderCollectionBatchNotice,
  todayYmd,
} from './order-collection-page-model';
import { COUPANG_DIRECT_MALL_KEY } from './coupang-directship-collection-source';
import type { OrderCollectionMallAccount } from '@/lib/order-mall-account-api';
import type { StoredOrderCollectionFile } from './order-generated-file-store';

function generatedFile(overrides: Partial<StoredOrderCollectionFile>): StoredOrderCollectionFile {
  return {
    id: overrides.id ?? 'file-1',
    fileName: overrides.fileName ?? 'orders.xlsx',
    sourceName: overrides.sourceName ?? 'orders.csv',
    mimeType: overrides.mimeType ?? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    blob: overrides.blob ?? 'base64',
    previewRows: overrides.previewRows ?? [],
    convertedAt: overrides.convertedAt ?? Date.UTC(2026, 5, 29, 10, 0),
    productRows: overrides.productRows ?? null,
    outputRows: overrides.outputRows ?? null,
    skippedRows: overrides.skippedRows ?? null,
    collectionDate: overrides.collectionDate,
    collectionMode: overrides.collectionMode,
    collectedRows: overrides.collectedRows,
    mallKey: overrides.mallKey,
    mallName: overrides.mallName,
    transmissionRequestedAt: overrides.transmissionRequestedAt,
  };
}

function mallAccount(overrides: Partial<OrderCollectionMallAccount>): OrderCollectionMallAccount {
  return {
    key: overrides.key ?? 'icecream-mall',
    name: overrides.name ?? '아이스크림몰',
    configured: overrides.configured ?? true,
    enabled: overrides.enabled ?? true,
    loginId: overrides.loginId ?? 'operator',
    siteUrl: overrides.siteUrl ?? 'https://example.test',
    memo: overrides.memo ?? 'memo',
    hasPassword: overrides.hasPassword ?? true,
    passwordUpdatedAt: overrides.passwordUpdatedAt ?? '2026-06-01T00:00:00.000Z',
  };
}

describe('order collection page model', () => {
  it('groups generated files by collection date before timestamp fallback', () => {
    const groups = groupHistoryByDay([
      generatedFile({ id: 'a', collectionDate: '2026-06-28' }),
      generatedFile({ id: 'b', collectionDate: '2026-06-28' }),
      generatedFile({ id: 'c', convertedAt: Date.UTC(2026, 5, 27, 4, 0) }),
    ]);

    expect(groups.map((group) => [group.key, group.label, group.items.map((item) => item.id)])).toEqual([
      ['2026-06-28', '2026. 06. 28.', ['a', 'b']],
      ['2026-06-27', '2026. 06. 27.', ['c']],
    ]);
  });

  it('distinguishes raw mall collection from a Sellpia transmission request', () => {
    expect(hasSellpiaTransmissionRequest(generatedFile({ collectionMode: 'browser' }))).toBe(false);
    expect(
      hasSellpiaTransmissionRequest(
        generatedFile({ transmissionRequestedAt: Date.UTC(2026, 6, 29, 11, 0) }),
      ),
    ).toBe(true);
  });

  it('derives order count only when output rows are greater than product rows', () => {
    expect(getOrderCount(generatedFile({ outputRows: 10, productRows: 3 }))).toBe(7);
    expect(getOrderCount(generatedFile({ outputRows: 2, productRows: 3 }))).toBeNull();
    expect(getOrderCount(null)).toBeNull();
  });

  it('limits browser collection to configured enabled Icecream Mall accounts', () => {
    expect(isBrowserCollectableMall(mallAccount({}))).toBe(true);
    expect(isBrowserCollectableMall(mallAccount({ enabled: false }))).toBe(false);
    expect(isBrowserCollectableMall(mallAccount({ configured: false }))).toBe(false);
    expect(isBrowserCollectableMall(mallAccount({ key: 'other-mall' }))).toBe(false);
  });

  it('builds editable mall drafts without exposing stored passwords', () => {
    expect(draftFromMallAccount(mallAccount({ enabled: false }))).toEqual({
      loginId: 'operator',
      supplierLoginId: '',
      password: '',
      siteUrl: 'https://example.test',
      memo: 'memo',
      enabled: false,
    });
  });

  it('uses the local date key for today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-29T10:30:00+09:00'));

    expect(todayYmd()).toBe('2026-06-29');

    vi.useRealTimers();
  });
});

describe('isNoNewOrdersMessage', () => {
  it('treats "no new orders" failures as empty (not error)', () => {
    expect(isNoNewOrdersMessage('출고 전 티쳐몰 신규 주문이 없습니다.')).toBe(true);
    expect(isNoNewOrdersMessage('결제완료 보리보리 신규 주문이 없습니다.')).toBe(true);
    expect(isNoNewOrdersMessage('수집할 출고 전 주문이 없습니다.')).toBe(true);
    expect(isNoNewOrdersMessage('오늘 온채널 신규 주문 없음')).toBe(true);
  });

  it('keeps genuine failures classified as errors', () => {
    expect(isNoNewOrdersMessage('주문수집 확장프로그램을 찾을 수 없습니다.')).toBe(false);
    expect(isNoNewOrdersMessage('티쳐몰 엑셀 응답이 비어 있습니다. 출고 전 주문이 없거나 로그인이 필요합니다.')).toBe(false);
    expect(isNoNewOrdersMessage('저장된 비밀번호를 불러오지 못했습니다.')).toBe(false);
    expect(isNoNewOrdersMessage('셀피아 송장 조회 시간이 초과되었습니다.')).toBe(false);
    expect(isNoNewOrdersMessage('')).toBe(false);
    expect(isNoNewOrdersMessage(null)).toBe(false);
  });
});

describe('getOrderCollectionFailureCode', () => {
  it('prefers structured failure evidence over display text', () => {
    expect(getOrderCollectionFailureCode({
      errorCode: 'login_required',
      message: '주문이 없습니다.',
    })).toBe('login_required');
    expect(getOrderCollectionFailureCode({
      failure: { code: 'provider_contract_changed' },
    })).toBe('provider_contract_changed');
    expect(getOrderCollectionFailureCode(new Error('주문이 없습니다.'))).toBeNull();
  });
});

describe('classifyOrderCollectionFailure', () => {
  it('인증 안내를 로그인으로 표시하지 않는다', () => {
    // 확장이 몰에 상관없이 인증을 `operator_action_required` 로 보낸다.
    // 이 코드가 오면 메시지에 "로그인"이 섞여 있어도 인증으로 떠야 한다.
    expect(classifyOrderCollectionFailure(
      { errorCode: 'operator_action_required' },
      '로그인 후 인증번호를 입력해 주세요.',
    )).toBe('auth');
    // 구조화 코드가 없는 예전 응답은 메시지로 판정한다.
    expect(classifyOrderCollectionFailure(
      {},
      '롯데ON 2단계 인증을 완료해 주세요.',
    )).toBe('auth');
  });

  it('uses one structured-code-first decision for manual and automatic collection', () => {
    expect(classifyOrderCollectionFailure(
      { errorCode: 'login_required' },
      '신규 주문이 없습니다.',
    )).toBe('login');
    expect(classifyOrderCollectionFailure(
      { errorCode: 'provider_contract_changed' },
      '로그인을 확인했지만 주문이 없습니다.',
    )).toBe('error');
    expect(classifyOrderCollectionFailure(
      new Error('신규 주문이 없습니다.'),
      '신규 주문이 없습니다.',
    )).toBe('empty');
  });
});

describe('login / auth classification', () => {
  it('flags "verification required" (SMS 인증) as auth', () => {
    expect(isAuthRequiredMessage('GS샵 SMS 인증이 필요합니다. [인증번호 받기]로 인증을 완료하세요.')).toBe(true);
    expect(isAuthRequiredMessage('로그인 보안강화를 위한 SMS 인증방식이 시행됩니다.')).toBe(true);
    expect(isAuthRequiredMessage('인증번호 받기')).toBe(true);
  });

  it('flags "login required" messages as login', () => {
    expect(isLoginRequiredMessage('GS샵 로그인이 필요합니다. 로그인되어 있는지 확인하세요.')).toBe(true);
    expect(isLoginRequiredMessage('쿠팡 발주 세션이 만료되었습니다. Supplier Hub 로그인 상태를 확인하세요.')).toBe(true);
  });

  it('does not misclassify plain system errors or empties', () => {
    expect(isAuthRequiredMessage('GS샵 조회 버튼을 찾지 못했습니다.')).toBe(false);
    expect(isLoginRequiredMessage('GS샵 조회 버튼을 찾지 못했습니다.')).toBe(false);
    expect(isAuthRequiredMessage('출고 전 티쳐몰 신규 주문이 없습니다.')).toBe(false);
    expect(isLoginRequiredMessage('출고 전 티쳐몰 신규 주문이 없습니다.')).toBe(false);
    expect(isAuthRequiredMessage(null)).toBe(false);
    expect(isLoginRequiredMessage(null)).toBe(false);
  });
});

describe('orderCollectionBatchNotice', () => {
  const batch = (patch: Partial<Parameters<typeof orderCollectionBatchNotice>[0]> = {}) => ({
    successCount: 0,
    failedCount: 0,
    inProgressCount: 0,
    unconfiguredCount: 0,
    ...patch,
  });

  /** KID-106 Q6. 진행 중이던 몰은 새로 열지 않았을 뿐이므로 실패 수에 섞지 않는다. */
  it('⭐ tells malls already collecting apart from malls that failed', () => {
    expect(orderCollectionBatchNotice(batch({ successCount: 3, inProgressCount: 2 }))).toEqual({
      tone: 'warning',
      message: '전체 수집 3개 성공, 2개 진행 중',
    });
    expect(orderCollectionBatchNotice(batch({
      successCount: 3, failedCount: 1, inProgressCount: 2,
    }))).toEqual({
      tone: 'warning',
      message: '전체 수집 3개 성공, 1개 실패, 2개 진행 중',
    });
  });

  /**
   * KID-170 D1. 이 조직에 계정 행이 없는 몰은 수집이 실패한 것이 아니라 아직 설정되지
   * 않은 것이다. 실패로 세면 "1개 성공, 10개 실패"가 되어 운영자가 고장으로 읽는다.
   */
  it('⭐ tells malls that are not set up yet apart from malls that failed', () => {
    expect(orderCollectionBatchNotice(batch({
      successCount: 1, unconfiguredCount: 10, inProgressCount: 3,
    }))).toEqual({
      tone: 'warning',
      message: '전체 수집 1개 성공, 10개 미설정, 3개 진행 중',
    });
  });

  it('keeps the plain success sentence when nothing failed and nothing was already running', () => {
    expect(orderCollectionBatchNotice(batch({ successCount: 5 }))).toEqual({
      tone: 'success',
      message: '전체 수집 완료',
    });
  });

  /** 자동 운전이 직접 로그인이 필요한 몰을 뺐으면, 뺐다는 사실을 숨기지 않는다. */
  it('names the malls the round skipped because a person must sign in', () => {
    expect(orderCollectionBatchNotice(batch({ successCount: 4, skippedCount: 2 }))).toEqual({
      tone: 'warning',
      message: '전체 수집 4개 성공, 2개 건너뜀(직접 로그인 필요)',
    });
  });
});

/**
 * 셀피아 주문 대사도 몰 수집과 같은 확장 결과를 받는다. 로그인이 풀린 것을 raw 오류로
 * 보여 주면 운영자가 무엇을 해야 하는지 알 수 없다(KID-163).
 */
describe('collectionAttentionNotice', () => {
  it('로그인이 풀린 실패는 몰 카드와 같은 "로그인 필요" 문구로 알린다', () => {
    expect(collectionAttentionNotice('셀피아', new Error('로그인이 필요합니다.'), '로그인이 필요합니다.'))
      .toEqual({ tone: 'warning', message: '로그인 필요 · 셀피아 · 로그인이 필요합니다.' });
  });

  it('확장이 조치를 요구한 실패는 "인증 필요"로 알린다', () => {
    const error = Object.assign(new Error('캡차를 풀어주세요.'), {
      errorCode: 'operator_action_required',
    });

    expect(collectionAttentionNotice('셀피아', error, '캡차를 풀어주세요.'))
      .toEqual({ tone: 'warning', message: '인증 필요 · 셀피아 · 캡차를 풀어주세요.' });
  });

  it('그 밖의 실패는 원래 문장을 그대로 오류로 알린다', () => {
    expect(collectionAttentionNotice('셀피아', new Error('서버 오류'), '셀피아 대조에 실패했습니다.'))
      .toEqual({ tone: 'error', message: '셀피아 대조에 실패했습니다.' });
  });
});

/**
 * 수집 가능 판정은 채널 레지스트리 하나에서 나온다(KID-250).
 *
 * 화면이 몰 목록을 다시 적던 동안 서버와 갈라졌다 — 카카오는 여기만 켜져 있었고, 로켓은
 * 서버만 켜져 있었다. 목록을 지운 뒤에도 같은 답이 나오는지 지킨다.
 */
describe('isBrowserCollectableMall — 채널 레지스트리 파생', () => {
  const account = (key: string, extra: Partial<OrderCollectionMallAccount> = {}) => ({
    key,
    name: key,
    configured: true,
    enabled: true,
    loginId: null,
    siteUrl: null,
    memo: null,
    hasPassword: true,
    passwordUpdatedAt: null,
    updatedAt: null,
    ...extra,
  } as OrderCollectionMallAccount);

  it('⭐ 확장에 수집기가 있는 몰은 켜진다 — 카카오도 그중 하나다', () => {
    for (const key of ['kakao', 'onch', 'domeggook', COUPANG_DIRECT_MALL_KEY, 'art09']) {
      expect([key, isBrowserCollectableMall(account(key))]).toEqual([key, true]);
    }
  });

  it('⭐ 셀피아가 가져오거나 길이 없는 몰은 꺼진다', () => {
    for (const key of ['11st', 'gmarket', 'toss', 'thirtymall', 'yoons']) {
      expect([key, isBrowserCollectableMall(account(key))]).toEqual([key, false]);
    }
  });

  it('아이스크림몰만 계정 설정·사용까지 갖춰야 켜진다 — 저장된 계정으로 로그인해 들어간다', () => {
    expect(isBrowserCollectableMall(account('icecream-mall'))).toBe(true);
    expect(isBrowserCollectableMall(account('icecream-mall', { configured: false }))).toBe(false);
    expect(isBrowserCollectableMall(account('icecream-mall', { enabled: false }))).toBe(false);
  });

  it('레지스트리에 없는 키는 꺼진다', () => {
    expect(isBrowserCollectableMall(account('order_collection'))).toBe(false);
  });
});
