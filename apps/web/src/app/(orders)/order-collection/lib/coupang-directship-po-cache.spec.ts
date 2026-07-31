import { beforeEach, describe, expect, it } from 'vitest';
import {
  cacheKey,
  createCoupangDirectPoMemoryCache,
  readCachedDirectshipPos,
  readMemoryCachedDirectshipPos,
  writeCachedDirectshipPos,
  writeMemoryCachedDirectshipPos,
} from './coupang-directship-po-cache';
import type { CoupangDirectPo } from './coupang-directship-api';

const PO = {
  seq: 'PO-1', status: 'PA', center: '인천36', transport: 'MILKRUN',
  edd: '2026-08-04', reg: '2026-07-30', items: [],
} as unknown as CoupangDirectPo;

const SCOPE = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  channelAccountId: '22222222-2222-4222-8222-222222222222',
};

const OTHER_SCOPE = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  channelAccountId: '33333333-3333-4333-8333-333333333333',
};

describe('coupang directship PO cache', () => {
  beforeEach(() => window.localStorage.clear());

  it('returns null before anything is stored', () => {
    expect(readCachedDirectshipPos(SCOPE)).toBeNull();
  });

  it('survives a reload so the calendar opens without waiting', () => {
    writeCachedDirectshipPos(SCOPE, [PO]);
    const cached = readCachedDirectshipPos(SCOPE);
    expect(cached?.pos).toHaveLength(1);
    expect(cached?.pos[0]?.seq).toBe('PO-1');
    expect(cached?.savedAt).toBeGreaterThan(0);
  });

  it('isolates localStorage by organization and Rocket channel account', () => {
    writeCachedDirectshipPos(SCOPE, [PO]);

    expect(readCachedDirectshipPos(OTHER_SCOPE)).toBeNull();
    expect(window.localStorage.getItem(cacheKey(SCOPE))).toContain('PO-1');
    expect(window.localStorage.getItem(cacheKey(OTHER_SCOPE))).toBeNull();
  });

  it('isolates the in-memory cache by organization and Rocket channel account', () => {
    const memory = createCoupangDirectPoMemoryCache();

    writeMemoryCachedDirectshipPos(memory, SCOPE, [PO]);

    expect(readMemoryCachedDirectshipPos(memory, SCOPE)?.[0]?.seq).toBe('PO-1');
    expect(readMemoryCachedDirectshipPos(memory, OTHER_SCOPE)).toBeNull();
  });

  it('ignores corrupted storage instead of throwing', () => {
    window.localStorage.setItem(cacheKey(SCOPE), '{oops');
    expect(readCachedDirectshipPos(SCOPE)).toBeNull();
  });
});
