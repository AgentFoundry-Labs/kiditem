import { describe, it, expect } from 'vitest';
import * as strategyContext from '../strategy-context';
import {
  buildGradeMap,
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

  it('toAdAggregateRows maps per-listing measured facts and publishes an unobserved conversion column as null', () => {
    expect(toAdAggregateRows([
      { listingId: 'L1', spend: 100, revenue: 500, clicks: 10, impressions: 1000, conversions: 1, conversionsObserved: true },
      { listingId: 'L2', spend: 100, revenue: 500, clicks: 10, impressions: 1000, conversions: 0, conversionsObserved: false },
    ])).toEqual([
      { listingId: 'L1', spend: 100, revenue: 500, clicks: 10, impressions: 1000, conversions: 1 },
      { listingId: 'L2', spend: 100, revenue: 500, clicks: 10, impressions: 1000, conversions: null },
    ]);
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
    channel: 'coupang',
    masterProduct: {
      id: `M-${id}`,
      code: `M-${id}`,
      name: `Listing ${id}`,
      abcGrade,
      adTier: null,
    },
    primaryOption: null,
  };
}
