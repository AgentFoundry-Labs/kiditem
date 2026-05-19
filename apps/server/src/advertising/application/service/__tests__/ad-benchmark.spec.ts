import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdBenchmarkService } from '../ad-benchmark.service';
import type { AdBenchmarkRepositoryPort } from '../../port/out/repository/ad-benchmark.repository.port';
import type { AdListingRepositoryPort } from '../../port/out/repository/ad-listing.repository.port';
import {
  buildMockAdBenchmarkRepo,
  buildMockAdListingRepo,
  type MockAdBenchmarkRepo,
  type MockAdListingRepo,
} from '../../../__tests__/test-helpers/build-mock-ports';

describe('AdBenchmarkService', () => {
  let service: AdBenchmarkService;
  let benchmarkRepo: MockAdBenchmarkRepo;
  let listingRepo: MockAdListingRepo;
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
    benchmarkRepo = buildMockAdBenchmarkRepo();
    listingRepo = buildMockAdListingRepo();
    // Default empty aggregates so trivial paths don't need to set this up.
    benchmarkRepo.findBenchmarkAggregates.mockResolvedValue({
      totals: {
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
      },
      perListing: [],
    });
    listingRepo.findScopedAdListings.mockResolvedValue(new Map());
    adConfig = { getConfig: vi.fn().mockResolvedValue(baseConfig) };
    service = new AdBenchmarkService(
      benchmarkRepo as unknown as AdBenchmarkRepositoryPort,
      listingRepo as unknown as AdListingRepositoryPort,
      adConfig,
    );
  });

  it('returns diagnosis with listing-primary results', async () => {
    benchmarkRepo.findBenchmarkAggregates.mockResolvedValue({
      totals: {
        spend: 100000,
        impressions: 10000,
        clicks: 150,
        conversions: 10,
        revenue: 300000,
      },
      perListing: [
        {
          listingId: 'L1',
          sums: {
            spend: 50000,
            impressions: 5000,
            clicks: 75,
            conversions: 5,
            revenue: 200000,
          },
        },
        {
          listingId: 'L2',
          sums: {
            spend: 50000,
            impressions: 5000,
            clicks: 75,
            conversions: 5,
            revenue: 100000,
          },
        },
      ],
    });
    listingRepo.findScopedAdListings.mockResolvedValue(
      new Map([
        [
          'L1',
          {
            id: 'L1',
            externalId: 'COUPANG-1',
            channelName: '쿠팡',
            masterProduct: {
              id: 'M1',
              code: 'M-00000001',
              name: '상품1',
              abcGrade: 'A',
              adTier: null,
              healthScore: null,
            },
          },
        ],
        [
          'L2',
          {
            id: 'L2',
            externalId: 'COUPANG-2',
            channelName: '쿠팡',
            masterProduct: {
              id: 'M2',
              code: 'M-00000002',
              name: '상품2',
              abcGrade: 'B',
              adTier: null,
              healthScore: null,
            },
          },
        ],
      ]),
    );

    const result = await service.getDiagnosis('organization-1');

    expect(result.listings).toHaveLength(2);
    expect(result.listings[0].listingId).toBe('L1');
    expect(result.listings[0].masterProduct.code).toBe('M-00000001');
    expect(result.listings[0].channelName).toBe('쿠팡');
    expect(result.diagnosis).toHaveLength(3);
    expect(result.diagnosis.map((d) => d.metric).sort()).toEqual(['ctr', 'cvr', 'roas']);
  });

  it('computes delta against industry average (above / below / average)', async () => {
    benchmarkRepo.findBenchmarkAggregates.mockResolvedValue({
      totals: {
        spend: 100,
        impressions: 10000,
        clicks: 250,
        conversions: 20,
        revenue: 500,
      },
      perListing: [],
    });

    const result = await service.getDiagnosis('organization-1');

    const ctrDiag = result.diagnosis.find((d) => d.metric === 'ctr')!;
    expect(ctrDiag.status).toBe('above');

    const roasDiag = result.diagnosis.find((d) => d.metric === 'roas')!;
    expect(roasDiag.status).toBe('above');

    const cvrDiag = result.diagnosis.find((d) => d.metric === 'cvr')!;
    expect(cvrDiag.status).toBe('above');
  });

  // organizationId propagation removed — covered by check:idor / check:tenant-scope
  // and ad-benchmark-flow.pg.integration cross-tenant scenario #11.
  it('empty-state — no daily-fact rows returns null ratios (legacy Ad rows ignored)', async () => {
    const result = await service.getDiagnosis('organization-1');

    expect(result.ownMetrics.spend).toBe(0);
    expect(result.ownMetrics.roas).toBeNull();
    expect(result.ownMetrics.ctr).toBeNull();
    expect(result.ownMetrics.cvr).toBeNull();
    expect(result.listings).toEqual([]);
  });
});
