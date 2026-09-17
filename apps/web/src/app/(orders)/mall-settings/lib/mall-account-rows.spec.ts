import { describe, expect, it } from 'vitest';
import type { OrderCollectionMallAccount } from '../../order-collection/lib/order-mall-account-api';
import {
  buildMallAccountRows,
  draftFromAccount,
  isDraftDirty,
  summarizeMallAccountRows,
  updateInputFromDraft,
} from './mall-account-rows';
import { mallCapabilities, mallReadiness } from './mall-capabilities';

function account(patch: Partial<OrderCollectionMallAccount> = {}): OrderCollectionMallAccount {
  return {
    key: 'kakao',
    name: '카카오',
    configured: true,
    enabled: true,
    loginId: 'operator',
    supplierLoginId: null,
    hasPassword: true,
    siteUrl: 'https://example.test',
    memo: null,
    passwordUpdatedAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...patch,
  };
}

describe('mallCapabilities', () => {
  it('marks a mall with a collection pipeline as supported', () => {
    expect(mallCapabilities('kakao').collection).toBe(true);
  });

  it('marks a mall without a pipeline as unsupported', () => {
    expect(mallCapabilities('gmarket').collection).toBe(false);
    expect(mallCapabilities('yoons').collection).toBe(false);
  });

  it('reports collection support for a mall that only needs its account filled in', () => {
    // 아이스크림몰 판정은 설정·사용 여부까지 보지만, 지원 여부는 그와 별개다.
    expect(mallCapabilities('icecream-mall').collection).toBe(true);
  });
});

describe('mallReadiness', () => {
  it('puts a pipeline-less mall in 준비 중 even with a full account', () => {
    expect(mallReadiness(account({ key: 'gmarket', configured: true, enabled: true }))).toBe('preparing');
  });

  it('separates 계정 필요 / 중지 / 사용 중', () => {
    expect(mallReadiness(account({ configured: false }))).toBe('needs_account');
    expect(mallReadiness(account({ enabled: false }))).toBe('paused');
    expect(mallReadiness(account())).toBe('ready');
  });
});

describe('isDraftDirty', () => {
  it('is clean for an untouched draft', () => {
    const row = account();
    expect(isDraftDirty(row, draftFromAccount(row))).toBe(false);
  });

  it('never seeds the saved password into the draft', () => {
    expect(draftFromAccount(account()).password).toBe('');
  });

  it('treats any typed password as a change', () => {
    const row = account();
    expect(isDraftDirty(row, { ...draftFromAccount(row), password: 'new-secret' })).toBe(true);
  });

  it('does not treat a revealed password as a change', () => {
    const row = account();
    const revealed = { ...draftFromAccount(row), password: 'saved', seededPassword: 'saved' };
    expect(isDraftDirty(row, revealed)).toBe(false);
    expect('password' in updateInputFromDraft(revealed)).toBe(false);
  });

  it('treats editing a revealed password as a change', () => {
    const row = account();
    const edited = { ...draftFromAccount(row), password: 'saved-v2', seededPassword: 'saved' };
    expect(isDraftDirty(row, edited)).toBe(true);
    expect(updateInputFromDraft(edited).password).toBe('saved-v2');
  });

  it('detects edited fields', () => {
    const row = account();
    expect(isDraftDirty(row, { ...draftFromAccount(row), loginId: 'other' })).toBe(true);
    expect(isDraftDirty(row, { ...draftFromAccount(row), enabled: false })).toBe(true);
  });
});

describe('updateInputFromDraft', () => {
  it('omits the password when it was left blank so the stored one survives', () => {
    const input = updateInputFromDraft({ ...draftFromAccount(account()), password: '   ' });
    expect('password' in input).toBe(false);
  });

  it('sends a typed password trimmed', () => {
    const input = updateInputFromDraft({ ...draftFromAccount(account()), password: ' secret ' });
    expect(input.password).toBe('secret');
  });
});

describe('summarizeMallAccountRows', () => {
  it('counts each readiness bucket and pending edits', () => {
    const accounts = [
      account(),
      account({ key: 'onch', name: '온채널', configured: false }),
      account({ key: 'gmarket', name: '지마켓' }),
    ];
    const rows = buildMallAccountRows(accounts, {
      kakao: { ...draftFromAccount(accounts[0]!), loginId: 'changed' },
    });
    expect(summarizeMallAccountRows(rows)).toEqual({
      total: 3,
      ready: 1,
      needsAccount: 1,
      preparing: 1,
      dirty: 1,
    });
  });
});
