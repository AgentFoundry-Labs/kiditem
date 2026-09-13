import { describe, it, expect, beforeEach } from 'vitest';
import { AdBudgetAllocatorService } from '../ad-budget-allocator.service';
import type {
  AdAggregateRow,
  AdsConfig,
  HydratedListing,
} from '../../../domain/model/strategy-types';

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

const listingA: HydratedListing = {
  id: 'L_A',
  externalId: 'EXT-A',
  channelName: 'Ch-A',
  channel: 'coupang',
  masterProduct: {
    id: 'M-A',
    code: 'M-A',
    name: 'A 상품',
    abcGrade: 'A',
  },
  primaryOption: null,
};

const listingB: HydratedListing = {
  id: 'L_B',
  externalId: 'EXT-B',
  channelName: 'Ch-B',
  channel: 'coupang',
  masterProduct: {
    id: 'M-B',
    code: 'M-B',
    name: 'B 상품',
    abcGrade: 'B',
  },
  primaryOption: null,
};

const listingC: HydratedListing = {
  id: 'L_C',
  externalId: 'EXT-C',
  channelName: 'Ch-C',
  channel: 'coupang',
  masterProduct: {
    id: 'M-C',
    code: 'M-C',
    name: 'C 상품',
    abcGrade: 'C',
  },
  primaryOption: null,
};

const emptyConfig: AdsConfig = {
  roas: { thresholds: { excellent: 0, warning: 0, poor: 0 } },
  adRate: { thresholds: { warning: 0, critical: 0 } },
  budget: { allocation: { A: 0.5, B: 0.3, C: 0.2 } },
  roasTargetByGrade: {},
  adRateTargetByGrade: {},
  tier: { dailyBudget: {} },
  benchmark: {
    roas: { avg: 0, good: 0, excellent: 0, poor: 0 },
    ctr: { avg: 0, good: 0, excellent: 0, poor: 0 },
    cvr: { avg: 0, good: 0, excellent: 0, poor: 0 },
    cpc: { avg: 0, good: 0, excellent: 0, poor: 0 },
    adRate: { avg: 0, good: 0, excellent: 0, poor: 0 },
    acos: { avg: 0, good: 0, excellent: 0, poor: 0 },
  },
  gradeStrategy: {},
};

describe('AdBudgetAllocatorService.calcBudgetAllocation', () => {
  let service: AdBudgetAllocatorService;
  beforeEach(() => {
    service = new AdBudgetAllocatorService();
  });

  it('per-grade currentBudget aggregation + suggested ratio (A=0.5, B=0.3, C=0.2)', () => {
    const result = service.calcBudgetAllocation({
      config: emptyConfig,
      adGroups: [
        { listingId: 'L_A', spend: 6000, impressions: 0, clicks: 0, conversions: 0, revenue: 0 },
        { listingId: 'L_B', spend: 3000, impressions: 0, clicks: 0, conversions: 0, revenue: 0 },
        { listingId: 'L_C', spend: 1000, impressions: 0, clicks: 0, conversions: 0, revenue: 0 },
      ],
      listings: [listingA, listingB, listingC],
      gradeMap: new Map([
        ['L_A', 'A'],
        ['L_B', 'B'],
        ['L_C', 'C'],
      ]),
    });
    expect(result).toHaveLength(3);
    const rowA = result.find((r) => r.grade === 'A')!;
    const rowB = result.find((r) => r.grade === 'B')!;
    const rowC = result.find((r) => r.grade === 'C')!;
    // total = 10000. suggested A = 5000, B = 3000, C = 2000.
    expect(rowA.currentBudget).toBe(6000);
    expect(rowA.suggestedBudget).toBe(5000);
    expect(rowA.delta).toBe(-1000);
    expect(rowB.currentBudget).toBe(3000);
    expect(rowB.suggestedBudget).toBe(3000);
    expect(rowB.delta).toBe(0);
    expect(rowC.currentBudget).toBe(1000);
    expect(rowC.suggestedBudget).toBe(2000);
    expect(rowC.delta).toBe(1000);
  });

  it('returns 0/0 buckets when there is no spend at all', () => {
    const result = service.calcBudgetAllocation({
      config: emptyConfig,
      adGroups: [],
      listings: [],
      gradeMap: new Map(),
    });
    expect(result).toHaveLength(3);
    for (const r of result) {
      expect(r.currentBudget).toBe(0);
      expect(r.suggestedBudget).toBe(0);
      expect(r.delta).toBe(0);
    }
  });

  it('skips adGroups whose listing is missing from gradeMap', () => {
    const result = service.calcBudgetAllocation({
      config: emptyConfig,
      adGroups: [
        { listingId: 'UNKNOWN', spend: 9999, impressions: 0, clicks: 0, conversions: 0, revenue: 0 },
        { listingId: 'L_A', spend: 1000, impressions: 0, clicks: 0, conversions: 0, revenue: 0 },
      ],
      listings: [listingA],
      gradeMap: new Map([['L_A', 'A']]),
    });
    const rowA = result.find((r) => r.grade === 'A')!;
    // total spend = 9999 + 1000 = 10999 (UNKNOWN counted in total but not grade)
    expect(rowA.currentBudget).toBe(1000);
    // suggested = round(10999 * 0.5) = 5500
    expect(rowA.suggestedBudget).toBe(5500);
  });
});

// ─────────────────────────────────────────────
// calcTop20
// ─────────────────────────────────────────────

describe('AdBudgetAllocatorService.calcTop20', () => {
  let service: AdBudgetAllocatorService;
  beforeEach(() => {
    service = new AdBudgetAllocatorService();
  });

  it('orders by spend desc, tie-break revenue desc, take 20, rank 1-indexed', () => {
    const adGroups: AdAggregateRow[] = [
      { listingId: 'L_A', spend: 10000, impressions: 0, clicks: 0, conversions: 0, revenue: 30000 },
      { listingId: 'L_B', spend: 10000, impressions: 0, clicks: 0, conversions: 0, revenue: 50000 },
      { listingId: 'L_C', spend: 5000, impressions: 0, clicks: 0, conversions: 0, revenue: 0 },
    ];
    const result = service.calcTop20({
      listings: [listingA, listingB, listingC],
      adGroups,
      trafficByListing: new Map(),
    });
    expect(result).toHaveLength(3);
    // L_B 우선 (spend tie + 더 높은 revenue), 다음 L_A, L_C
    expect(result[0].listing.listingId).toBe('L_B');
    expect(result[0].rank).toBe(1);
    expect(result[1].listing.listingId).toBe('L_A');
    expect(result[1].rank).toBe(2);
    expect(result[2].listing.listingId).toBe('L_C');
    expect(result[2].rank).toBe(3);
  });

  it('drops listings with no signal at all (no ad, no traffic)', () => {
    const result = service.calcTop20({
      listings: [listingA, listingB],
      adGroups: [
        { listingId: 'L_A', spend: 1000, impressions: 0, clicks: 0, conversions: 0, revenue: 5000 },
      ],
      trafficByListing: new Map(),
    });
    expect(result).toHaveLength(1);
    expect(result[0].listing.listingId).toBe('L_A');
  });

  it('caps output at 20 even when there are more candidates', () => {
    const listings: HydratedListing[] = [];
    const adGroups: AdAggregateRow[] = [];
    for (let i = 0; i < 25; i += 1) {
      const id = `L_${i}`;
      listings.push({
        id,
        externalId: `EXT-${i}`,
        channelName: `Ch-${i}`,
        channel: 'coupang',
        masterProduct: {
          id: `M-${i}`,
          code: `M-${i}`,
          name: `상품${i}`,
          abcGrade: 'B',
        },
        primaryOption: null,
      });
      adGroups.push({
        listingId: id,
        spend: 1000 + i,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
      });
    }
    const result = service.calcTop20({ listings, adGroups, trafficByListing: new Map() });
    expect(result).toHaveLength(20);
    // 첫 번째 = spend 가장 큰 listing (i=24)
    expect(result[0].listing.listingId).toBe('L_24');
    expect(result[0].rank).toBe(1);
    expect(result[19].rank).toBe(20);
  });

  it('returns AdListingSummary with option:null + masterProduct trimmed (toListingSummary)', () => {
    const result = service.calcTop20({
      listings: [listingA],
      adGroups: [
        { listingId: 'L_A', spend: 100, impressions: 1000, clicks: 50, conversions: 5, revenue: 500 },
      ],
      trafficByListing: new Map(),
    });
    expect(result[0].listing).toEqual({
      listingId: 'L_A',
      externalId: 'EXT-A',
      channelName: 'Ch-A',
      masterProduct: { id: 'M-A', code: 'M-A', name: 'A 상품' },
      option: null,
    });
    // metrics ratio sanity: ctr = 50/1000 * 100 = 5
    expect(result[0].metrics.ctr).toBeCloseTo(5);
    expect(result[0].metrics.roas).toBeCloseTo(500);
    expect(result[0].metrics.cvr).toBeCloseTo(10);
  });

  it('uses traffic as a tie-breaker but keeps ad metrics truthful (zero stays zero)', () => {
    const result = service.calcTop20({
      listings: [listingA, listingB, listingC],
      adGroups: [
        { listingId: 'L_A', spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 },
        { listingId: 'L_B', spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 },
        { listingId: 'L_C', spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 },
      ],
      trafficByListing: new Map([
        ['L_A', { revenue: 50000, orders: 5 }],
        ['L_B', { revenue: 100000, orders: 8 }],
        ['L_C', { revenue: 0, orders: 0 }],
      ]),
    });
    // L_C drops (no signal), L_B then L_A by traffic; ad metrics stay 0 — never replaced.
    expect(result).toHaveLength(2);
    expect(result[0].listing.listingId).toBe('L_B');
    expect(result[0].metrics.spend).toBe(0);
    expect(result[0].metrics.revenue).toBe(0);
    expect(result[0].traffic).toEqual({ revenue: 100000, orders: 8 });
    expect(result[1].listing.listingId).toBe('L_A');
  });
});
