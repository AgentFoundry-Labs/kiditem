import { describe, it, expect, beforeEach } from 'vitest';
import { AdBudgetAllocatorService } from '../ad-budget-allocator.service';
import type {
  AdAggregateRow,
  AdsConfig,
  HydratedListing,
  KeyMetricsInput,
} from '../types';

// ─────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────

const listingA: HydratedListing = {
  id: 'L_A',
  externalId: 'EXT-A',
  channelName: 'Ch-A',
  masterProduct: {
    id: 'M-A',
    code: 'M-A',
    name: 'A 상품',
    abcGrade: 'A',
    adTier: '1차',
    healthScore: 80,
  },
  primaryOption: null,
};

const listingB: HydratedListing = {
  id: 'L_B',
  externalId: 'EXT-B',
  channelName: 'Ch-B',
  masterProduct: {
    id: 'M-B',
    code: 'M-B',
    name: 'B 상품',
    abcGrade: 'B',
    adTier: '2차',
    healthScore: 60,
  },
  primaryOption: null,
};

const listingC: HydratedListing = {
  id: 'L_C',
  externalId: 'EXT-C',
  channelName: 'Ch-C',
  masterProduct: {
    id: 'M-C',
    code: 'M-C',
    name: 'C 상품',
    abcGrade: 'C',
    adTier: '3차',
    healthScore: 30,
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

// ─────────────────────────────────────────────
// calcSnapshotKeyMetrics
// ─────────────────────────────────────────────

describe('AdBudgetAllocatorService.calcSnapshotKeyMetrics', () => {
  let service: AdBudgetAllocatorService;
  beforeEach(() => {
    service = new AdBudgetAllocatorService();
  });

  it('aggregates totals + perListing + gradeMap from snapshots', () => {
    const result = service.calcSnapshotKeyMetrics({
      snapshots: [
        { listingId: 'L_A', spend: 10000, revenue: 50000, clicks: 100, impressions: 1000, conversions: 5 },
        { listingId: 'L_B', spend: 5000, revenue: 10000, clicks: 50, impressions: 500, conversions: 2 },
      ],
      listings: [listingA, listingB],
    });
    expect(result.totals.spend).toBe(15000);
    expect(result.totals.revenue).toBe(60000);
    expect(result.totals.clicks).toBe(150);
    expect(result.totals.impressions).toBe(1500);
    expect(result.totals.conversions).toBe(7);

    const aRow = result.perListing.get('L_A');
    expect(aRow).toBeDefined();
    expect(aRow!.metrics.spend).toBe(10000);
    expect(aRow!.metrics.roas).toBeCloseTo(500);
    expect(aRow!.metrics.ctr).toBeCloseTo(0.1);
    expect(aRow!.metrics.cvr).toBeCloseTo(0.05);

    expect(result.gradeMap.get('L_A')).toBe('A');
    expect(result.gradeMap.get('L_B')).toBe('B');
  });

  it('aggregates multiple snapshots for the same listing into one perListing row', () => {
    const result = service.calcSnapshotKeyMetrics({
      snapshots: [
        { listingId: 'L_A', spend: 1000, revenue: 4000, clicks: 10, impressions: 100, conversions: 1 },
        { listingId: 'L_A', spend: 2000, revenue: 6000, clicks: 20, impressions: 200, conversions: 2 },
      ],
      listings: [listingA],
    });
    const row = result.perListing.get('L_A')!;
    expect(row.metrics.spend).toBe(3000);
    expect(row.metrics.revenue).toBe(10000);
    expect(row.metrics.roas).toBeCloseTo((10000 / 3000) * 100);
  });

  it('skips snapshots with null listingId', () => {
    const input: KeyMetricsInput = {
      snapshots: [
        { listingId: null, spend: 1000, revenue: 0, clicks: 10, impressions: 100, conversions: 0 },
      ],
      listings: [listingA],
    };
    const result = service.calcSnapshotKeyMetrics(input);
    expect(result.totals.spend).toBe(0);
    expect(result.perListing.size).toBe(0);
  });

  it('returns null ratios when divisor is 0 (no clicks / impressions / spend)', () => {
    const result = service.calcSnapshotKeyMetrics({
      snapshots: [
        { listingId: 'L_A', spend: 0, revenue: 0, clicks: 0, impressions: 0, conversions: 0 },
      ],
      listings: [listingA],
    });
    const row = result.perListing.get('L_A')!;
    expect(row.metrics.ctr).toBeNull();
    expect(row.metrics.roas).toBeNull();
    expect(row.metrics.cvr).toBeNull();
  });

  it('omits listings with null abcGrade from gradeMap', () => {
    const ungraded: HydratedListing = {
      ...listingA,
      id: 'L_X',
      masterProduct: { ...listingA.masterProduct, id: 'M-X', code: 'M-X', abcGrade: null },
    };
    const result = service.calcSnapshotKeyMetrics({
      snapshots: [],
      listings: [listingA, ungraded],
    });
    expect(result.gradeMap.has('L_A')).toBe(true);
    expect(result.gradeMap.has('L_X')).toBe(false);
  });
});

// ─────────────────────────────────────────────
// calcBudgetAllocation
// ─────────────────────────────────────────────

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
// calcTierAnalysis
// ─────────────────────────────────────────────

describe('AdBudgetAllocatorService.calcTierAnalysis', () => {
  let service: AdBudgetAllocatorService;
  beforeEach(() => {
    service = new AdBudgetAllocatorService();
  });

  it('groups listings by masterProduct.adTier with count + spend + revenue + roas', () => {
    const result = service.calcTierAnalysis({
      listings: [listingA, listingB, listingC],
      adGroups: [
        { listingId: 'L_A', spend: 5000, impressions: 0, clicks: 0, conversions: 0, revenue: 15000 },
        { listingId: 'L_B', spend: 2000, impressions: 0, clicks: 0, conversions: 0, revenue: 4000 },
      ],
    });
    const tier1 = result.find((r) => r.tier === '1차')!;
    const tier2 = result.find((r) => r.tier === '2차')!;
    const tier3 = result.find((r) => r.tier === '3차')!;
    expect(tier1.count).toBe(1);
    expect(tier1.spend).toBe(5000);
    expect(tier1.revenue).toBe(15000);
    expect(tier1.roas).toBeCloseTo(300);
    expect(tier2.count).toBe(1);
    expect(tier2.roas).toBeCloseTo(200);
    expect(tier3.count).toBe(1);
    expect(tier3.spend).toBe(0);
    expect(tier3.revenue).toBe(0);
    expect(tier3.roas).toBeNull();
  });

  it('rolls up multiple listings sharing the same tier', () => {
    const listingA2: HydratedListing = {
      ...listingA,
      id: 'L_A2',
      masterProduct: { ...listingA.masterProduct, id: 'M-A2', code: 'M-A2' },
    };
    const result = service.calcTierAnalysis({
      listings: [listingA, listingA2],
      adGroups: [
        { listingId: 'L_A', spend: 3000, impressions: 0, clicks: 0, conversions: 0, revenue: 9000 },
        { listingId: 'L_A2', spend: 2000, impressions: 0, clicks: 0, conversions: 0, revenue: 1000 },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].tier).toBe('1차');
    expect(result[0].count).toBe(2);
    expect(result[0].spend).toBe(5000);
    expect(result[0].revenue).toBe(10000);
    expect(result[0].roas).toBeCloseTo(200);
  });

  it('groups listings with null adTier into "미분류" bucket', () => {
    const ungraded: HydratedListing = {
      ...listingA,
      id: 'L_X',
      masterProduct: { ...listingA.masterProduct, id: 'M-X', code: 'M-X', adTier: null },
    };
    const result = service.calcTierAnalysis({
      listings: [ungraded],
      adGroups: [
        { listingId: 'L_X', spend: 1000, impressions: 0, clicks: 0, conversions: 0, revenue: 2000 },
      ],
    });
    const bucket = result.find((r) => r.tier === '미분류')!;
    expect(bucket).toBeDefined();
    expect(bucket.count).toBe(1);
    expect(bucket.spend).toBe(1000);
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

  it('skips listings without an adGroup match (광고 0건)', () => {
    const result = service.calcTop20({
      listings: [listingA, listingB],
      adGroups: [
        { listingId: 'L_A', spend: 1000, impressions: 0, clicks: 0, conversions: 0, revenue: 5000 },
      ],
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
        masterProduct: {
          id: `M-${i}`,
          code: `M-${i}`,
          name: `상품${i}`,
          abcGrade: 'B',
          adTier: '2차',
          healthScore: 50,
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
    const result = service.calcTop20({ listings, adGroups });
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
});
