import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AdvertisingService } from '../advertising.service';
import type { AdBenchmarkRepositoryPort } from '../../port/out/ad-benchmark.repository.port';
import type { AdListingRepositoryPort } from '../../port/out/ad-listing.repository.port';
import {
  buildMockAdBenchmarkRepo,
  buildMockAdListingRepo,
  type MockAdBenchmarkRepo,
  type MockAdListingRepo,
} from '../../../__tests__/test-helpers/build-mock-ports';

describe('AdvertisingService', () => {
  let service: AdvertisingService;
  let benchmarkRepo: MockAdBenchmarkRepo;
  let listingRepo: MockAdListingRepo;
  let adConfig: any;

  const baseConfig = {
    roas: { thresholds: { excellent: 500, warning: 200, poor: 100 } },
    adRate: { thresholds: { warning: 15, critical: 25 } },
    budget: { allocation: {} },
    roasTargetByGrade: {},
    adRateTargetByGrade: {},
    tier: { dailyBudget: {} },
    benchmark: {
      roas: { avg: 300, good: 500, excellent: 700, poor: 200 },
      ctr: { avg: 1, good: 2, excellent: 3, poor: 0.5 },
      cvr: { avg: 5, good: 10, excellent: 15, poor: 2 },
      cpc: { avg: 250, good: 150, excellent: 100, poor: 500 },
      adRate: { avg: 15, good: 10, excellent: 5, poor: 25 },
      acos: { avg: 25, good: 15, excellent: 10, poor: 40 },
    },
    gradeStrategy: {},
  };

  beforeEach(() => {
    benchmarkRepo = buildMockAdBenchmarkRepo();
    listingRepo = buildMockAdListingRepo();
    // Defaults: empty aggregates + empty listing map.
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
    listingRepo.changeAdTier.mockResolvedValue(true);
    adConfig = { getConfig: vi.fn().mockResolvedValue(baseConfig) };
    service = new AdvertisingService(
      benchmarkRepo as unknown as AdBenchmarkRepositoryPort,
      listingRepo as unknown as AdListingRepositoryPort,
      adConfig,
    );
  });

  it('getHubData returns listing-primary AdsHubData with grade summary (H3 — daily-fact aggregate)', async () => {
    benchmarkRepo.findBenchmarkAggregates.mockResolvedValue({
      totals: {
        spend: 100000,
        impressions: 7000,
        clicks: 120,
        conversions: 9,
        revenue: 270000,
      },
      perListing: [
        {
          listingId: 'L1',
          sums: {
            spend: 80000,
            impressions: 5000,
            clicks: 100,
            conversions: 8,
            revenue: 240000,
          },
        },
        {
          listingId: 'L2',
          sums: {
            spend: 20000,
            impressions: 2000,
            clicks: 20,
            conversions: 1,
            revenue: 30000,
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
              name: 'A상품',
              abcGrade: 'A',
              adTier: '1차',
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
              name: 'C상품',
              abcGrade: 'C',
              adTier: null,
              healthScore: null,
            },
          },
        ],
      ]),
    );

    const result = await service.getHubData('organization-1');

    expect(result.products).toHaveLength(2);
    const l1 = result.products.find((p) => p.listingId === 'L1')!;
    expect(l1.masterProduct.code).toBe('M-00000001');
    expect(l1.grade).toBe('A');
    expect(l1.adTier).toBe('1차');
    expect(l1.tier).toBe('1차');
    expect(l1.metrics.spend).toBe(80000);
    expect(l1.option).toBeNull();

    expect(result.summary.totalSpend).toBe(100000);
    expect(result.summary.totalRevenue).toBe(270000);
    expect(result.summary.gradeSpend.A).toBe(80000);
    expect(result.summary.gradeSpend.C).toBe(20000);
    expect(result.summary.gradeSpendPercent.A).toBe(80);
    expect(result.summary.tierSpend['1차']).toBe(80000);
  });

  it('changeTier throws NotFoundException when id crosses tenant', async () => {
    listingRepo.changeAdTier.mockResolvedValue(false);

    await expect(service.changeTier('listing-x', '1차', 'organization-A')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(listingRepo.changeAdTier).toHaveBeenCalledWith(
      'listing-x',
      'organization-A',
      '1차',
    );
  });

  it('changeTier OFF sets masterProduct.adTier to null', async () => {
    listingRepo.changeAdTier.mockResolvedValue(true);

    const result = await service.changeTier('listing-1', 'OFF', 'organization-1');

    expect(result).toEqual({ ok: true });
    expect(listingRepo.changeAdTier).toHaveBeenCalledWith(
      'listing-1',
      'organization-1',
      null,
    );
  });

  it('changeTier rejects invalid tier', async () => {
    await expect(service.changeTier('listing-1', '4차', 'organization-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(listingRepo.changeAdTier).not.toHaveBeenCalled();
  });

  it('findAll paginates with default page=1 limit=50', async () => {
    benchmarkRepo.findBenchmarkAggregates.mockResolvedValue({
      totals: {
        spend: 1000,
        impressions: 100,
        clicks: 5,
        conversions: 1,
        revenue: 3000,
      },
      perListing: [
        {
          listingId: 'L1',
          sums: {
            spend: 1000,
            impressions: 100,
            clicks: 5,
            conversions: 1,
            revenue: 3000,
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
              abcGrade: 'B',
              adTier: '2차',
              healthScore: null,
            },
          },
        ],
      ]),
    );

    const result = await service.findAll({}, 'organization-1');

    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].listingId).toBe('L1');
  });

  // organizationId propagation removed — changeTier IDOR test above + check:idor /
  // check:tenant-scope scanners cover the tenant scope risk.
  it('empty-state — no daily-fact rows returns explicit empty hub (legacy Ad rows ignored)', async () => {
    const result = await service.getHubData('organization-1');

    expect(result.products).toEqual([]);
    expect(result.summary.totalSpend).toBe(0);
    expect(result.summary.totalRevenue).toBe(0);
    expect(result.summary.totalRoas).toBeNull();
  });

  it('recomputes ROAS from sums (not averaged per-row provider ratio)', async () => {
    benchmarkRepo.findBenchmarkAggregates.mockResolvedValue({
      totals: {
        spend: 10000,
        impressions: 1000,
        clicks: 50,
        conversions: 5,
        revenue: 30000,
      },
      perListing: [
        {
          listingId: 'L1',
          sums: {
            spend: 10000,
            impressions: 1000,
            clicks: 50,
            conversions: 5,
            revenue: 30000,
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
              code: 'M-1',
              name: '상품1',
              abcGrade: 'A',
              adTier: '1차',
              healthScore: null,
            },
          },
        ],
      ]),
    );

    const result = await service.getHubData('organization-1');
    // 30000/10000*100 = 300
    expect(result.products[0].metrics.roas).toBe(300);
    expect(result.summary.totalRoas).toBe(300);
  });
});
