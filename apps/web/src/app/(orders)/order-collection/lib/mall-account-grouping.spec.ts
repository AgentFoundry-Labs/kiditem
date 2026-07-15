import { describe, expect, it } from 'vitest';
import type { MallCollectionStat } from './order-collection-stats';
import type { OrderCollectionMallAccount } from './order-mall-account-api';
import { classifyMallAccount } from './mall-account-grouping';

function account(
  key: string,
  overrides: Partial<OrderCollectionMallAccount> = {},
): OrderCollectionMallAccount {
  return {
    key,
    name: key,
    configured: overrides.configured ?? true,
    enabled: overrides.enabled ?? true,
    loginId: overrides.loginId ?? null,
    hasPassword: overrides.hasPassword ?? false,
    siteUrl: overrides.siteUrl ?? null,
    memo: overrides.memo ?? null,
    passwordUpdatedAt: overrides.passwordUpdatedAt ?? null,
    updatedAt: overrides.updatedAt ?? null,
  };
}

function pendingStat(key: string): MallCollectionStat {
  return {
    key,
    name: key,
    files: 1,
    orderRows: 2,
    newRows: 1,
    productRows: 2,
    latestAt: Date.now(),
  };
}

describe('classifyMallAccount', () => {
  it('classifies an enabled extension-session mall without credentials as collectable', () => {
    const kakao = account('kakao', { configured: false });

    expect(classifyMallAccount(kakao, undefined)).toBe('collectable');
  });

  it('prioritizes active and pending collection for an enabled extension-session mall', () => {
    const kidsnote = account('kidsnote', { configured: false });

    expect(classifyMallAccount(kidsnote, undefined, true)).toBe('action');
    expect(classifyMallAccount(kidsnote, pendingStat(kidsnote.key))).toBe('action');
  });

  it('keeps disabled or genuinely non-collectable accounts in setup', () => {
    expect(classifyMallAccount(account('kakao', { enabled: false }), undefined)).toBe('setup');
    expect(classifyMallAccount(account('unsupported-mall'), undefined)).toBe('setup');
  });
});
