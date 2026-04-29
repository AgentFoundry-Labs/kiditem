import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdBenchmarkService } from '../ad-benchmark.service';

describe('AdBenchmarkService', () => {
  let service: AdBenchmarkService;
  let prisma: any;
  let adConfig: any;

  const baseConfig = {
    benchmark: {
      roas: { avg: 300, good: 500, excellent: 700, poor: 200 },
      ctr: { avg: 1, good: 2, excellent: 3, poor: 0.5 },
      cvr: { avg: 5, good: 10, excellent: 15, poor: 2 },
      cpc: { avg: 250, good: 150, excellent: 100, poor: 500 },
      adRate: { avg: 15, good: 10, excellent: 5, poor: 25 },
      acos: { avg: 25, good: 15, excellent: 10, poor: 40 },
    },
  };

  beforeEach(() => {
    prisma = {
      // H3 — benchmark reads moved from `prisma.ad` to
      // `prisma.channelListingDailySnapshot`.
      channelListingDailySnapshot: {
        aggregate: vi.fn(),
        groupBy: vi.fn(),
      },
      channelListing: {
        findMany: vi.fn(),
      },
      masterProduct: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    adConfig = { getConfig: vi.fn().mockResolvedValue(baseConfig) };
    service = new AdBenchmarkService(prisma, adConfig);
  });

  it('returns diagnosis with listing-primary results', async () => {
    prisma.channelListingDailySnapshot.aggregate.mockResolvedValue({
      _sum: {
        adSpend: 100000,
        adImpressions: 10000,
        adClicks: 150,
        adConversions: 10,
        adRevenue: 300000,
      },
    });
    prisma.channelListingDailySnapshot.groupBy.mockResolvedValue([
      {
        listingId: 'L1',
        _sum: {
          adSpend: 50000,
          adImpressions: 5000,
          adClicks: 75,
          adConversions: 5,
          adRevenue: 200000,
        },
      },
      {
        listingId: 'L2',
        _sum: {
          adSpend: 50000,
          adImpressions: 5000,
          adClicks: 75,
          adConversions: 5,
          adRevenue: 100000,
        },
      },
    ]);
    prisma.channelListing.findMany.mockResolvedValue([
      { id: 'L1', externalId: 'COUPANG-1', channelName: '쿠팡', masterId: 'M1' },
      { id: 'L2', externalId: 'COUPANG-2', channelName: '쿠팡', masterId: 'M2' },
    ]);
    prisma.masterProduct.findMany.mockResolvedValue([
      { id: 'M1', code: 'M-00000001', name: '상품1', abcGrade: 'A', adTier: null, healthScore: null },
      { id: 'M2', code: 'M-00000002', name: '상품2', abcGrade: 'B', adTier: null, healthScore: null },
    ]);

    const result = await service.getDiagnosis('company-1');

    expect(result.listings).toHaveLength(2);
    expect(result.listings[0].listingId).toBe('L1');
    expect(result.listings[0].masterProduct.code).toBe('M-00000001');
    expect(result.listings[0].channelName).toBe('쿠팡');
    expect(result.diagnosis).toHaveLength(3);
    expect(result.diagnosis.map((d) => d.metric).sort()).toEqual(['ctr', 'cvr', 'roas']);
  });

  it('computes delta against industry average (above / below / average)', async () => {
    prisma.channelListingDailySnapshot.aggregate.mockResolvedValue({
      _sum: {
        adSpend: 100,
        adImpressions: 10000,
        adClicks: 250,
        adConversions: 20,
        adRevenue: 500,
      },
    });
    prisma.channelListingDailySnapshot.groupBy.mockResolvedValue([]);
    prisma.channelListing.findMany.mockResolvedValue([]);

    const result = await service.getDiagnosis('company-1');

    const ctrDiag = result.diagnosis.find((d) => d.metric === 'ctr')!;
    expect(ctrDiag.status).toBe('above');

    const roasDiag = result.diagnosis.find((d) => d.metric === 'roas')!;
    expect(roasDiag.status).toBe('above');

    const cvrDiag = result.diagnosis.find((d) => d.metric === 'cvr')!;
    expect(cvrDiag.status).toBe('above');
  });

  // companyId propagation removed — covered by check:idor / check:tenant-scope
  // and ad-benchmark-flow.pg.integration cross-tenant scenario #11.
  it('empty-state — no daily-fact rows returns null ratios (legacy Ad rows ignored)', async () => {
    prisma.channelListingDailySnapshot.aggregate.mockResolvedValue({
      _sum: {
        adSpend: 0,
        adImpressions: 0,
        adClicks: 0,
        adConversions: 0,
        adRevenue: 0,
      },
    });
    prisma.channelListingDailySnapshot.groupBy.mockResolvedValue([]);
    prisma.channelListing.findMany.mockResolvedValue([]);

    const result = await service.getDiagnosis('company-1');

    expect(result.ownMetrics.spend).toBe(0);
    expect(result.ownMetrics.roas).toBeNull();
    expect(result.ownMetrics.ctr).toBeNull();
    expect(result.ownMetrics.cvr).toBeNull();
    expect(result.listings).toEqual([]);
  });
});
