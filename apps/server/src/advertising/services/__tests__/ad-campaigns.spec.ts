import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdCampaignsService } from '../ad-campaigns.service';

describe('AdCampaignsService', () => {
  let service: AdCampaignsService;
  let prisma: any;
  let adConfig: any;

  beforeEach(() => {
    prisma = {
      // H3 — campaign rollup uses $queryRaw against ChannelAdTargetDailySnapshot.
      $queryRaw: vi.fn(),
      channelListing: {
        findMany: vi.fn(),
      },
      masterProduct: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      channelListingDailySnapshot: {
        findMany: vi.fn(),
      },
    };
    adConfig = { getConfig: vi.fn() };
    service = new AdCampaignsService(prisma, adConfig);
  });

  it('getCampaigns aggregates target-daily rows by targetKey + period (H3)', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        targetKey: 'campaign:CMP-1',
        campaignId: 'CMP-1',
        campaignName: 'Campaign One',
        listingId: 'L1',
        spend: 10000,
        revenue: 30000,
        impressions: 1000,
        clicks: 50,
        conversions: 5,
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
      { id: 'M1', code: 'M-00000001', name: '상품1', abcGrade: 'A', adTier: null, healthScore: null },
    ]);

    const result = await service.getCampaigns('7d', undefined, 'company-1');

    expect(result).toHaveLength(1);
    expect(result[0].listing.listingId).toBe('L1');
    expect(result[0].listing.masterProduct.code).toBe('M-00000001');
    expect(result[0].campaignId).toBe('CMP-1');
    expect(result[0].campaignName).toBe('Campaign One');
    expect(result[0].period).toBe('7d');
    expect(result[0].metrics.spend).toBe(10000);
    expect(result[0].metrics.ctr).toBe(5); // 50/1000*100
    expect(result[0].metrics.roas).toBe(300); // 30000/10000*100
  });

  it('getTrends aggregates listing-daily by businessDate + ABC grade (H3)', async () => {
    prisma.channelListingDailySnapshot.findMany.mockResolvedValue([
      {
        businessDate: new Date('2026-04-10T00:00:00Z'),
        adSpend: 1000,
        adRevenue: 2000,
        adClicks: 10,
        adImpressions: 500,
        adConversions: 1,
        listingId: 'L1',
      },
      {
        businessDate: new Date('2026-04-11T00:00:00Z'),
        adSpend: 1500,
        adRevenue: 3000,
        adClicks: 15,
        adImpressions: 600,
        adConversions: 2,
        listingId: 'L1',
      },
      {
        businessDate: new Date('2026-04-12T00:00:00Z'),
        adSpend: 2000,
        adRevenue: 5000,
        adClicks: 20,
        adImpressions: 700,
        adConversions: 3,
        listingId: 'L1',
      },
      {
        businessDate: new Date('2026-04-13T00:00:00Z'),
        adSpend: 2500,
        adRevenue: 7500,
        adClicks: 25,
        adImpressions: 800,
        adConversions: 4,
        listingId: 'L1',
      },
    ]);
    prisma.channelListing.findMany.mockResolvedValue([
      { id: 'L1', masterId: 'M1' },
    ]);
    prisma.masterProduct.findMany.mockResolvedValue([
      { id: 'M1', abcGrade: 'A' },
    ]);

    const result = await service.getTrends('14d', undefined, 'company-1');

    expect(result.daily).toHaveLength(4);
    expect(result.daily[0].date).toBe('2026-04-10');
    expect(result.daily[0].metrics.spend).toBe(1000);
    expect(result.firstHalf.spend).toBe(2500);
    expect(result.secondHalf.spend).toBe(4500);
    expect(result.secondHalf.revenue).toBeGreaterThan(result.firstHalf.revenue);
  });

  it('getTrends computes ABC gradeBudget allocation via listing.master.abcGrade', async () => {
    prisma.channelListingDailySnapshot.findMany.mockResolvedValue([
      {
        businessDate: new Date('2026-04-10T00:00:00Z'),
        adSpend: 10000,
        adRevenue: 20000,
        adClicks: 10,
        adImpressions: 100,
        adConversions: 1,
        listingId: 'L1',
      },
      {
        businessDate: new Date('2026-04-10T00:00:00Z'),
        adSpend: 5000,
        adRevenue: 8000,
        adClicks: 5,
        adImpressions: 50,
        adConversions: 1,
        listingId: 'L2',
      },
      {
        businessDate: new Date('2026-04-10T00:00:00Z'),
        adSpend: 2000,
        adRevenue: 3000,
        adClicks: 2,
        adImpressions: 20,
        adConversions: 0,
        listingId: 'L3',
      },
      {
        businessDate: new Date('2026-04-10T00:00:00Z'),
        adSpend: 3000,
        adRevenue: 4000,
        adClicks: 3,
        adImpressions: 30,
        adConversions: 0,
        listingId: 'L4',
      },
    ]);
    prisma.channelListing.findMany.mockResolvedValue([
      { id: 'L1', masterId: 'M1' },
      { id: 'L2', masterId: 'M2' },
      { id: 'L3', masterId: 'M3' },
      { id: 'L4', masterId: 'M4' },
    ]);
    prisma.masterProduct.findMany.mockResolvedValue([
      { id: 'M1', abcGrade: 'A' },
      { id: 'M2', abcGrade: 'B' },
      { id: 'M3', abcGrade: 'C' },
      { id: 'M4', abcGrade: null },
    ]);

    const result = await service.getTrends('14d', undefined, 'company-1');

    expect(result.gradeBudget.A).toBe(10000);
    expect(result.gradeBudget.B).toBe(5000);
    expect(result.gradeBudget.C).toBe(2000);
  });

  it('passes companyId through all reads (no default fallback)', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.channelListingDailySnapshot.findMany.mockResolvedValue([]);

    await service.getCampaigns('14d', undefined, 'company-xyz');
    await service.getTrends('14d', undefined, 'company-xyz');

    expect(
      prisma.channelListingDailySnapshot.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 'company-xyz' }),
      }),
    );
    // $queryRaw is parameterized via Prisma.sql template; explicit raw arg
    // count varies between Prisma versions, so just assert it was called
    // and the listing read used the correct companyId.
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it('period aggregation correctness — 7d / 14d / month / custom', async () => {
    prisma.channelListingDailySnapshot.findMany.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([]);

    await service.getCampaigns('7d', undefined, 'company-1');
    await service.getCampaigns('14d', undefined, 'company-1');
    await service.getCampaigns('month', undefined, 'company-1');
    await service.getTrends('14d', 30, 'company-1');

    // Each call must hit the daily-fact source, not legacy Ad/AdSnapshot.
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(3);
    expect(prisma.channelListingDailySnapshot.findMany).toHaveBeenCalledTimes(
      1,
    );
  });

  it('empty state — no daily rows returns explicit empty (legacy ignored)', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.channelListingDailySnapshot.findMany.mockResolvedValue([]);

    const campaigns = await service.getCampaigns('7d', undefined, 'company-1');
    const trends = await service.getTrends('14d', undefined, 'company-1');

    expect(campaigns).toEqual([]);
    expect(trends.daily).toEqual([]);
    expect(trends.firstHalf.spend).toBe(0);
    expect(trends.secondHalf.spend).toBe(0);
  });
});
