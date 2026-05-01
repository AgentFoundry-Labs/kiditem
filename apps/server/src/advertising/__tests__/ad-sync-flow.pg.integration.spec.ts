import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaClient } from '@prisma/client';
import { AdSyncService } from '../application/service/ad-sync.service';
import { ChannelScrapePersistenceService } from '../services/channel-scrape-persistence.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';

/**
 * H2 — ad-sync ingestion flow against real Postgres. Asserts the new
 * daily-fact pipeline (`ChannelListingDailySnapshot` /
 * `ChannelAdTargetDailySnapshot` / `ChannelAccountDailyKpiSnapshot`)
 * receives the rows and the legacy `Ad` / `AdSnapshot` / `TrafficStats`
 * / `ItemWinner` writes have been removed.
 */
describe('AdSync flow (PG integration, H2)', () => {
  let prisma: PrismaClient;
  let adSyncService: AdSyncService;

  async function seedListing(params: {
    organizationId: string;
    externalId: string;
    externalOptionId: string;
    legacySuffix?: string;
  }) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}${params.legacySuffix ?? ''}`;
    const master = await prisma.masterProduct.create({
      data: {
        organizationId: params.organizationId,
        code: `M-${unique}`,
        name: `Master ${unique}`,
        optionCounter: 0,
      },
    });
    const option = await prisma.productOption.create({
      data: {
        organizationId: params.organizationId,
        masterId: master.id,
        sku: `SKU-${unique}`,
        optionName: `Option ${unique}`,
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: params.organizationId,
        masterId: master.id,
        channel: 'coupang',
        externalId: params.externalId,
      },
    });
    const listingOption = await prisma.channelListingOption.create({
      data: {
        organizationId: params.organizationId,
        listingId: listing.id,
        optionId: option.id,
        externalOptionId: params.externalOptionId,
        isActive: true,
      },
    });
    return { master, option, listing, listingOption };
  }

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();

    const m = await Test.createTestingModule({
      providers: [
        AdSyncService,
        ChannelScrapePersistenceService,
        EventEmitter2,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    adSyncService = m.get(AdSyncService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  describe('buildListingMap', () => {
    it('#1 populates externalOptionIdMap + externalIdMap only for scoped organization', async () => {
      const a = await seedListing({
        organizationId: TEST_ORGANIZATION_ID,
        externalId: 'EXT-A',
        externalOptionId: 'VENDOR-A',
        legacySuffix: '-a',
      });
      await seedListing({
        organizationId: OTHER_ORGANIZATION_ID,
        externalId: 'EXT-OTHER',
        externalOptionId: 'VENDOR-OTHER',
        legacySuffix: '-other',
      });

      const map = await adSyncService.buildListingMap(TEST_ORGANIZATION_ID);

      expect(map.externalOptionIdMap.get('VENDOR-A')).toEqual({
        listingId: a.listing.id,
        listingOptionId: a.listingOption.id,
        optionId: a.option.id,
        externalId: 'EXT-A',
      });
      expect(map.externalIdMap.get('EXT-A')).toEqual({
        listingId: a.listing.id,
      });
      expect(map.externalOptionIdMap.has('VENDOR-OTHER')).toBe(false);
      expect(map.externalIdMap.has('EXT-OTHER')).toBe(false);
    });
  });

  describe('sync(ad_campaign)', () => {
    it('#2 vendorItemId hit → ChannelListingDailySnapshot ad metrics + ChannelAdTargetDailySnapshot at product grain', async () => {
      const seeded = await seedListing({
        organizationId: TEST_ORGANIZATION_ID,
        externalId: 'EXT-COUPANG-1',
        externalOptionId: 'VI-HIT-1',
      });

      const result = await adSyncService.sync(
        {
          type: 'ad_campaign',
          campaignName: 'Campaign-α',
          period: '7d',
          timestamp: '2026-04-14T01:00:00Z',
          kpis: { '전체 집행 광고비': '12000', '광고 전환 매출': '30000' },
          normalizedRows: [
            {
              pageType: 'product',
              campaignName: 'Campaign-α',
              campaignId: 'CAMP-1',
              productName: 'Product-α',
              vendorItemId: 'VI-HIT-1',
              itemId: 'VI-HIT-1',
              spend: '1500',
              revenue: '5000',
              impressions: '1000',
              clicks: '50',
              conversions: '3',
              orders: '3',
              roas: '333.33',
              ctr: '5.0',
            },
          ],
        },
        TEST_ORGANIZATION_ID,
      );

      expect(result.success).toBe(true);

      // Listing daily metric upsert.
      const listingDaily = await prisma.channelListingDailySnapshot.findFirst({
        where: { organizationId: TEST_ORGANIZATION_ID, listingId: seeded.listing.id },
      });
      expect(listingDaily).toBeDefined();
      expect(listingDaily?.businessDate.toISOString().slice(0, 10)).toBe(
        '2026-04-14',
      );
      expect(listingDaily?.adSpend).toBe(1500);
      expect(listingDaily?.adRevenue).toBe(5000);
      expect(listingDaily?.adImpressions).toBe(1000);
      expect(listingDaily?.adClicks).toBe(50);
      expect(listingDaily?.adConversions).toBe(3);
      expect(listingDaily?.adOrders).toBe(3);
      // Provider ROAS NOT trusted at column level — only metaJson, and
      // metaJson is namespaced per caller-source (file header
      // "metaJson namespacing").
      expect(listingDaily?.metaJson).toMatchObject({
        'advertising.campaign': { providerRoas: 333.33 },
      });

      // Target daily fact at product grain. The targetKey is built from
      // the listing's externalId (EXT-COUPANG-1) — when the row only carries
      // vendorItemId, the match propagates the listing's externalId.
      const targetDaily = await prisma.channelAdTargetDailySnapshot.findFirst({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          targetType: 'product',
          targetKey: 'product:EXT-COUPANG-1:CAMP-1',
        },
      });
      expect(targetDaily).toBeDefined();
      expect(targetDaily?.spend).toBe(1500);
      expect(targetDaily?.revenue).toBe(5000);
      expect(targetDaily?.adSpend).toBe(1500);
      expect(targetDaily?.adRevenue).toBe(5000);
      expect(targetDaily?.listingId).toBe(seeded.listing.id);
      expect(targetDaily?.listingOptionId).toBe(seeded.listingOption.id);

      // Account-level KPI for the campaign-as-a-whole.
      const kpi = await prisma.channelAccountDailyKpiSnapshot.findFirst({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          source: 'advertising',
          kpiType: 'advertising_campaign_kpis',
        },
      });
      expect(kpi).toBeDefined();
      expect(kpi?.normalizedJson).toMatchObject({
        kpis: { '전체 집행 광고비': '12000' },
      });
    });

    it('#3 keyword row → ChannelAdTargetDailySnapshot at keyword grain', async () => {
      const seeded = await seedListing({
        organizationId: TEST_ORGANIZATION_ID,
        externalId: 'EXT-COUPANG-2',
        externalOptionId: 'VI-UNUSED-2',
      });

      await adSyncService.sync(
        {
          type: 'ad_campaign',
          campaignName: 'Campaign-β',
          period: '7d',
          timestamp: '2026-04-14T01:00:00Z',
          normalizedRows: [
            {
              pageType: 'keyword',
              campaignName: 'Campaign-β',
              campaignId: 'CAMP-β',
              adGroup: 'AG-1',
              keyword: 'widget',
              externalId: 'EXT-COUPANG-2',
              spend: '800',
              impressions: '200',
              clicks: '10',
            },
          ],
        },
        TEST_ORGANIZATION_ID,
      );

      const targetDaily = await prisma.channelAdTargetDailySnapshot.findFirst({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          targetType: 'keyword',
          targetKey: 'keyword:CAMP-β:AG-1:widget',
        },
      });
      expect(targetDaily).toBeDefined();
      expect(targetDaily?.spend).toBe(800);
      expect(targetDaily?.impressions).toBe(200);
      expect(targetDaily?.clicks).toBe(10);
      expect(targetDaily?.listingId).toBe(seeded.listing.id);
      expect(targetDaily?.listingOptionId).toBeNull();
    });

    it('#4 unmatched row preserves raw snapshot but does not write listing daily — target daily lands only when key is buildable', async () => {
      await seedListing({
        organizationId: TEST_ORGANIZATION_ID,
        externalId: 'EXT-PRESENT',
        externalOptionId: 'VI-PRESENT',
      });

      await adSyncService.sync(
        {
          type: 'ad_campaign',
          campaignName: 'Campaign-γ',
          period: '7d',
          timestamp: '2026-04-14T01:00:00Z',
          normalizedRows: [
            {
              pageType: 'campaign',
              campaignName: 'Campaign-γ',
              campaignId: 'CAMP-γ',
              vendorItemId: 'VI-NO-MATCH',
              externalId: 'EXT-NO-MATCH',
              spend: '500',
              impressions: '100',
              clicks: '5',
            },
          ],
        },
        TEST_ORGANIZATION_ID,
      );

      // No listing daily because there's no listing match.
      const listingDailyCount =
        await prisma.channelListingDailySnapshot.count({
          where: { organizationId: TEST_ORGANIZATION_ID },
        });
      expect(listingDailyCount).toBe(0);

      // Target daily DOES land at campaign grain (campaignId is enough).
      const targetDaily = await prisma.channelAdTargetDailySnapshot.findFirst({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          targetType: 'campaign',
          targetKey: 'campaign:CAMP-γ',
        },
      });
      expect(targetDaily).toBeDefined();
      expect(targetDaily?.listingId).toBeNull();

      // Raw snapshot preserved.
      const rawCount = await prisma.channelScrapeSnapshot.count({
        where: { organizationId: TEST_ORGANIZATION_ID, source: 'advertising' },
      });
      expect(rawCount).toBe(1);
    });

    it('#5 cross-tenant: other-organization vendorItemId never lands in this companys daily-fact tables', async () => {
      await seedListing({
        organizationId: OTHER_ORGANIZATION_ID,
        externalId: 'EXT-OTHER-ONLY',
        externalOptionId: 'VI-OTHER-ONLY',
        legacySuffix: '-xt',
      });

      await adSyncService.sync(
        {
          type: 'ad_campaign',
          campaignName: 'Campaign-δ',
          period: '7d',
          timestamp: '2026-04-14T01:00:00Z',
          normalizedRows: [
            {
              pageType: 'product',
              campaignName: 'Campaign-δ',
              campaignId: 'CAMP-δ',
              productName: 'X',
              vendorItemId: 'VI-OTHER-ONLY',
              itemId: 'VI-OTHER-ONLY',
              externalId: 'EXT-OTHER-ONLY',
              spend: '999',
              impressions: '9',
              clicks: '1',
            },
          ],
        },
        TEST_ORGANIZATION_ID,
      );

      const listingDailyCount =
        await prisma.channelListingDailySnapshot.count({
          where: { organizationId: TEST_ORGANIZATION_ID },
        });
      expect(listingDailyCount).toBe(0);

      const otherListingDaily =
        await prisma.channelListingDailySnapshot.count({
          where: { organizationId: OTHER_ORGANIZATION_ID },
        });
      expect(otherListingDaily).toBe(0);

      // Target daily lands in TEST_COMPANY scope (we attribute by ingestion
      // organization), with listingId NULL — confirming no cross-tenant leak.
      const targetDaily = await prisma.channelAdTargetDailySnapshot.findFirst({
        where: { organizationId: TEST_ORGANIZATION_ID },
      });
      expect(targetDaily?.listingId).toBeNull();
      expect(targetDaily?.listingOptionId).toBeNull();
    });

    it('#6 idempotent replay: same payload twice → same listing-day metric values, sampleCount=2', async () => {
      const seeded = await seedListing({
        organizationId: TEST_ORGANIZATION_ID,
        externalId: 'EXT-IDEM',
        externalOptionId: 'VI-IDEM',
      });

      const payload = {
        type: 'ad_campaign' as const,
        campaignName: 'Camp-Idem',
        period: '7d',
        timestamp: '2026-04-14T01:00:00Z',
        normalizedRows: [
          {
            pageType: 'product',
            campaignName: 'Camp-Idem',
            campaignId: 'CAMP-IDEM',
            productName: 'P-Idem',
            vendorItemId: 'VI-IDEM',
            spend: '1000',
            revenue: '3000',
            impressions: '500',
            clicks: '20',
            conversions: '2',
            orders: '2',
          },
        ],
      };
      await adSyncService.sync(payload, TEST_ORGANIZATION_ID);
      await adSyncService.sync(payload, TEST_ORGANIZATION_ID);

      const listingDaily = await prisma.channelListingDailySnapshot.findFirst({
        where: { organizationId: TEST_ORGANIZATION_ID, listingId: seeded.listing.id },
      });
      expect(listingDaily).toBeDefined();
      expect(listingDaily?.adSpend).toBe(1000); // overwrite, not double
      expect(listingDaily?.adRevenue).toBe(3000);
      expect(listingDaily?.sampleCount).toBe(2);

      const targetDaily = await prisma.channelAdTargetDailySnapshot.findFirst({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          targetType: 'product',
          targetKey: 'product:EXT-IDEM:CAMP-IDEM',
        },
      });
      expect(targetDaily?.spend).toBe(1000);
      expect(targetDaily?.revenue).toBe(3000);
      expect(targetDaily?.sampleCount).toBe(2);
    });
  });

  describe('sync(traffic)', () => {
    it('#7 matched traffic row → listing-day traffic metrics (no TrafficStats write)', async () => {
      const seeded = await seedListing({
        organizationId: TEST_ORGANIZATION_ID,
        externalId: 'EXT-TRAFFIC',
        externalOptionId: 'VI-TRAFFIC',
      });

      await adSyncService.sync(
        {
          type: 'traffic',
          period: 14,
          startDate: '2026-04-14T01:00:00Z',
          data: [
            {
              vendorItemId: 'VI-TRAFFIC',
              visitors: 100,
              views: 200,
              cartAdds: 5,
              orders: 5,
              salesQty: 5,
              revenue: 30000,
            },
          ],
        },
        TEST_ORGANIZATION_ID,
      );

      const listingDaily = await prisma.channelListingDailySnapshot.findFirst({
        where: { organizationId: TEST_ORGANIZATION_ID, listingId: seeded.listing.id },
      });
      expect(listingDaily?.trafficVisitors).toBe(100);
      expect(listingDaily?.trafficViews).toBe(200);
      expect(listingDaily?.trafficCartAdds).toBe(5);
      expect(listingDaily?.trafficOrders).toBe(5);
      expect(listingDaily?.trafficSalesQty).toBe(5);
      expect(listingDaily?.trafficRevenue).toBe(30000);
    });
  });

  describe('cross-source metaJson namespacing', () => {
    it('#9 ad_campaign + traffic on same (listing, businessDate) preserve each other`s metaJson keys', async () => {
      const seeded = await seedListing({
        organizationId: TEST_ORGANIZATION_ID,
        externalId: 'EXT-META-MERGE',
        externalOptionId: 'VI-META-MERGE',
      });

      // First payload: ad_campaign writes provider ROAS / CTR under
      // `advertising.campaign` source.
      await adSyncService.sync(
        {
          type: 'ad_campaign',
          campaignName: 'CampaignMerge',
          period: '7d',
          timestamp: '2026-04-14T01:00:00Z',
          normalizedRows: [
            {
              pageType: 'product',
              campaignName: 'CampaignMerge',
              campaignId: 'CAMP-MERGE',
              productName: 'Product-Merge',
              vendorItemId: 'VI-META-MERGE',
              spend: '1500',
              revenue: '5000',
              impressions: '1000',
              clicks: '50',
              roas: '333.33',
              ctr: '5.0',
            },
          ],
        },
        TEST_ORGANIZATION_ID,
      );

      // Second payload: traffic on the same listing/day writes provider
      // conversion rate under `wing.traffic` source. Without per-source
      // namespacing the ad_campaign keys would be wiped here.
      await adSyncService.sync(
        {
          type: 'traffic',
          period: 14,
          startDate: '2026-04-14T01:00:00Z',
          data: [
            {
              vendorItemId: 'VI-META-MERGE',
              visitors: 200,
              views: 400,
              cartAdds: 10,
              orders: 8,
              salesQty: 8,
              revenue: 40000,
            },
          ],
        },
        TEST_ORGANIZATION_ID,
      );

      const listingDaily = await prisma.channelListingDailySnapshot.findFirst({
        where: { organizationId: TEST_ORGANIZATION_ID, listingId: seeded.listing.id },
      });
      expect(listingDaily).toBeDefined();
      expect(listingDaily?.businessDate.toISOString().slice(0, 10)).toBe(
        '2026-04-14',
      );

      // Both ad and traffic numerator columns survive (overwrite-on-replay
      // applies per metric block; missing keys leave columns alone).
      expect(listingDaily?.adSpend).toBe(1500);
      expect(listingDaily?.adRevenue).toBe(5000);
      expect(listingDaily?.trafficVisitors).toBe(200);
      expect(listingDaily?.trafficOrders).toBe(8);

      // metaJson preserves BOTH source keys — the second payload did not
      // wipe the first's audit data.
      const meta = listingDaily?.metaJson as Record<string, unknown>;
      expect(meta).toMatchObject({
        'advertising.campaign': {
          providerRoas: 333.33,
          providerCtr: 5,
        },
        'wing.traffic': {
          periodDays: 14,
        },
      });
      // Ensure both top-level source keys are present.
      expect(Object.keys(meta).sort()).toEqual(
        ['advertising.campaign', 'wing.traffic'].sort(),
      );
    });
  });

  describe('sync(coupang_ads_daily)', () => {
    it('#8 each daily row lands in ChannelAccountDailyKpiSnapshot — provider ROAS only in metaJson, not as additive numerator', async () => {
      await adSyncService.sync(
        {
          type: 'coupang_ads_daily',
          data: [
            {
              date: '2026-04-12',
              adSpend: 1000,
              adRevenue: 3000,
              impressions: 100,
              clicks: 10,
              roas: 999, // provider ratio NOT trusted
            },
            {
              date: '2026-04-13',
              adSpend: 2000,
              adRevenue: 5000,
              impressions: 200,
              clicks: 20,
              roas: 250,
            },
          ],
        },
        TEST_ORGANIZATION_ID,
      );

      const kpis = await prisma.channelAccountDailyKpiSnapshot.findMany({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          source: 'coupang_ads',
          kpiType: 'coupang_ads_daily',
        },
        orderBy: { businessDate: 'asc' },
      });
      expect(kpis).toHaveLength(2);
      expect(kpis[0].businessDate.toISOString().slice(0, 10)).toBe(
        '2026-04-12',
      );
      expect(kpis[0].normalizedJson).toMatchObject({
        adSpend: 1000,
        adRevenue: 3000,
        providerRoas: 999,
      });
      // No legacy AdSnapshot row produced — H3 reads daily KPI directly.
    });
  });
});
