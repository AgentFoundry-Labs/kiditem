import { describe, it, expect } from 'vitest';
import {
  buildGradeMap,
  computeListingProfitRate,
  emptyMetrics,
  firstOptionByListing,
  getCurrentPeriod,
  getWeekRange,
  sumListingStock,
  toAdAggregateRows,
  toGradeMapStrict,
  uniqueIds,
} from '../strategy-context';
import type { HydratedListing, InventoryRow } from '../../services/types';

describe('domain/strategy-context — date helpers', () => {
  it('getCurrentPeriod returns year + 1-indexed month from injected Date', () => {
    const fixed = new Date(2026, 3, 19);
    expect(getCurrentPeriod(fixed)).toEqual({ year: 2026, month: 4 });
  });

  it('getCurrentPeriod uses current Date when no arg', () => {
    const result = getCurrentPeriod();
    const now = new Date();
    expect(result.year).toBe(now.getFullYear());
    expect(result.month).toBe(now.getMonth() + 1);
  });

  it('getWeekRange 7d returns 7-day range ending today', () => {
    const { start, end } = getWeekRange('7d');
    const diffDays = Math.round(
      (new Date(end).getTime() - new Date(start).getTime()) / (24 * 60 * 60 * 1000),
    );
    expect(diffDays).toBe(7);
  });

  it('getWeekRange 14d returns 14-day range', () => {
    const { start, end } = getWeekRange('14d');
    const diffDays = Math.round(
      (new Date(end).getTime() - new Date(start).getTime()) / (24 * 60 * 60 * 1000),
    );
    expect(diffDays).toBe(14);
  });

  it('getWeekRange month returns from 1st of current month to today', () => {
    const { start } = getWeekRange('month');
    expect(start.endsWith('-01')).toBe(true);
  });
});

describe('domain/strategy-context — pure transforms', () => {
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

  it('firstOptionByListing picks the first optionId per listing (insertion order)', () => {
    const inv = new Map<string, InventoryRow>([
      ['opt-a', makeInventoryRow('opt-a', 'L1', 0)],
      ['opt-b', makeInventoryRow('opt-b', 'L1', 0)],
      ['opt-c', makeInventoryRow('opt-c', 'L2', 0)],
    ]);
    const map = firstOptionByListing(inv);
    expect(map.get('L1')).toBe('opt-a');
    expect(map.get('L2')).toBe('opt-c');
  });

  it('sumListingStock totals availableStock across a listing', () => {
    const inv = new Map<string, InventoryRow>([
      ['opt-a', makeInventoryRow('opt-a', 'L1', 5)],
      ['opt-b', makeInventoryRow('opt-b', 'L1', 7)],
      ['opt-c', makeInventoryRow('opt-c', 'L2', 99)],
    ]);
    expect(sumListingStock(inv, 'L1')).toBe(12);
    expect(sumListingStock(inv, 'L2')).toBe(99);
  });

  it('computeListingProfitRate returns % scale, 0 when sell <= 0', () => {
    expect(
      computeListingProfitRate({
        optionId: 'opt-1',
        listingId: 'L1',
        availableStock: 10,
        costPrice: 5_000,
        sellPrice: 20_000,
        commissionRate: 0.1,
      } as InventoryRow),
    ).toBe(65);

    expect(
      computeListingProfitRate({
        optionId: 'opt-2',
        listingId: 'L1',
        availableStock: 0,
        costPrice: 5_000,
        sellPrice: 0,
        commissionRate: 0.1,
      } as InventoryRow),
    ).toBe(0);

    expect(computeListingProfitRate(null)).toBe(0);
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

function makeInventoryRow(optionId: string, listingId: string, availableStock: number): InventoryRow {
  return {
    optionId,
    listingId,
    availableStock,
    costPrice: null,
    sellPrice: null,
    commissionRate: null,
  };
}
