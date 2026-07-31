import { beforeEach, describe, expect, it } from 'vitest';
import {
  readCachedDirectshipPos,
  writeCachedDirectshipPos,
} from './coupang-directship-po-cache';
import type { CoupangDirectPo } from './coupang-directship-api';

const PO = {
  seq: 'PO-1', status: 'PA', center: '인천36', transport: 'MILKRUN',
  edd: '2026-08-04', reg: '2026-07-30', items: [],
} as unknown as CoupangDirectPo;

describe('coupang directship PO cache', () => {
  beforeEach(() => window.localStorage.clear());

  it('returns null before anything is stored', () => {
    expect(readCachedDirectshipPos()).toBeNull();
  });

  it('survives a reload so the calendar opens without waiting', () => {
    writeCachedDirectshipPos([PO]);
    const cached = readCachedDirectshipPos();
    expect(cached?.pos).toHaveLength(1);
    expect(cached?.pos[0]?.seq).toBe('PO-1');
    expect(cached?.savedAt).toBeGreaterThan(0);
  });

  it('ignores corrupted storage instead of throwing', () => {
    window.localStorage.setItem('kiditem-coupang-direct-pos', '{oops');
    expect(readCachedDirectshipPos()).toBeNull();
  });
});
