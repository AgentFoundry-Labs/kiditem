import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AdSyncService, type ListingMap } from '../ad-sync.service';

describe('AdSyncService', () => {
  let service: AdSyncService;
  let prisma: any;
  let eventEmitter: any;
  let scrapePersistence: any;

  beforeEach(() => {
    prisma = {
      channelListing: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
      channelListingOption: {
        findMany: vi.fn(),
      },
      // Read paths use channel-generic daily-fact + scrape-run tables.
      channelScrapeRun: {
        findFirst: vi.fn(),
      },
      channelScrapeSnapshot: {
        count: vi.fn(),
      },
      channelAccountDailyKpiSnapshot: {
        findFirst: vi.fn(),
      },
      // $queryRaw is used by getExtensionStatus (DISTINCT ON listing_id).
      $queryRaw: vi.fn().mockResolvedValue([]),
      scrapeTarget: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      $transaction: vi.fn((ops) => Promise.all(ops)),
    };
    eventEmitter = { emit: vi.fn() };
    // AdSyncService writes only into the channel-generic persistence helper.
    // Mocking the helper covers the contract: createRun / appendSnapshot /
    // finalizeRun / upsertListingDaily / upsertOptionDaily /
    // upsertAdTargetDaily / upsertAccountKpi.
    scrapePersistence = {
      createRun: vi.fn().mockResolvedValue({ id: 'run-1' }),
      appendSnapshot: vi.fn().mockResolvedValue({ id: 'snap-1' }),
      finalizeRun: vi.fn().mockResolvedValue(undefined),
      upsertListingDaily: vi.fn().mockResolvedValue({ id: 'listing-daily-1' }),
      upsertOptionDaily: vi.fn().mockResolvedValue({ id: 'option-daily-1' }),
      upsertAdTargetDaily: vi
        .fn()
        .mockResolvedValue({ id: 'target-daily-1' }),
      upsertAccountKpi: vi.fn().mockResolvedValue({ id: 'kpi-1' }),
    };
    service = new AdSyncService(prisma, eventEmitter, scrapePersistence);
  });

  describe('buildListingMap', () => {
    it('builds externalOptionIdMap (with listingOptionId) + externalIdMap from ChannelListingOption + ChannelListing', async () => {
      prisma.channelListingOption.findMany.mockResolvedValue([
        {
          id: 'LO1',
          externalOptionId: 'V1',
          listingId: 'L1',
          optionId: 'O1',
        },
        {
          id: 'LO2',
          externalOptionId: 'V2',
          listingId: 'L2',
          optionId: 'O2',
        },
      ]);
      prisma.channelListing.findMany.mockResolvedValue([
        { id: 'L1', externalId: 'COUPANG-1' },
        { id: 'L2', externalId: 'COUPANG-2' },
      ]);

      const map = await service.buildListingMap('company-1');

      expect(map.externalOptionIdMap.get('V1')).toEqual({
        listingId: 'L1',
        listingOptionId: 'LO1',
        optionId: 'O1',
        externalId: 'COUPANG-1',
      });
      expect(map.externalOptionIdMap.get('V2')).toEqual({
        listingId: 'L2',
        listingOptionId: 'LO2',
        optionId: 'O2',
        externalId: 'COUPANG-2',
      });
      expect(map.externalIdMap.get('COUPANG-1')).toEqual({ listingId: 'L1' });
      expect(map.externalIdMap.get('COUPANG-2')).toEqual({ listingId: 'L2' });

      expect(prisma.channelListingOption.findMany).toHaveBeenCalledWith({
        where: {
          companyId: 'company-1',
          isActive: true,
          listing: { companyId: 'company-1', channel: 'coupang', isDeleted: false },
        },
        select: {
          id: true,
          externalOptionId: true,
          listingId: true,
          optionId: true,
        },
      });
      expect(prisma.channelListing.findMany).toHaveBeenCalledWith({
        where: { companyId: 'company-1', isDeleted: false, channel: 'coupang' },
        select: { id: true, externalId: true },
      });
    });

    it('preserves externalOptionIdMap entries with null internal optionId (Wave C2)', async () => {
      prisma.channelListingOption.findMany.mockResolvedValue([
        {
          id: 'LO1',
          externalOptionId: 'V1',
          listingId: 'L1',
          optionId: null,
        },
      ]);
      prisma.channelListing.findMany.mockResolvedValue([
        { id: 'L1', externalId: 'COUPANG-NULL' },
      ]);

      const map = await service.buildListingMap('company-1');

      // Wave C2 contract: listingOptionId 는 internal optionId 가 null 이어도
      // 보존되어야 한다 (C3 의 option daily snapshot 이 listingOptionId 만으로
      // upsert 가능하도록).
      expect(map.externalOptionIdMap.get('V1')).toEqual({
        listingId: 'L1',
        listingOptionId: 'LO1',
        optionId: null,
        externalId: 'COUPANG-NULL',
      });
    });
  });

  describe('matchListingFromRow', () => {
    const map: ListingMap = {
      externalOptionIdMap: new Map<
        string,
        {
          listingId: string;
          listingOptionId: string;
          optionId: string | null;
          externalId: string;
        }
      >([
        [
          'V-HIT',
          {
            listingId: 'L-V',
            listingOptionId: 'LO-V',
            optionId: 'O-V',
            externalId: 'E-V',
          },
        ],
      ]),
      externalIdMap: new Map([['E-HIT', { listingId: 'L-E' }]]),
    };

    it('returns full match when provider vendorItemId hits externalOptionIdMap', () => {
      const result = service.matchListingFromRow(
        { vendorItemId: 'V-HIT' },
        map,
      );
      expect(result).toEqual({
        listingId: 'L-V',
        listingOptionId: 'LO-V',
        optionId: 'O-V',
        externalId: 'E-V',
        externalOptionId: 'V-HIT',
      });
    });

    it('falls back to externalId when vendorItemId misses (listingOption + optionId null)', () => {
      const result = service.matchListingFromRow(
        { vendorItemId: 'V-MISS', externalId: 'E-HIT' },
        map,
      );
      expect(result).toEqual({
        listingId: 'L-E',
        listingOptionId: null,
        optionId: null,
        externalId: 'E-HIT',
        externalOptionId: null,
      });
    });

    it('returns nulls when both vendorItemId and externalId miss', () => {
      const result = service.matchListingFromRow(
        { vendorItemId: 'V-MISS', externalId: 'E-MISS' },
        map,
      );
      expect(result).toEqual({
        listingId: null,
        listingOptionId: null,
        optionId: null,
        externalId: null,
        externalOptionId: null,
      });
    });

    it('returns nulls when row has neither vendorItemId nor externalId', () => {
      const result = service.matchListingFromRow(
        { productName: 'unmatched' },
        map,
      );
      expect(result).toEqual({
        listingId: null,
        listingOptionId: null,
        optionId: null,
        externalId: null,
        externalOptionId: null,
      });
    });
  });

  describe('sync behavior (H2 — daily-fact ingestion only)', () => {
    beforeEach(() => {
      prisma.channelListingOption.findMany.mockResolvedValue([
        {
          id: 'LO1',
          externalOptionId: 'V1',
          listingId: 'L1',
          optionId: 'O1',
          listing: { externalId: 'COUPANG-1' },
        },
      ]);
      prisma.channelListing.findMany.mockResolvedValue([
        { id: 'L1', externalId: 'COUPANG-1' },
      ]);
    });

    it('handleAdCampaign: unmatched row creates a ChannelScrapeSnapshot but skips listing-day + target-day daily upserts when identity is missing', async () => {
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
              externalId: 'E-UNKNOWN',
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

      // Raw snapshot landed with matchStatus=unmatched.
      const scrapeSnap = scrapePersistence.appendSnapshot.mock.calls[0][0];
      expect(scrapeSnap.matchStatus).toBe('unmatched');
      expect(scrapeSnap.listingId).toBeNull();

      // Listing-day daily skipped (no listing match).
      expect(scrapePersistence.upsertListingDaily).not.toHaveBeenCalled();

      // Target-day daily DOES still land — the row has campaign + product
      // identity (externalId is non-null), so the key is buildable. matched
      // listingId stays null on the row, which is intended for unmatched
      // products (we only require provider identity, not internal mapping).
      expect(scrapePersistence.upsertAdTargetDaily).toHaveBeenCalledTimes(1);
      const targetCall = scrapePersistence.upsertAdTargetDaily.mock.calls[0][0];
      expect(targetCall.listingId).toBeNull();
      expect(targetCall.targetType).toBe('product');
      expect(targetCall.targetKey).toBe('product:E-UNKNOWN:MyCamp');
    });

    it('handleAdCampaign: matched row writes ChannelListingDailySnapshot (ad metrics) + ChannelAdTargetDailySnapshot, no legacy Ad/AdSnapshot writes', async () => {
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
              campaignId: 'CAMP-1',
              productName: '상품-매치',
              vendorItemId: 'V1',
              spend: 1000,
              revenue: 2000,
              impressions: 500,
              clicks: 10,
              conversions: 1,
              orders: 1,
              roas: 200,
              ctr: 2,
              dailyBudget: 10000,
            },
          ],
        },
        'company-1',
      );

      // Listing-day metric upsert occurred for the matched row.
      expect(scrapePersistence.upsertListingDaily).toHaveBeenCalledTimes(1);
      const listingCall =
        scrapePersistence.upsertListingDaily.mock.calls[0][0];
      expect(listingCall.companyId).toBe('company-1');
      expect(listingCall.listingId).toBe('L1');
      expect(listingCall.metrics?.ad).toMatchObject({
        adSpend: 1000,
        adRevenue: 2000,
        adImpressions: 500,
        adClicks: 10,
        adConversions: 1,
        adOrders: 1,
      });
      // Provider ratios are not stored as additive numerator columns —
      // they survive only inside metaJson for audit. metaJson is
      // namespaced per caller-source so concurrent payloads on the same
      // listing-day preserve each other's audit data.
      expect(listingCall.metrics?.ad).not.toHaveProperty('roas');
      expect(listingCall.metaJson).toMatchObject({
        source: 'advertising.campaign',
        data: {
          providerRoas: 200,
          providerCtr: 2,
        },
      });

      // Target-day fact landed at product grain.
      expect(scrapePersistence.upsertAdTargetDaily).toHaveBeenCalledTimes(1);
      const targetCall = scrapePersistence.upsertAdTargetDaily.mock.calls[0][0];
      expect(targetCall.targetType).toBe('product');
      expect(targetCall.targetKey).toBe('product:COUPANG-1:CAMP-1');
      expect(targetCall.spend).toBe(1000);
      expect(targetCall.adSpend).toBe(1000);
      expect(targetCall.adRevenue).toBe(2000);
      // Provider ROAS stays in metaJson only (namespaced per caller).
      expect(targetCall.metaJson).toMatchObject({
        source: 'advertising.campaign.target',
        data: { providerRoas: 200 },
      });

      // Run lifecycle.
      expect(scrapePersistence.createRun).toHaveBeenCalled();
      expect(scrapePersistence.finalizeRun).toHaveBeenCalled();
      const finalize = scrapePersistence.finalizeRun.mock.calls[0][0];
      expect(finalize.status).toBe('complete');
    });

    it('handleAdCampaign: multiple target rows for one listing/date are summed into one listing-day ad metric upsert', async () => {
      const result = await service.sync(
        {
          type: 'ad_campaign',
          campaignName: 'MyCamp',
          period: '7d',
          timestamp: '2026-04-14T01:00:00Z',
          kpis: {},
          normalizedRows: [
            {
              pageType: 'keyword',
              campaignName: 'MyCamp',
              campaignId: 'CAMP-1',
              adGroup: 'AG-1',
              keyword: 'toy',
              externalId: 'COUPANG-1',
              spend: 1000,
              revenue: 2000,
              impressions: 500,
              clicks: 10,
              conversions: 1,
              orders: 1,
            },
            {
              pageType: 'keyword',
              campaignName: 'MyCamp',
              campaignId: 'CAMP-1',
              adGroup: 'AG-1',
              keyword: 'kids',
              externalId: 'COUPANG-1',
              spend: 300,
              revenue: 700,
              impressions: 200,
              clicks: 4,
              conversions: 2,
              orders: 2,
            },
          ],
        },
        'company-1',
      );

      expect(result).toMatchObject({
        success: true,
        listingDailyCount: 1,
        targetDailyCount: 2,
      });
      expect(scrapePersistence.appendSnapshot).toHaveBeenCalledTimes(2);
      expect(scrapePersistence.upsertAdTargetDaily).toHaveBeenCalledTimes(2);
      expect(scrapePersistence.upsertListingDaily).toHaveBeenCalledTimes(1);
      const listingCall =
        scrapePersistence.upsertListingDaily.mock.calls[0][0];
      expect(listingCall.listingId).toBe('L1');
      expect(listingCall.metrics?.ad).toMatchObject({
        adSpend: 1300,
        adRevenue: 2700,
        adImpressions: 700,
        adClicks: 14,
        adConversions: 3,
        adOrders: 3,
      });
    });

    it('handleAdCampaign: payload-level kpis land in ChannelAccountDailyKpiSnapshot, never in legacy AdSnapshot', async () => {
      await service.sync(
        {
          type: 'ad_campaign',
          campaignName: 'MyCamp',
          period: '7d',
          kpis: { '광고비': '5,000', '전환 매출': '15,000' },
          normalizedRows: [],
        },
        'company-1',
      );

      expect(scrapePersistence.upsertAccountKpi).toHaveBeenCalledTimes(1);
      const kpiCall = scrapePersistence.upsertAccountKpi.mock.calls[0][0];
      expect(kpiCall.source).toBe('advertising');
      expect(kpiCall.kpiType).toBe('advertising_campaign_kpis');
      expect(kpiCall.normalizedJson).toMatchObject({
        kpis: { '광고비': '5,000' },
      });
    });

    it('handleTraffic: matched row upserts ChannelListingDailySnapshot traffic metrics', async () => {
      const result = await service.sync(
        {
          type: 'traffic',
          period: 14,
          startDate: '2026-04-13T15:30:00Z',
          data: [
            {
              vendorItemId: 'V1',
              visitors: 100,
              views: 200,
              cartAdds: 5,
              orders: 5,
              salesQty: 5,
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
        listingDailyCount: 1,
      });
      expect(scrapePersistence.appendSnapshot).toHaveBeenCalledTimes(2);
      expect(scrapePersistence.upsertListingDaily).toHaveBeenCalledTimes(1);
      const listingCall =
        scrapePersistence.upsertListingDaily.mock.calls[0][0];
      expect(listingCall.listingId).toBe('L1');
      expect(listingCall.metrics?.traffic).toMatchObject({
        trafficVisitors: 100,
        trafficViews: 200,
        trafficCartAdds: 5,
        trafficOrders: 5,
        trafficSalesQty: 5,
        trafficRevenue: 50000,
      });
    });

    it('handleTraffic: dashboard kpis go to ChannelAccountDailyKpiSnapshot (kpiType=wing_dashboard)', async () => {
      await service.sync(
        {
          type: 'traffic',
          period: 7,
          kpis: { 매출: '100,000' },
          adSummary: { adSpend: 10000 },
          data: [],
        },
        'company-1',
      );

      expect(scrapePersistence.upsertAccountKpi).toHaveBeenCalledTimes(1);
      const kpiCall = scrapePersistence.upsertAccountKpi.mock.calls[0][0];
      expect(kpiCall.source).toBe('wing');
      expect(kpiCall.kpiType).toBe('wing_dashboard');
      expect(kpiCall.normalizedJson).toMatchObject({
        kpis: { 매출: '100,000' },
        adSummary: { adSpend: 10000 },
      });
    });

    it('handleCoupangAdsDaily: each daily row lands in ChannelAccountDailyKpiSnapshot (kpiType=coupang_ads_daily) — no legacy AdSnapshot', async () => {
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

      expect(scrapePersistence.upsertAccountKpi).toHaveBeenCalledTimes(1);
      const kpiCall = scrapePersistence.upsertAccountKpi.mock.calls[0][0];
      expect(kpiCall.source).toBe('coupang_ads');
      expect(kpiCall.kpiType).toBe('coupang_ads_daily');
      expect(kpiCall.normalizedJson).toMatchObject({
        adSpend: 5000,
        adRevenue: 15000,
        providerRoas: 300,
      });

      // Wave C2: row snapshot landed with source='coupang_ads' and
      // matchStatus='unmatched' (KPI-only daily aggregate, no listing identity).
      const scrapeSnap = scrapePersistence.appendSnapshot.mock.calls[0][0];
      expect(scrapeSnap.source).toBe('coupang_ads');
      expect(scrapeSnap.matchStatus).toBe('unmatched');
    });

    it('cross-tenant isolation — company B externalOptionId does not leak into company A map', async () => {
      prisma.channelListingOption.findMany.mockResolvedValue([]);
      prisma.channelListing.findMany.mockResolvedValue([]);

      const map = await service.buildListingMap('company-A');

      expect(map.externalOptionIdMap.size).toBe(0);
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
    it('markScraped writes with tenant scope and returns the updated target shape', async () => {
      const target = {
        id: 'target-1',
        companyId: 'company-1',
        lastScrapedAt: new Date('2026-04-29T00:00:00Z'),
      };
      prisma.scrapeTarget.updateMany.mockResolvedValue({ count: 1 });
      prisma.scrapeTarget.findFirst.mockResolvedValue(target);

      await expect(service.markScraped('target-1', 'company-1')).resolves.toBe(
        target,
      );

      expect(prisma.scrapeTarget.updateMany).toHaveBeenCalledWith({
        where: { id: 'target-1', companyId: 'company-1' },
        data: { lastScrapedAt: expect.any(Date) },
      });
      expect(prisma.scrapeTarget.findFirst).toHaveBeenCalledWith({
        where: { id: 'target-1', companyId: 'company-1' },
      });
      expect(prisma.scrapeTarget.update).not.toHaveBeenCalled();
    });

    it('markScraped throws NotFoundException when id belongs to different tenant', async () => {
      prisma.scrapeTarget.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.markScraped('target-other-tenant', 'company-1'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.scrapeTarget.update).not.toHaveBeenCalled();
    });

    it('deleteScrapeTarget writes with tenant scope and returns the updated target shape', async () => {
      const target = {
        id: 'target-1',
        companyId: 'company-1',
        isActive: false,
      };
      prisma.scrapeTarget.updateMany.mockResolvedValue({ count: 1 });
      prisma.scrapeTarget.findFirst.mockResolvedValue(target);

      await expect(
        service.deleteScrapeTarget('target-1', 'company-1'),
      ).resolves.toBe(target);

      expect(prisma.scrapeTarget.updateMany).toHaveBeenCalledWith({
        where: { id: 'target-1', companyId: 'company-1' },
        data: { isActive: false },
      });
      expect(prisma.scrapeTarget.findFirst).toHaveBeenCalledWith({
        where: { id: 'target-1', companyId: 'company-1' },
      });
      expect(prisma.scrapeTarget.update).not.toHaveBeenCalled();
    });

    it('deleteScrapeTarget throws NotFoundException when id belongs to different tenant', async () => {
      prisma.scrapeTarget.updateMany.mockResolvedValue({ count: 0 });

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

  describe('getExtensionStatus (H3 — current-state semantics)', () => {
    it('aggregates winner/non-winner/unknown counts from latest daily snapshot per listing', async () => {
      prisma.channelListing.count.mockResolvedValue(7);
      prisma.$queryRaw.mockResolvedValue([
        { isOfferWinner: true, lastObservedAt: new Date('2026-04-25T00:00:00Z') },
        { isOfferWinner: true, lastObservedAt: new Date('2026-04-26T00:00:00Z') },
        { isOfferWinner: false, lastObservedAt: new Date('2026-04-26T00:00:00Z') },
        { isOfferWinner: null, lastObservedAt: new Date('2026-04-27T00:00:00Z') },
      ]);
      prisma.channelScrapeSnapshot.count.mockResolvedValue(42);
      prisma.channelScrapeRun.findFirst.mockResolvedValue({
        finishedAt: new Date('2026-04-27T03:00:00Z'),
        startedAt: new Date('2026-04-27T02:00:00Z'),
        pageType: 'itemwinner',
      });
      prisma.channelAccountDailyKpiSnapshot.findFirst.mockResolvedValue({
        normalizedJson: { kpis: { '아이템위너 상품': '2', '노출제한 상품': '0' } },
        lastObservedAt: new Date('2026-04-27T03:00:00Z'),
      });

      const result = await service.getExtensionStatus('company-1');

      expect(result.connected).toBe(true);
      expect(result.listingCount).toBe(7);
      expect(result.currentWinnerCount).toBe(2);
      expect(result.currentNonWinnerCount).toBe(1);
      expect(result.currentUnknownWinnerCount).toBe(1);
      expect(result.currentWinnerObservedListings).toBe(4);
      expect(result.rawSnapshotCount).toBe(42);
      expect(result.latestScrapeAt).toEqual(new Date('2026-04-27T03:00:00Z'));
      expect(result.latestScrapePageType).toBe('itemwinner');
      // latestChannelStateAt = max(lastObservedAt) across rows
      expect(result.latestChannelStateAt).toEqual(
        new Date('2026-04-27T00:00:00Z'),
      );
      expect(result.wing.kpis['아이템위너 상품']).toBe('2');
    });

    it('empty-state — no daily-fact rows returns explicit zeros + null timestamps (legacy ItemWinner ignored)', async () => {
      prisma.channelListing.count.mockResolvedValue(3);
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.channelScrapeSnapshot.count.mockResolvedValue(0);
      prisma.channelScrapeRun.findFirst.mockResolvedValue(null);
      prisma.channelAccountDailyKpiSnapshot.findFirst.mockResolvedValue(null);

      const result = await service.getExtensionStatus('company-1');

      expect(result.currentWinnerCount).toBe(0);
      expect(result.currentNonWinnerCount).toBe(0);
      expect(result.currentUnknownWinnerCount).toBe(0);
      expect(result.currentWinnerObservedListings).toBe(0);
      expect(result.rawSnapshotCount).toBe(0);
      expect(result.latestScrapeAt).toBeNull();
      expect(result.latestScrapePageType).toBeNull();
      expect(result.latestChannelStateAt).toBeNull();
      expect(result.wing.kpis).toEqual({});
      expect(result.wing.lastSync).toBeNull();
    });

    it('passes companyId through all reads (no default fallback) — no legacy AdSnapshot/ItemWinner reads', async () => {
      prisma.channelListing.count.mockResolvedValue(0);
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.channelScrapeSnapshot.count.mockResolvedValue(0);
      prisma.channelScrapeRun.findFirst.mockResolvedValue(null);
      prisma.channelAccountDailyKpiSnapshot.findFirst.mockResolvedValue(null);

      await service.getExtensionStatus('company-xyz');

      expect(prisma.channelListing.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 'company-xyz' }),
        }),
      );
      expect(prisma.channelScrapeSnapshot.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: 'company-xyz' } }),
      );
      expect(prisma.channelScrapeRun.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: 'company-xyz' } }),
      );
      expect(prisma.channelAccountDailyKpiSnapshot.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 'company-xyz',
            source: 'wing',
            kpiType: 'wing_itemwinner_kpi',
          }),
        }),
      );
    });
  });
});
