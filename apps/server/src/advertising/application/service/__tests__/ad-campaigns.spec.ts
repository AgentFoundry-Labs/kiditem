import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdCampaignsService } from '../ad-campaigns.service';

describe('AdCampaignsService', () => {
  let service: AdCampaignsService;
  let prisma: any;
  let adConfig: any;

  beforeEach(() => {
    prisma = {
      // H3 — campaign rollup uses $queryRaw against ChannelAdTargetDailySnapshot;
      // getTrends additionally reads coupang_ads_daily account KPI via $queryRaw.
      // Default to empty so trends tests that don't care about account KPI still pass.
      $queryRaw: vi.fn().mockResolvedValue([]),
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

    const result = await service.getCampaigns('7d', undefined, 'organization-1');

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

    const result = await service.getTrends('14d', undefined, 'organization-1');

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

    const result = await service.getTrends('14d', undefined, 'organization-1');

    expect(result.gradeBudget.A).toBe(10000);
    expect(result.gradeBudget.B).toBe(5000);
    expect(result.gradeBudget.C).toBe(2000);
  });

  it('getCampaigns surfaces listing-less rollups (Drive replay shape — campaign source has no productId)', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        targetKey: 'campaign:매출 TOP 제품',
        campaignId: null,
        campaignName: '매출 TOP 제품',
        listingId: null,
        spend: 30000,
        revenue: 87000,
        impressions: 48000,
        clicks: 110,
        conversions: 5,
      },
    ]);

    const result = await service.getCampaigns('14d', undefined, 'organization-1');

    expect(result).toHaveLength(1);
    expect(result[0].listing).toBeNull();
    expect(result[0].campaignName).toBe('매출 TOP 제품');
    expect(result[0].metrics.spend).toBe(30000);
    expect(result[0].metrics.roas).toBe(290); // 87000/30000*100
  });

  it('getTrends folds in coupang_ads_daily account KPI when present', async () => {
    prisma.channelListingDailySnapshot.findMany.mockResolvedValue([]);
    // First $queryRaw call is account KPI (getTrends doesn't call campaign rollup).
    prisma.$queryRaw.mockResolvedValue([
      {
        businessDate: new Date('2026-04-29T00:00:00Z'),
        adSpend: 279486,
        adRevenue: 1629780,
        clicks: 1520,
        impressions: 527984,
        conversions: 1629780,
        orders: 29,
      },
      {
        businessDate: new Date('2026-04-30T00:00:00Z'),
        adSpend: 40183,
        adRevenue: 200250,
        clicks: 206,
        impressions: 65731,
        conversions: 200250,
        orders: 18,
      },
    ]);

    const result = await service.getTrends('14d', undefined, 'organization-1');

    expect(result.accountSummary).not.toBeNull();
    expect(result.accountSummary?.metrics.spend).toBe(319669); // 279486 + 40183
    expect(result.accountSummary?.metrics.revenue).toBe(1830030);
    // CVR uses orders as the conversion count (provider's `conversions`
    // field carries revenue, not a count — see ad-account-kpi.query.ts).
    expect(result.accountSummary?.metrics.conversions).toBe(47); // 29 + 18
    expect(result.accountSummary?.orders).toBe(47);
    expect(result.accountSummary?.periodDayCount).toBe(2);
    expect(result.accountSummary?.latestBusinessDate).toBe('2026-04-30');
    // Per-listing `daily` stays per-listing — never substituted by account series.
    expect(result.daily).toHaveLength(0);
    // Account series surfaces independently for the UI to render alongside.
    expect(result.accountDaily).toHaveLength(2);
    expect(result.accountDaily[0].metrics.spend).toBe(279486);
  });

  // organizationId propagation + period call-shape tests removed — covered by
  // check:idor / check:tenant-scope scanners and ad-strategy-flow integration.
  it('empty state — no daily rows returns explicit empty (legacy ignored)', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.channelListingDailySnapshot.findMany.mockResolvedValue([]);

    const campaigns = await service.getCampaigns('7d', undefined, 'organization-1');
    const trends = await service.getTrends('14d', undefined, 'organization-1');

    expect(campaigns).toEqual([]);
    expect(trends.daily).toEqual([]);
    expect(trends.firstHalf.spend).toBe(0);
    expect(trends.secondHalf.spend).toBe(0);
  });
});
