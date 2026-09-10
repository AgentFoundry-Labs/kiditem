import { describe, expect, it } from 'vitest';
import { reconcileCollectedAdSpend } from './collected-ad-profit';

describe('reconcileCollectedAdSpend', () => {
  const base = {
    revenue: 100_000,
    adCost: 10_000,
    netProfit: 40_000 as number | null,
    profitRate: 40 as number | null,
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

  describe('순이익 근거가 없는 집계', () => {
    const unavailable = {
      revenue: 100_000,
      adCost: 10_000,
      netProfit: null,
      profitRate: null,
    };

    it('측정된 광고비는 반영하되 순이익/이익률은 null로 유지한다', () => {
      expect(reconcileCollectedAdSpend(unavailable, { spend: 30_000, hasData: true })).toEqual({
        revenue: 100_000,
        adCost: 30_000,
        netProfit: null,
        profitRate: null,
      });
    });

    it('수집 데이터가 없거나 더 작으면 집계를 그대로 반환한다', () => {
      expect(reconcileCollectedAdSpend(unavailable, { spend: 50_000, hasData: false })).toBe(
        unavailable,
      );
      expect(reconcileCollectedAdSpend(unavailable, { spend: 5_000, hasData: true })).toBe(
        unavailable,
      );
    });

    it('추가 필드를 보존하면서 광고비만 갱신한다', () => {
      const withEvidence = { ...unavailable, costComplete: false, orderCount: 12 };
      expect(reconcileCollectedAdSpend(withEvidence, { spend: 25_000, hasData: true })).toEqual({
        revenue: 100_000,
        adCost: 25_000,
        netProfit: null,
        profitRate: null,
        costComplete: false,
        orderCount: 12,
      });
    });
  });
});
