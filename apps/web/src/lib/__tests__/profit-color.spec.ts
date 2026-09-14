import { describe, expect, it } from 'vitest';
import { AD_COST_TEXT_COLOR, getProfitAmountColor, getProfitColor } from '../utils';

describe('getProfitColor', () => {
  it('reads a margin rate: loss first, then the thin-margin band, then positive', () => {
    expect(getProfitColor(-0.1).split(' ')).toContain('text-red-600');
    expect(getProfitColor(0).split(' ')).toContain('text-orange-500');
    expect(getProfitColor(3).split(' ')).toContain('text-orange-500');
    expect(getProfitColor(3.1).split(' ')).toContain('text-green-600');
  });

  it('keeps an unavailable rate on the neutral tone', () => {
    expect(getProfitColor(null)).toBe('text-slate-400');
    expect(getProfitColor(undefined)).toBe('text-slate-400');
  });
});

describe('getProfitAmountColor', () => {
  it('colours a loss before anything else', () => {
    expect(getProfitAmountColor(-1)).toBe('text-red-600');
    expect(getProfitAmountColor(-1_000_000)).toBe('text-red-600');
  });

  it('colours every non-negative amount positive, with no thin-margin band', () => {
    // 3원 of profit is not a 3% margin: the rate-only band must not reach here.
    for (const amount of [0, 1, 3, 1_000_000]) {
      expect(getProfitAmountColor(amount)).toBe('text-green-600');
    }
  });

  it('keeps an unavailable amount on the same neutral tone as a rate', () => {
    expect(getProfitAmountColor(null)).toBe(getProfitColor(null));
    expect(getProfitAmountColor(undefined)).toBe(getProfitColor(null));
  });

  it('stays the weight-free half of the rate palette', () => {
    expect(getProfitColor(-1).split(' ')).toContain(getProfitAmountColor(-1));
    expect(getProfitColor(100).split(' ')).toContain(getProfitAmountColor(100));
    expect(getProfitAmountColor(-1)).not.toMatch(/font-/);
    expect(getProfitAmountColor(1)).not.toMatch(/font-/);
  });
});

describe('AD_COST_TEXT_COLOR', () => {
  it('marks ad spend with the caution tone, not a profit tone', () => {
    expect(AD_COST_TEXT_COLOR).toBe('text-amber-600');
    expect(AD_COST_TEXT_COLOR).not.toBe(getProfitAmountColor(-1));
    expect(AD_COST_TEXT_COLOR).not.toBe(getProfitAmountColor(1));
  });
});
