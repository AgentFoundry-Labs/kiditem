import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdCampaignsService } from '../ad-campaigns.service';

describe('AdCampaignsService', () => {
  let service: AdCampaignsService;
  let prisma: any;
  let adConfig: any;

  beforeEach(() => {
    prisma = {
      adSnapshot: {
        findMany: vi.fn(),
      },
      ad: {
        findMany: vi.fn(),
      },
    };
    adConfig = { getConfig: vi.fn() };
    service = new AdCampaignsService(prisma, adConfig);
  });

  it('getCampaigns filters by level=campaign + period and hydrates listing summary', async () => {
    prisma.adSnapshot.findMany.mockResolvedValue([
      {
        id: 'S1',
        externalId: 'CMP-1',
        campaignName: 'Campaign One',
        period: '7d',
        adSpend: 10000,
        spend: 10000,
        adRevenue: 30000,
        revenue: 30000,
        impressions: 1000,
        clicks: 50,
        conversions: 5,
        listing: {
          id: 'L1',
          externalId: 'COUPANG-1',
          channelName: '쿠팡',
          master: { id: 'M1', code: 'M-00000001', name: '상품1' },
        },
      },
    ]);

    const result = await service.getCampaigns('7d', undefined, 'company-1');

    expect(prisma.adSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'company-1',
          level: 'campaign',
          period: '7d',
          listingId: { not: null },
        }),
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].listing.listingId).toBe('L1');
    expect(result[0].listing.masterProduct.code).toBe('M-00000001');
    expect(result[0].campaignId).toBe('CMP-1');
    expect(result[0].campaignName).toBe('Campaign One');
    expect(result[0].period).toBe('7d');
    expect(result[0].metrics.spend).toBe(10000);
    expect(result[0].metrics.ctr).toBe(5);
    expect(result[0].metrics.roas).toBe(300);
  });

  it('getTrends computes daily series + firstHalf/secondHalf comparison', async () => {
    prisma.ad.findMany.mockResolvedValue([
      {
        date: new Date('2026-04-10T00:00:00Z'),
        spend: 1000,
        revenue: 2000,
        clicks: 10,
        impressions: 500,
        conversions: 1,
        listing: { master: { abcGrade: 'A' } },
      },
      {
        date: new Date('2026-04-11T00:00:00Z'),
        spend: 1500,
        revenue: 3000,
        clicks: 15,
        impressions: 600,
        conversions: 2,
        listing: { master: { abcGrade: 'A' } },
      },
      {
        date: new Date('2026-04-12T00:00:00Z'),
        spend: 2000,
        revenue: 5000,
        clicks: 20,
        impressions: 700,
        conversions: 3,
        listing: { master: { abcGrade: 'A' } },
      },
      {
        date: new Date('2026-04-13T00:00:00Z'),
        spend: 2500,
        revenue: 7500,
        clicks: 25,
        impressions: 800,
        conversions: 4,
        listing: { master: { abcGrade: 'A' } },
      },
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
    prisma.ad.findMany.mockResolvedValue([
      {
        date: new Date('2026-04-10T00:00:00Z'),
        spend: 10000,
        revenue: 20000,
        clicks: 10,
        impressions: 100,
        conversions: 1,
        listing: { master: { abcGrade: 'A' } },
      },
      {
        date: new Date('2026-04-10T00:00:00Z'),
        spend: 5000,
        revenue: 8000,
        clicks: 5,
        impressions: 50,
        conversions: 1,
        listing: { master: { abcGrade: 'B' } },
      },
      {
        date: new Date('2026-04-10T00:00:00Z'),
        spend: 2000,
        revenue: 3000,
        clicks: 2,
        impressions: 20,
        conversions: 0,
        listing: { master: { abcGrade: 'C' } },
      },
      {
        date: new Date('2026-04-10T00:00:00Z'),
        spend: 3000,
        revenue: 4000,
        clicks: 3,
        impressions: 30,
        conversions: 0,
        listing: { master: { abcGrade: null } },
      },
    ]);

    const result = await service.getTrends('14d', undefined, 'company-1');

    expect(result.gradeBudget.A).toBe(10000);
    expect(result.gradeBudget.B).toBe(5000);
    expect(result.gradeBudget.C).toBe(2000);
  });

  it('passes companyId through all reads (no default fallback)', async () => {
    prisma.adSnapshot.findMany.mockResolvedValue([]);
    prisma.ad.findMany.mockResolvedValue([]);

    await service.getCampaigns('14d', undefined, 'company-xyz');
    await service.getTrends('14d', undefined, 'company-xyz');

    expect(prisma.adSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 'company-xyz' }),
      }),
    );
    expect(prisma.ad.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 'company-xyz' }),
      }),
    );
  });
});
