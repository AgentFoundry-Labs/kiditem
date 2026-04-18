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
      ad: {
        groupBy: vi.fn(),
      },
      channelListing: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      masterProduct: {
        update: vi.fn().mockResolvedValue({}),
      },
    };
    adConfig = { getConfig: vi.fn().mockResolvedValue(baseConfig) };
    service = new AdvertisingService(prisma, adConfig);
  });

  it('getHubData returns listing-primary AdsHubData with grade summary', async () => {
    prisma.ad.groupBy.mockResolvedValue([
      {
        listingId: 'L1',
        _sum: { spend: 80000, impressions: 5000, clicks: 100, conversions: 8, revenue: 240000 },
      },
      {
        listingId: 'L2',
        _sum: { spend: 20000, impressions: 2000, clicks: 20, conversions: 1, revenue: 30000 },
      },
    ]);
    prisma.channelListing.findMany.mockResolvedValue([
      {
        id: 'L1',
        externalId: 'COUPANG-1',
        channelName: '쿠팡',
        master: { id: 'M1', code: 'M-00000001', name: 'A상품', abcGrade: 'A', adTier: '1차' },
      },
      {
        id: 'L2',
        externalId: 'COUPANG-2',
        channelName: '쿠팡',
        master: { id: 'M2', code: 'M-00000002', name: 'C상품', abcGrade: 'C', adTier: null },
      },
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
    expect(prisma.masterProduct.update).not.toHaveBeenCalled();
  });

  it('changeTier OFF sets masterProduct.adTier to null', async () => {
    prisma.channelListing.findFirst.mockResolvedValue({ masterId: 'M1' });

    const result = await service.changeTier('L1', 'OFF', 'company-1');

    expect(result).toEqual({ ok: true });
    expect(prisma.masterProduct.update).toHaveBeenCalledWith({
      where: { id: 'M1' },
      data: { adTier: null },
    });
  });

  it('changeTier rejects invalid tier', async () => {
    await expect(service.changeTier('L1', '4차', 'company-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.channelListing.findFirst).not.toHaveBeenCalled();
  });

  it('findAll paginates with default page=1 limit=50', async () => {
    prisma.ad.groupBy.mockResolvedValue([
      {
        listingId: 'L1',
        _sum: { spend: 1000, impressions: 100, clicks: 5, conversions: 1, revenue: 3000 },
      },
    ]);
    prisma.channelListing.findMany.mockResolvedValue([
      {
        id: 'L1',
        externalId: 'COUPANG-1',
        channelName: '쿠팡',
        master: { id: 'M1', code: 'M-00000001', name: '상품1', abcGrade: 'B', adTier: '2차' },
      },
    ]);

    const result = await service.findAll({}, 'company-1');

    expect(result.page).toBe(1);
    expect(result.limit).toBe(50);
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].listingId).toBe('L1');
  });

  it('passes companyId through all reads (no default fallback)', async () => {
    prisma.ad.groupBy.mockResolvedValue([]);

    await service.getHubData('company-xyz');

    expect(adConfig.getConfig).toHaveBeenCalledWith('company-xyz');
    expect(prisma.ad.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 'company-xyz' }),
      }),
    );
  });
});
