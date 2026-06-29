import { describe, expect, it, vi } from 'vitest';
import {
  draftFromMallAccount,
  getOrderCount,
  groupHistoryByDay,
  isBrowserCollectableMall,
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
