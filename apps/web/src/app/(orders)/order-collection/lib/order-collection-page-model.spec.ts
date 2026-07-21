import { describe, expect, it, vi } from 'vitest';
import {
  draftFromMallAccount,
  getOrderCount,
  groupHistoryByDay,
  hasSellpiaTransmissionRequest,
  isAuthRequiredMessage,
  isBrowserCollectableMall,
  isLoginRequiredMessage,
  isNoNewOrdersMessage,
  todayYmd,
} from './order-collection-page-model';
import type { OrderCollectionMallAccount } from './order-mall-account-api';
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
