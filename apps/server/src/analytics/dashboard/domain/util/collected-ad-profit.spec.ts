import { describe, expect, it } from 'vitest';
import { reconcileCollectedAdSpend } from './collected-ad-profit';

describe('reconcileCollectedAdSpend', () => {
  const base = {
    revenue: 100_000,
    adCost: 10_000,
    netProfit: 40_000,
    profitRate: 40,
  };

  it('수집한 쿠팡 광고비가 더 크면 차액만큼 순이익에서 추가 차감한다', () => {
    expect(reconcileCollectedAdSpend(base, { spend: 30_000, hasData: true })).toEqual({
      revenue: 100_000,
      adCost: 30_000,
      netProfit: 20_000,
      profitRate: 20,
    });
  });

  it('수집 데이터가 없거나 더 작으면 기존 일별 광고비를 유지한다', () => {
    expect(reconcileCollectedAdSpend(base, { spend: 50_000, hasData: false })).toBe(base);
    expect(reconcileCollectedAdSpend(base, { spend: 5_000, hasData: true })).toBe(base);
  });
});
