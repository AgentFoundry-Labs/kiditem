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
      // Read-side legacy access remains here in this branch (getExtensionStatus
      // still touches AdSnapshot/ItemWinner — H3 rewrites those reads). The
      // ingestion path no longer calls these.
      adSnapshot: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      itemWinner: {
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
    // H2: AdSyncService now writes only into the channel-generic persistence
    // helper. Legacy `Ad`/`AdSnapshot`/`TrafficStats`/`ItemWinner` writes have
    // been removed. Mocking the helper covers the contract: createRun /
    // appendSnapshot / finalizeRun / upsertListingDaily / upsertOptionDaily /
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
          listing: { externalId: 'COUPANG-1' },
        },
        {
          id: 'LO2',
          externalOptionId: 'V2',
          listingId: 'L2',
          optionId: 'O2',
          listing: { externalId: 'COUPANG-2' },
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
          listing: { channel: 'coupang', isDeleted: false },
        },
        select: {
          id: true,
          externalOptionId: true,
          listingId: true,
          optionId: true,
          listing: { select: { externalId: true } },
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
          listing: { externalId: 'COUPANG-NULL' },
        },
      ]);
      prisma.channelListing.findMany.mockResolvedValue([]);

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

      // No legacy writes happened.
      expect(prisma.adSnapshot.create).not.toHaveBeenCalled();
      expect(prisma.adSnapshot.update).not.toHaveBeenCalled();

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
      expect(prisma.adSnapshot.create).not.toHaveBeenCalled();
    });

    it('handleTraffic: matched row upserts ChannelListingDailySnapshot traffic metrics (no TrafficStats write)', async () => {
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

      expect(prisma.adSnapshot.create).not.toHaveBeenCalled();
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
