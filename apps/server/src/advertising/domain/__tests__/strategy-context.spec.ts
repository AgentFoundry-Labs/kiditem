import { describe, it, expect } from 'vitest';
import * as strategyContext from '../strategy-context';
import {
  buildGradeMap,
  computeListingProfitRate,
  emptyMetrics,
  getCurrentPeriod,
  getWeekRange,
  toAdAggregateRows,
  toGradeMapStrict,
  uniqueIds,
} from '../strategy-context';
import type { HydratedListing } from '../model/strategy-types';

describe('domain/strategy-context — date helpers', () => {
  it('getCurrentPeriod returns the KST year + 1-indexed month', () => {
    const fixed = new Date('2026-04-30T16:00:00.000Z');
    expect(getCurrentPeriod(fixed)).toEqual({ year: 2026, month: 5 });
  });

  it('getCurrentPeriod uses current Date when no arg', () => {
    const result = getCurrentPeriod();
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    expect(result.year).toBe(kstNow.getUTCFullYear());
    expect(result.month).toBe(kstNow.getUTCMonth() + 1);
  });

  it('getWeekRange 7d returns exactly seven complete dates ending yesterday', () => {
    expect(
      getWeekRange('7d', new Date('2026-07-24T03:00:00.000Z')),
    ).toEqual({
      start: '2026-07-17',
      end: '2026-07-23',
    });
  });

  it('getWeekRange 14d returns exactly fourteen complete dates', () => {
    expect(
      getWeekRange('14d', new Date('2026-07-24T03:00:00.000Z')),
    ).toEqual({
      start: '2026-07-10',
      end: '2026-07-23',
    });
  });

  it('getWeekRange month returns from KST month start through yesterday', () => {
    expect(
      getWeekRange('month', new Date('2026-07-24T03:00:00.000Z')),
    ).toEqual({
      start: '2026-07-01',
      end: '2026-07-23',
    });
  });
});

describe('domain/strategy-context — pure transforms', () => {
  it('computes exact component purchase cost only when every Sellpia price is known', () => {
    const compute = (
      strategyContext as Record<string, unknown>
    ).computeChannelSkuPurchaseCost as undefined | ((components: Array<{
      purchasePrice: number | null;
      quantity: number;
    }>) => number | null);

    expect(compute).toBeTypeOf('function');
    expect(compute!([
      { purchasePrice: 1200, quantity: 2 },
      { purchasePrice: 800, quantity: 3 },
    ])).toBe(4800);
    expect(compute!([
      { purchasePrice: 1200, quantity: 2 },
      { purchasePrice: null, quantity: 1 },
    ])).toBeNull();
    expect(compute!([])).toBeNull();
  });

  it('hydrates the primary ChannelSku with exact capacity, sale price, and component cost', () => {
    const apply = (
      strategyContext as Record<string, unknown>
    ).applyChannelSkuAvailability as undefined | ((
      listings: HydratedListing[],
      availability: Array<{
        sku: { id: string; sellableStock: number | null; salePrice: number | null };
        components: Array<{ purchasePrice: number | null; quantity: number }>;
      }>,
    ) => HydratedListing[]);
    const listing = makeHydratedListing('L1', 'A');
    listing.primaryOption = {
      listingOptionId: 'sku-1',
      sellableStock: null,
      purchaseCost: null,
      salePrice: null,
      commissionRate: 0.1,
      shippingCost: 2500,
    };

    expect(apply).toBeTypeOf('function');
    const [hydrated] = apply!([listing], [{
      sku: { id: 'sku-1', sellableStock: 4, salePrice: 20_000 },
      components: [
        { purchasePrice: 1200, quantity: 2 },
        { purchasePrice: 800, quantity: 1 },
      ],
    }]);

    expect(hydrated.primaryOption).toMatchObject({
      sellableStock: 4,
      purchaseCost: 3200,
      salePrice: 20_000,
    });
  });

  it('uniqueIds drops nullish + dedupes', () => {
    expect(uniqueIds(['a', 'b', null, 'a', undefined, 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('buildGradeMap maps A/B/C, normalizes others to null', () => {
    const listings: HydratedListing[] = [
      makeHydratedListing('L1', 'A'),
      makeHydratedListing('L2', 'B'),
      makeHydratedListing('L3', 'C'),
      makeHydratedListing('L4', null),
    ];
    const map = buildGradeMap(listings);
    expect(map.get('L1')).toBe('A');
    expect(map.get('L2')).toBe('B');
    expect(map.get('L3')).toBe('C');
    expect(map.get('L4')).toBeNull();
  });

  it('toGradeMapStrict drops null grades for budget allocator input', () => {
    const map = new Map<string, 'A' | 'B' | 'C' | null>([
      ['L1', 'A'],
      ['L2', null],
    ]);
    const strict = toGradeMapStrict(map);
    expect(strict.get('L1')).toBe('A');
    expect(strict.has('L2')).toBe(false);
  });

  it('toAdAggregateRows folds groupBy result, drops null listingId', () => {
    const rows = toAdAggregateRows([
      {
        listingId: 'L1',
        _sum: {
          adSpend: 100,
          adRevenue: 500,
          adClicks: 10,
          adImpressions: 1000,
          adConversions: 1,
        },
      },
      {
        listingId: null,
        _sum: {
          adSpend: 1,
          adRevenue: 2,
          adClicks: 3,
          adImpressions: 4,
          adConversions: 5,
        },
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      listingId: 'L1',
      spend: 100,
      revenue: 500,
      clicks: 10,
      impressions: 1000,
      conversions: 1,
    });
  });

  it('computeListingProfitRate returns % scale, 0 when sell <= 0', () => {
    expect(
      computeListingProfitRate({
        listingOptionId: 'opt-1',
        sellableStock: 10,
        purchaseCost: 5_000,
        salePrice: 20_000,
        commissionRate: 0.1,
        shippingCost: null,
      }),
    ).toBe(65);

    expect(
      computeListingProfitRate({
        listingOptionId: 'opt-2',
        sellableStock: 0,
        purchaseCost: 5_000,
        salePrice: 0,
        commissionRate: 0.1,
        shippingCost: null,
      }),
    ).toBe(0);

    expect(computeListingProfitRate(null)).toBe(0);
  });

  it('computeListingProfitRate returns negative when cost exceeds sell minus commission', () => {
    // sell 10_000, cost 12_000, 10% commission → (10_000 - 12_000 - 1_000)/10_000 = -30%.
    // ad-strategy downstream rules (e.g. C-1 minus profit warning) rely on the negative
    // value being preserved; treating "loss" as 0 would silently mask C-grade actions.
    expect(
      computeListingProfitRate({
        listingOptionId: 'opt-loss',
        sellableStock: 5,
        purchaseCost: 12_000,
        salePrice: 10_000,
        commissionRate: 0.1,
        shippingCost: null,
      }),
    ).toBe(-30);
  });

  it('computeListingProfitRate treats null commissionRate as 0', () => {
    // Channel data sometimes lands without commission; we must not throw or return NaN.
    expect(
      computeListingProfitRate({
        listingOptionId: 'opt-no-commission',
        sellableStock: 5,
        purchaseCost: 4_000,
        salePrice: 10_000,
        commissionRate: null,
        shippingCost: null,
      }),
    ).toBe(60);
  });

  it('computeListingProfitRate treats null costPrice as neutral', () => {
    // Missing cost is unknown, not free inventory. Exposure scoring treats
    // profitRate > 10 as a strong positive signal, so keep missing cost neutral.
    expect(
      computeListingProfitRate({
        listingOptionId: 'opt-no-cost',
        sellableStock: 5,
        purchaseCost: null,
        salePrice: 10_000,
        commissionRate: 0,
        shippingCost: null,
      }),
    ).toBe(0);
  });

  it('computeListingProfitRate handles 100% commission cleanly (zero margin)', () => {
    // Edge case: commission consumes all revenue. With cost 0 + commission 1.0 the
    // margin should be exactly 0%, not -0% or NaN.
    expect(
      computeListingProfitRate({
        listingOptionId: 'opt-full-commission',
        sellableStock: 5,
        purchaseCost: 0,
        salePrice: 10_000,
        commissionRate: 1,
        shippingCost: null,
      }),
    ).toBe(0);
  });

  it('emptyMetrics returns zero-metric row with null ratios', () => {
    const row = emptyMetrics('L1');
    expect(row.listingId).toBe('L1');
    expect(row.metrics.spend).toBe(0);
    expect(row.metrics.ctr).toBeNull();
    expect(row.metrics.roas).toBeNull();
    expect(row.metrics.cvr).toBeNull();
  });
});

function makeHydratedListing(
  id: string,
  abcGrade: 'A' | 'B' | 'C' | null,
): HydratedListing {
  return {
    id,
    externalId: `EXT-${id}`,
    channelName: 'coupang',
    masterProduct: {
      id: `M-${id}`,
      code: `M-${id}`,
      name: `Listing ${id}`,
      abcGrade,
      adTier: null,
      healthScore: null,
    },
    primaryOption: null,
  };
}
