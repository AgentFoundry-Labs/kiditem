import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AdvertisingService } from '../advertising.service';

describe('AdvertisingService', () => {
  let service: AdvertisingService;
  let prisma: any;
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
    prisma = {
      channelListingDailySnapshot: {
        groupBy: vi.fn().mockResolvedValue([]),
      },
      channelListing: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
      },
      masterProduct: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    adConfig = { getConfig: vi.fn().mockResolvedValue(baseConfig) };
    service = new AdvertisingService(prisma, adConfig);
  });

  it('getHubData returns listing-primary AdsHubData with grade summary (H3 — daily-fact aggregate)', async () => {
    prisma.channelListingDailySnapshot.groupBy.mockResolvedValue([
      {
        listingId: 'L1',
        _sum: {
          adSpend: 80000,
          adImpressions: 5000,
          adClicks: 100,
          adConversions: 8,
          adRevenue: 240000,
        },
      },
      {
        listingId: 'L2',
        _sum: {
          adSpend: 20000,
          adImpressions: 2000,
          adClicks: 20,
          adConversions: 1,
          adRevenue: 30000,
        },
      },
    ]);
    prisma.channelListing.findMany.mockResolvedValue([
      {
        id: 'L1',
        externalId: 'COUPANG-1',
        channelName: '쿠팡',
        masterId: 'M1',
      },
      {
        id: 'L2',
        externalId: 'COUPANG-2',
        channelName: '쿠팡',
        masterId: 'M2',
      },
    ]);
    prisma.masterProduct.findMany.mockResolvedValue([
      { id: 'M1', code: 'M-00000001', name: 'A상품', abcGrade: 'A', adTier: '1차', healthScore: null },
      { id: 'M2', code: 'M-00000002', name: 'C상품', abcGrade: 'C', adTier: null, healthScore: null },
    ]);

    const result = await service.getHubData('company-1');

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
    prisma.channelListing.findFirst.mockResolvedValue(null);

    await expect(service.changeTier('listing-x', '1차', 'company-A')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.channelListing.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'listing-x', companyId: 'company-A' }),
      }),
    );
    expect(prisma.masterProduct.updateMany).not.toHaveBeenCalled();
  });

  it('changeTier OFF sets masterProduct.adTier to null', async () => {
    prisma.channelListing.findFirst.mockResolvedValue({ masterId: 'M1' });

    const result = await service.changeTier('listing-1', 'OFF', 'company-1');

    expect(result).toEqual({ ok: true });
    expect(prisma.masterProduct.updateMany).toHaveBeenCalledWith({
      where: { id: 'M1', companyId: 'company-1' },
      data: { adTier: null },
    });
  });

  it('changeTier rejects invalid tier', async () => {
    await expect(service.changeTier('listing-1', '4차', 'company-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.channelListing.findFirst).not.toHaveBeenCalled();
  });

  it('findAll paginates with default page=1 limit=50', async () => {
    prisma.channelListingDailySnapshot.groupBy.mockResolvedValue([
      {
        listingId: 'L1',
        _sum: {
          adSpend: 1000,
          adImpressions: 100,
          adClicks: 5,
          adConversions: 1,
          adRevenue: 3000,
        },
      },
    ]);
    prisma.channelListing.findMany.mockResolvedValue([
      {
        id: 'L1',
        externalId: 'COUPANG-1',
        channelName: '쿠팡',
        masterId: 'M1',
      },
    ]);
    prisma.masterProduct.findMany.mockResolvedValue([
      { id: 'M1', code: 'M-00000001', name: '상품1', abcGrade: 'B', adTier: '2차', healthScore: null },
    ]);

    const result = await service.findAll({}, 'company-1');

    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].listingId).toBe('L1');
  });

  // companyId propagation removed — changeTier IDOR test above + check:idor /
  // check:tenant-scope scanners cover the tenant scope risk.
  it('empty-state — no daily-fact rows returns explicit empty hub (legacy Ad rows ignored)', async () => {
    prisma.channelListingDailySnapshot.groupBy.mockResolvedValue([]);

    const result = await service.getHubData('company-1');

    expect(result.products).toEqual([]);
    expect(result.summary.totalSpend).toBe(0);
    expect(result.summary.totalRevenue).toBe(0);
    expect(result.summary.totalRoas).toBeNull();
  });

  it('recomputes ROAS from sums (not averaged per-row provider ratio)', async () => {
    prisma.channelListingDailySnapshot.groupBy.mockResolvedValue([
      {
        listingId: 'L1',
        _sum: {
          adSpend: 10000,
          adImpressions: 1000,
          adClicks: 50,
          adConversions: 5,
          adRevenue: 30000,
        },
      },
    ]);
    prisma.channelListing.findMany.mockResolvedValue([
      {
        id: 'L1',
        externalId: 'COUPANG-1',
        channelName: '쿠팡',
        masterId: 'M1',
      },
    ]);
    prisma.masterProduct.findMany.mockResolvedValue([
      { id: 'M1', code: 'M-1', name: '상품1', abcGrade: 'A', adTier: '1차', healthScore: null },
    ]);

    const result = await service.getHubData('company-1');
    // 30000/10000*100 = 300
    expect(result.products[0].metrics.roas).toBe(300);
    expect(result.summary.totalRoas).toBe(300);
  });
});
