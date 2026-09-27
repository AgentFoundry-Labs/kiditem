import { describe, expect, it } from 'vitest';
import { profitWindowTotals, type ProfitListingIdentity, type ProfitWindowFacts } from './per-listing-profit';

/**
 * KID-368·372 — 이익의 광고비는 청구액 기준이다: (상품 행 청구액 + 계정 조정) × 1.1, 원 단위 반올림은 마지막에 한 번.
 * 계정 조정은 `adCost`에 들어 있고 `adAccountAdjustment`로 따로 보인다. 팔린 줄 없는 리스팅의 청구액은 `unallocatedAdCost`.
 */
const listing = (listingId: string): ProfitListingIdentity => ({
  listingId,
  externalId: `EXT-${listingId}`,
  channelName: null,
  channel: 'coupang',
  adSweepCovers: true,
  masterProductId: null,
  masterCode: listingId,
  masterName: listingId,
  category: null,
  thumbnailUrl: null,
});

function facts(overrides: Partial<ProfitWindowFacts['ad']> = {}): ProfitWindowFacts {
  const window = { from: new Date('2026-03-31T15:00:00Z'), to: new Date('2026-04-01T15:00:00Z') };
  return {
    window: { requested: window, effective: window },
    orderWindow: {
      revenue: 100_000,
      orderCount: 1,
      quantity: 1,
      observedAt: null,
      observedTotals: null,
      requestedDates: ['2026-04-01'],
      includedDates: ['2026-04-01'],
      missingDates: [],
      sourceCoverage: [],
    },
    orderShipping: 0,
    lines: [{
      orderId: 'O1',
      listing: listing('L1'),
      revenue: 100_000,
      shippingCost: 0,
      costOfGoods: 50_000,
      commissionApplies: false,
      otherCostApplies: false,
      commission: 0,
      otherCost: 0,
    }],
    unmappedLineCount: 0,
    unallocatedShipping: 0,
    ad: {
      hasAdAccount: true,
      publishedDates: 1,
      accountSpend: 9_000,
      accountBilledSpend: 7_001,
      accountAdjustment: 300,
      coversWindow: true,
      requestedDates: ['2026-04-01'],
      measuredDates: ['2026-04-01'],
      ...overrides,
    },
    listingBilledSpend: new Map([['L1', 5_001], ['L2', 2_000]]),
    gradeByProductId: new Map(),
  };
}

describe('profitWindowTotals — 이익 광고비 규칙', () => {
  it('charges (billed spend + account adjustment) × 1.1 once, and shows the adjustment on its own line', () => {
    const totals = profitWindowTotals(facts());

    expect(totals).toMatchObject({
      adCost: 8_031, // (7_001 + 300) × 1.1 = 8_031.1
      adAccountAdjustment: 330,
      unallocatedAdCost: 2_200, // L2 sold nothing: 2_000 × 1.1
      cost: 58_031,
      netProfit: 41_969,
    });
    expect(totals).not.toHaveProperty('adCostGrainDifference');
  });

  it('publishes no ad cost, adjustment or unallocated part while the window is only partly measured', () => {
    expect(profitWindowTotals(facts({ coversWindow: false }))).toMatchObject({
      adCost: null,
      adAccountAdjustment: null,
      unallocatedAdCost: null,
      netProfit: null,
    });
  });

  it('reads zero advertising, adjustment included, for an organization with no ad account', () => {
    expect(profitWindowTotals({ ...facts({ hasAdAccount: false, publishedDates: 0, accountBilledSpend: 0, accountAdjustment: 0, accountSpend: 0 }), listingBilledSpend: new Map() })).toMatchObject({
      adCost: 0,
      adAccountAdjustment: 0,
      unallocatedAdCost: 0,
      netProfit: 50_000,
    });
  });
});
