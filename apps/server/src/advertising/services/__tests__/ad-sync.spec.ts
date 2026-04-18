import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AdSyncService, type ListingMap } from '../ad-sync.service';

describe('AdSyncService', () => {
  let service: AdSyncService;
  let prisma: any;
  let eventEmitter: any;

  beforeEach(() => {
    prisma = {
      channelListing: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
      channelListingOption: {
        findMany: vi.fn(),
      },
      adSnapshot: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      ad: {
        create: vi.fn(),
      },
      trafficStats: {
        upsert: vi.fn(),
      },
      itemWinner: {
        create: vi.fn(),
        groupBy: vi.fn(),
      },
      scrapeTarget: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn((ops) => Promise.all(ops)),
    };
    eventEmitter = { emit: vi.fn() };
    service = new AdSyncService(prisma, eventEmitter);
  });

  describe('buildListingMap', () => {
    it('builds vendorItemMap + externalIdMap from ChannelListingOption + ChannelListing', async () => {
      prisma.channelListingOption.findMany.mockResolvedValue([
        { vendorItemId: 'V1', listingId: 'L1', optionId: 'O1' },
        { vendorItemId: 'V2', listingId: 'L2', optionId: 'O2' },
      ]);
      prisma.channelListing.findMany.mockResolvedValue([
        { id: 'L1', externalId: 'COUPANG-1' },
        { id: 'L2', externalId: 'COUPANG-2' },
      ]);

      const map = await service.buildListingMap('company-1');

      expect(map.vendorItemMap.get('V1')).toEqual({
        listingId: 'L1',
        optionId: 'O1',
      });
      expect(map.vendorItemMap.get('V2')).toEqual({
        listingId: 'L2',
        optionId: 'O2',
      });
      expect(map.externalIdMap.get('COUPANG-1')).toEqual({ listingId: 'L1' });
      expect(map.externalIdMap.get('COUPANG-2')).toEqual({ listingId: 'L2' });

      expect(prisma.channelListingOption.findMany).toHaveBeenCalledWith({
        where: { companyId: 'company-1', isActive: true },
        select: { vendorItemId: true, listingId: true, optionId: true },
      });
      expect(prisma.channelListing.findMany).toHaveBeenCalledWith({
        where: { companyId: 'company-1', isDeleted: false, channel: 'coupang' },
        select: { id: true, externalId: true },
      });
    });

    it('skips vendorItemMap entries with missing optionId', async () => {
      prisma.channelListingOption.findMany.mockResolvedValue([
        { vendorItemId: 'V1', listingId: 'L1', optionId: null },
      ]);
      prisma.channelListing.findMany.mockResolvedValue([]);

      const map = await service.buildListingMap('company-1');

      expect(map.vendorItemMap.has('V1')).toBe(false);
    });
  });

  describe('matchListingFromRow', () => {
    const map: ListingMap = {
      vendorItemMap: new Map([
        ['V-HIT', { listingId: 'L-V', optionId: 'O-V' }],
      ]),
      externalIdMap: new Map([['E-HIT', { listingId: 'L-E' }]]),
    };

    it('returns listingId+optionId when vendorItemId hits', () => {
      const result = service.matchListingFromRow(
        { vendorItemId: 'V-HIT' },
        map,
      );
      expect(result).toEqual({ listingId: 'L-V', optionId: 'O-V' });
    });

    it('falls back to externalId when vendorItemId misses', () => {
      const result = service.matchListingFromRow(
        { vendorItemId: 'V-MISS', externalId: 'E-HIT' },
        map,
      );
      expect(result).toEqual({ listingId: 'L-E', optionId: null });
    });

    it('returns nulls when both vendorItemId and externalId miss', () => {
      const result = service.matchListingFromRow(
        { vendorItemId: 'V-MISS', externalId: 'E-MISS' },
        map,
      );
      expect(result).toEqual({ listingId: null, optionId: null });
    });

    it('returns nulls when row has neither vendorItemId nor externalId', () => {
      const result = service.matchListingFromRow(
        { productName: 'unmatched' },
        map,
      );
      expect(result).toEqual({ listingId: null, optionId: null });
    });
  });

  describe('sync behavior', () => {
    beforeEach(() => {
      prisma.channelListingOption.findMany.mockResolvedValue([
        { vendorItemId: 'V1', listingId: 'L1', optionId: 'O1' },
      ]);
      prisma.channelListing.findMany.mockResolvedValue([
        { id: 'L1', externalId: 'COUPANG-1' },
      ]);
      prisma.adSnapshot.findFirst.mockResolvedValue(null);
      prisma.adSnapshot.create.mockResolvedValue({ id: 'snap-new' });
      prisma.ad.create.mockResolvedValue({ id: 'ad-new' });
    });

    it('handleAdCampaign skips Ad.create when unmatched but still stores AdSnapshot', async () => {
      await service.sync(
        {
          type: 'ad_campaign',
          campaignName: 'MyCamp',
          period: '7d',
          kpis: {},
          normalizedRows: [
            {
              pageType: 'product',
              campaignName: 'MyCamp',
              productName: '상품-언매칭',
              vendorItemId: 'V-UNKNOWN',
              spend: 1000,
              revenue: 2000,
              impressions: 500,
              clicks: 10,
              conversions: 1,
            },
          ],
        },
        'company-1',
      );

      expect(prisma.ad.create).not.toHaveBeenCalled();
      expect(prisma.adSnapshot.create).toHaveBeenCalled();
      const snapshotCalls = prisma.adSnapshot.create.mock.calls;
      const unmatchedSnapshot = snapshotCalls.find(
        (c: any) => c[0].data.productName === '상품-언매칭',
      );
      expect(unmatchedSnapshot).toBeDefined();
      expect(unmatchedSnapshot[0].data.listingId).toBeNull();
    });

    it('handleAdCampaign creates Ad + level=product AdSnapshot when vendorItemId hits', async () => {
      await service.sync(
        {
          type: 'ad_campaign',
          campaignName: 'MyCamp',
          period: '7d',
          kpis: {},
          normalizedRows: [
            {
              pageType: 'product',
              campaignName: 'MyCamp',
              productName: '상품-매치',
              vendorItemId: 'V1',
              spend: 1000,
              revenue: 2000,
              impressions: 500,
              clicks: 10,
              conversions: 1,
            },
          ],
        },
        'company-1',
      );

      expect(prisma.ad.create).toHaveBeenCalledTimes(1);
      const adCall = prisma.ad.create.mock.calls[0][0];
      expect(adCall.data.listingId).toBe('L1');
      expect(adCall.data.optionId).toBe('O1');
      expect(adCall.data.spend).toBe(1000);
      expect(adCall.data.revenue).toBe(2000);
    });

    it('handleTraffic upserts TrafficStats for matched rows, skips unmatched', async () => {
      prisma.trafficStats.upsert.mockResolvedValue({});

      const result = await service.sync(
        {
          type: 'traffic',
          period: 14,
          data: [
            {
              vendorItemId: 'V1',
              visitors: 100,
              views: 200,
              orders: 5,
              revenue: 50000,
            },
            {
              vendorItemId: 'V-UNKNOWN',
              visitors: 50,
              orders: 1,
              revenue: 1000,
            },
          ],
        },
        'company-1',
      );

      expect(result).toMatchObject({
        success: true,
        type: 'traffic',
        upserted: 1,
      });
      expect(prisma.trafficStats.upsert).toHaveBeenCalledTimes(1);
      const upsertCall = prisma.trafficStats.upsert.mock.calls[0][0];
      expect(upsertCall.where.listingId_date_periodDays.listingId).toBe('L1');
      expect(upsertCall.create.listingId).toBe('L1');
    });

    it('handleCoupangAdsDaily upserts AdSnapshot(source=coupang_ads, pageType=dashboard_daily)', async () => {
      await service.sync(
        {
          type: 'coupang_ads_daily',
          data: [
            {
              date: '2026-04-18',
              adSpend: 5000,
              adRevenue: 15000,
              impressions: 1000,
              clicks: 20,
              conversions: 2,
              orders: 2,
              roas: 300,
              ctr: 2,
              conversionRate: 10,
            },
          ],
        },
        'company-1',
      );

      expect(prisma.adSnapshot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: 'company-1',
            source: 'coupang_ads',
            pageType: 'dashboard_daily',
            level: 'campaign',
            period: '1d',
            adSpend: 5000,
            adRevenue: 15000,
          }),
        }),
      );
    });

    it('cross-tenant isolation — company B vendorItemId does not leak into company A map', async () => {
      prisma.channelListingOption.findMany.mockResolvedValue([]);
      prisma.channelListing.findMany.mockResolvedValue([]);

      const map = await service.buildListingMap('company-A');

      expect(map.vendorItemMap.size).toBe(0);
      expect(map.externalIdMap.size).toBe(0);

      expect(prisma.channelListingOption.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 'company-A' }),
        }),
      );
    });

    it('passes companyId through sync (no default fallback)', async () => {
      await service.sync(
        { type: 'ad_campaign', kpis: {}, normalizedRows: [] },
        'company-xyz',
      );

      expect(prisma.channelListingOption.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 'company-xyz' }),
        }),
      );
    });
  });

  describe('scrapeTarget CRUD (IDOR guards)', () => {
    it('markScraped throws NotFoundException when id belongs to different tenant', async () => {
      prisma.scrapeTarget.findFirst.mockResolvedValue(null);

      await expect(
        service.markScraped('target-other-tenant', 'company-1'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.scrapeTarget.update).not.toHaveBeenCalled();
    });

    it('deleteScrapeTarget throws NotFoundException when id belongs to different tenant', async () => {
      prisma.scrapeTarget.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteScrapeTarget('target-other-tenant', 'company-1'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.scrapeTarget.update).not.toHaveBeenCalled();
    });

    it('createScrapeTarget scopes to companyId (no default fallback)', async () => {
      prisma.scrapeTarget.create.mockResolvedValue({ id: 't1' });

      await service.createScrapeTarget(
        'https://x.com/a',
        'Label',
        undefined,
        'company-xyz',
      );

      expect(prisma.scrapeTarget.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          companyId: 'company-xyz',
          url: 'https://x.com/a',
          label: 'Label',
          category: 'advertising',
        }),
      });
    });
  });
});
