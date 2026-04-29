import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AdSyncService, type ListingMap } from '../ad-sync.service';

// H2 daily-fact ingestion behavior (per-source handlers, scrape-run
// finalization, KST business-date semantics, metaJson namespacing) is
// covered against real Postgres in
// `apps/server/src/advertising/__tests__/channel-scrape-dual-write.pg.integration.spec.ts`
// and `apps/server/src/advertising/__tests__/ad-sync-flow.pg.integration.spec.ts`.
// The unit suite keeps only the contracts the integration tier cannot
// observe at low cost: matching priority, scrape-target IDOR, and the
// status-read response shape.

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
    };
    eventEmitter = { emit: vi.fn() };
    service = new AdSyncService(prisma, eventEmitter);
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
