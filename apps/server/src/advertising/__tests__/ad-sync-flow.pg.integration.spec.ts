import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import type { PrismaClient } from '@prisma/client';
import { AdvertisingModule } from '../advertising.module';
import { AdSyncService } from '../application/service/ad-sync.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';

const AUTHORITATIVE_CAMPAIGN_DAY = {
  campaignReportScope: 'single_campaign_authoritative',
  dashboardOnOff: 'ON',
  dateFrom: '2026-04-14',
  dateTo: '2026-04-14',
} as const;

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
    const channelAccount =
      (await prisma.channelAccount.findFirst({
        where: { organizationId: params.organizationId, channel: 'coupang' },
      })) ??
      (await prisma.channelAccount.create({
        data: {
          organizationId: params.organizationId,
          channel: 'coupang',
          name: 'Ad Sync PG Coupang',
          externalAccountId: 'ad-sync-pg',
          isPrimary: true,
        },
      }));
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: params.organizationId,
        channelAccountId: channelAccount.id,
        externalId: params.externalId,
      },
    });
    const listingOption = await prisma.channelListingOption.create({
      data: {
        organizationId: params.organizationId,
        listingId: listing.id,
        externalOptionId: params.externalOptionId,
        isActive: true,
      },
    });
    return { channelAccount, listing, listingOption };
  }

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();

    const m = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot(), AdvertisingModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    adSyncService = m.get(AdSyncService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.channelAccount.create({
      data: {
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        name: 'Ad Sync PG Coupang',
        externalAccountId: 'ad-sync-pg',
        isPrimary: true,
      },
    });
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
        externalId: 'EXT-A',
      });
      expect(map.channelAccountId).toBe(a.channelAccount.id);
      expect(map.externalIdMap.get('EXT-A')).toEqual({
        listingId: a.listing.id,
      });
      expect(map.externalOptionIdMap.has('VENDOR-OTHER')).toBe(false);
      expect(map.externalIdMap.has('EXT-OTHER')).toBe(false);
    });

    it('requires an explicit account when an organization has multiple active Coupang accounts', async () => {
      await prisma.channelAccount.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'coupang',
          name: 'Ad Sync PG Coupang Secondary',
          externalAccountId: 'ad-sync-pg-secondary',
        },
      });

      await expect(
        adSyncService.buildListingMap(TEST_ORGANIZATION_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('uses only the explicitly selected tenant-owned account', async () => {
      const secondary = await prisma.channelAccount.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'coupang',
          name: 'Ad Sync PG Coupang Secondary',
          externalAccountId: 'ad-sync-pg-secondary',
        },
      });
      const listing = await prisma.channelListing.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: secondary.id,
          externalId: 'EXT-SECONDARY',
        },
      });
      const option = await prisma.channelListingOption.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          listingId: listing.id,
          externalOptionId: 'VENDOR-SECONDARY',
        },
      });

      const map = await adSyncService.buildListingMap(
        TEST_ORGANIZATION_ID,
        secondary.id,
      );

      expect(map.channelAccountId).toBe(secondary.id);
      expect(map.externalOptionIdMap.get('VENDOR-SECONDARY')).toEqual({
        listingId: listing.id,
        listingOptionId: option.id,
        externalId: 'EXT-SECONDARY',
      });
    });

    it('does not accept an account identifier owned by another organization', async () => {
      const foreignAccount = await prisma.channelAccount.create({
        data: {
          organizationId: OTHER_ORGANIZATION_ID,
          channel: 'coupang',
          name: 'Other Organization Coupang',
          externalAccountId: 'other-ad-sync-pg',
        },
      });

      await expect(
        adSyncService.buildListingMap(
          TEST_ORGANIZATION_ID,
          foreignAccount.id,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('sync(ad_campaign)', () => {
    it('stores raw scrape facts against the explicitly selected account', async () => {
      const secondary = await prisma.channelAccount.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'coupang',
          name: 'Ad Sync PG Coupang Secondary',
          externalAccountId: 'ad-sync-pg-secondary',
        },
      });

      await adSyncService.sync(
        {
          type: 'ad_campaign',
          channelAccountId: secondary.id,
          timestamp: '2026-04-14T01:00:00Z',
          normalizedRows: [],
        },
        TEST_ORGANIZATION_ID,
      );

      const run = await prisma.channelScrapeRun.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID },
        orderBy: { createdAt: 'desc' },
      });
      expect(run.channelAccountId).toBe(secondary.id);
    });

    it('#2 authoritative vendorItemId hit writes only an account-qualified product target', async () => {
      const seeded = await seedListing({
        organizationId: TEST_ORGANIZATION_ID,
        externalId: 'EXT-COUPANG-1',
        externalOptionId: 'VI-HIT-1',
      });

      const result = await adSyncService.sync(
        {
          type: 'ad_campaign',
          ...AUTHORITATIVE_CAMPAIGN_DAY,
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

      // Per-campaign reports never own listing-day aggregate columns.
      const listingDaily = await prisma.channelListingDailySnapshot.findFirst({
        where: { organizationId: TEST_ORGANIZATION_ID, listingId: seeded.listing.id },
      });
      expect(listingDaily).toBeNull();

      // Target daily fact at product grain. The targetKey is built from
      // the provider vendorItemId/externalOptionId because the ad-products
      // source is vendor-item scoped and may not carry campaign identity.
      const targetDaily = await prisma.channelAdTargetDailySnapshot.findFirst({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          targetType: 'product',
          targetKey: `account:${seeded.channelAccount.id}:product:CAMP-1:VI-HIT-1`,
        },
      });
      expect(targetDaily).toBeDefined();
      expect(targetDaily?.spend).toBe(1500);
      expect(targetDaily?.revenue).toBe(5000);
      expect(targetDaily?.adSpend).toBe(1500);
      expect(targetDaily?.adRevenue).toBe(5000);
      expect(targetDaily?.listingId).toBe(seeded.listing.id);
      expect(targetDaily?.listingOptionId).toBe(seeded.listingOption.id);

      // Per-campaign KPIs are raw evidence, not account-day aggregates.
      const kpiCount = await prisma.channelAccountDailyKpiSnapshot.count({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          source: 'advertising',
          kpiType: 'advertising_campaign_kpis',
        },
      });
      expect(kpiCount).toBe(0);
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
          ...AUTHORITATIVE_CAMPAIGN_DAY,
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
          targetKey: `account:${seeded.channelAccount.id}:keyword:CAMP-β:AG-1:widget`,
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
      const seeded = await seedListing({
        organizationId: TEST_ORGANIZATION_ID,
        externalId: 'EXT-PRESENT',
        externalOptionId: 'VI-PRESENT',
      });

      await adSyncService.sync(
        {
          type: 'ad_campaign',
          ...AUTHORITATIVE_CAMPAIGN_DAY,
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
          targetKey: `account:${seeded.channelAccount.id}:campaign:CAMP-γ`,
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
          ...AUTHORITATIVE_CAMPAIGN_DAY,
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

    it('#6 idempotent authoritative replay keeps one current target fact without listing aggregates', async () => {
      const seeded = await seedListing({
        organizationId: TEST_ORGANIZATION_ID,
        externalId: 'EXT-IDEM',
        externalOptionId: 'VI-IDEM',
      });

      const payload = {
        type: 'ad_campaign' as const,
        ...AUTHORITATIVE_CAMPAIGN_DAY,
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
      expect(listingDaily).toBeNull();

      const targetDaily = await prisma.channelAdTargetDailySnapshot.findFirst({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          targetType: 'product',
          targetKey: `account:${seeded.channelAccount.id}:product:CAMP-IDEM:VI-IDEM`,
        },
      });
      expect(targetDaily?.spend).toBe(1000);
      expect(targetDaily?.revenue).toBe(3000);
      expect(targetDaily?.sampleCount).toBe(1);
    });

    it('keeps the prior target-day fact when an OFF campaign contributes metadata only', async () => {
      const seeded = await seedListing({
        organizationId: TEST_ORGANIZATION_ID,
        externalId: 'EXT-OFF-PRESERVE',
        externalOptionId: 'VI-OFF-PRESERVE',
      });
      await adSyncService.sync(
        {
          type: 'ad_campaign',
          ...AUTHORITATIVE_CAMPAIGN_DAY,
          campaignName: 'Campaign OFF preserve',
          normalizedRows: [{
            pageType: 'product',
            campaignId: 'CAMP-OFF-PRESERVE',
            campaignName: 'Campaign OFF preserve',
            vendorItemId: 'VI-OFF-PRESERVE',
            spend: 700,
            revenue: 2100,
          }],
        },
        TEST_ORGANIZATION_ID,
      );
      const targetKey =
        `account:${seeded.channelAccount.id}:product:CAMP-OFF-PRESERVE:VI-OFF-PRESERVE`;
      const before = await prisma.channelAdTargetDailySnapshot.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID, targetKey },
      });

      const result = await adSyncService.sync(
        {
          type: 'ad_campaign',
          ...AUTHORITATIVE_CAMPAIGN_DAY,
          dashboardOnOff: 'OFF',
          campaignName: 'Campaign OFF preserve',
          normalizedRows: [{
            pageType: 'campaign',
            campaignId: 'CAMP-OFF-PRESERVE',
            campaignName: 'Campaign OFF preserve',
            _campaignOnly: true,
            onOff: 'OFF',
          }],
        },
        TEST_ORGANIZATION_ID,
      );

      expect(result).toMatchObject({
        success: true,
        dailyProjectionSkipped: true,
        targetDailyCount: 0,
        projectionRejectionCode: null,
      });
      const after = await prisma.channelAdTargetDailySnapshot.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID, targetKey },
      });
      expect(after).toMatchObject({ id: before.id, spend: 700, revenue: 2100 });
      expect(await prisma.channelScrapeSnapshot.count({
        where: { organizationId: TEST_ORGANIZATION_ID, source: 'advertising' },
      })).toBe(2);
      const offRun = await prisma.channelScrapeRun.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID, source: 'advertising' },
        orderBy: { createdAt: 'desc' },
      });
      expect(offRun.metaJson).toMatchObject({
        campaignReportAuthorityReason: 'off_campaign_metadata',
        dailyProjectionSkipped: true,
      });
    });

    it('replaces prior detail targets with one explicit-empty ON campaign marker', async () => {
      const seeded = await seedListing({
        organizationId: TEST_ORGANIZATION_ID,
        externalId: 'EXT-EMPTY-ON',
        externalOptionId: 'VI-EMPTY-ON',
      });
      await adSyncService.sync(
        {
          type: 'ad_campaign',
          ...AUTHORITATIVE_CAMPAIGN_DAY,
          campaignName: 'Campaign empty ON',
          normalizedRows: [{
            pageType: 'product',
            campaignId: 'CAMP-EMPTY-ON',
            campaignName: 'Campaign empty ON',
            vendorItemId: 'VI-EMPTY-ON',
            spend: 900,
          }],
        },
        TEST_ORGANIZATION_ID,
      );

      const result = await adSyncService.sync(
        {
          type: 'ad_campaign',
          ...AUTHORITATIVE_CAMPAIGN_DAY,
          campaignName: 'Campaign empty ON',
          normalizedRows: [{
            pageType: 'campaign',
            campaignId: 'CAMP-EMPTY-ON',
            campaignName: 'Campaign empty ON',
            _campaignOnly: true,
            onOff: 'ON',
          }],
        },
        TEST_ORGANIZATION_ID,
      );

      expect(result).toMatchObject({
        success: true,
        targetDailyCount: 1,
        deletedTargetDailyCount: 1,
      });
      const targets = await prisma.channelAdTargetDailySnapshot.findMany({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          campaignId: 'CAMP-EMPTY-ON',
        },
      });
      expect(targets).toHaveLength(1);
      expect(targets[0]).toMatchObject({
        targetType: 'campaign',
        targetKey: `account:${seeded.channelAccount.id}:campaign:CAMP-EMPTY-ON`,
        spend: 0,
        revenue: 0,
      });
    });

    it('rekeys an equivalent proven-account legacy target in place without detaching its AdAction', async () => {
      const seeded = await seedListing({
        organizationId: TEST_ORGANIZATION_ID,
        externalId: 'EXT-LEGACY-EQUIVALENT',
        externalOptionId: 'VI-LEGACY-EQUIVALENT',
      });
      const legacyTarget = await prisma.channelAdTargetDailySnapshot.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'coupang',
          businessDate: new Date('2026-04-14T00:00:00.000Z'),
          targetType: 'product',
          targetKey: 'product:legacy-equivalent',
          listingId: seeded.listing.id,
          listingOptionId: seeded.listingOption.id,
          externalId: seeded.listing.externalId,
          externalOptionId: seeded.listingOption.externalOptionId,
          campaignId: 'CAMP-LEGACY-EQUIVALENT',
          campaignName: 'Campaign legacy equivalent',
          spend: 50,
          adSpend: 50,
        },
      });
      const action = await prisma.adAction.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          listingId: seeded.listing.id,
          listingOptionId: seeded.listingOption.id,
          adTargetDailyId: legacyTarget.id,
          actionType: 'adjust_bid',
          targetType: 'product',
          targetLabel: 'Keep equivalent action link',
          reason: 'integration legacy rekey guard',
        },
      });

      await adSyncService.sync(
        {
          type: 'ad_campaign',
          ...AUTHORITATIVE_CAMPAIGN_DAY,
          campaignName: 'Campaign legacy equivalent',
          normalizedRows: [{
            pageType: 'product',
            campaignId: 'CAMP-LEGACY-EQUIVALENT',
            campaignName: 'Campaign legacy equivalent',
            vendorItemId: 'VI-LEGACY-EQUIVALENT',
            spend: 150,
          }],
        },
        TEST_ORGANIZATION_ID,
      );

      const rekeyed = await prisma.channelAdTargetDailySnapshot.findUniqueOrThrow({
        where: { id: legacyTarget.id },
      });
      expect(rekeyed).toMatchObject({
        id: legacyTarget.id,
        targetKey:
          `account:${seeded.channelAccount.id}:product:CAMP-LEGACY-EQUIVALENT:VI-LEGACY-EQUIVALENT`,
        spend: 150,
        adSpend: 150,
      });
      expect(await prisma.adAction.findUniqueOrThrow({ where: { id: action.id } }))
        .toMatchObject({ adTargetDailyId: legacyTarget.id });
    });

    it('rejects an authoritative replacement that would orphan a dependent AdAction', async () => {
      const oldListing = await seedListing({
        organizationId: TEST_ORGANIZATION_ID,
        externalId: 'EXT-ACTION-OLD',
        externalOptionId: 'VI-ACTION-OLD',
      });
      await adSyncService.sync(
        {
          type: 'ad_campaign',
          ...AUTHORITATIVE_CAMPAIGN_DAY,
          campaignName: 'Campaign action conflict',
          normalizedRows: [{
            pageType: 'product',
            campaignId: 'CAMP-ACTION-CONFLICT',
            campaignName: 'Campaign action conflict',
            vendorItemId: 'VI-ACTION-OLD',
            spend: 100,
          }],
        },
        TEST_ORGANIZATION_ID,
      );
      const oldTarget = await prisma.channelAdTargetDailySnapshot.findFirstOrThrow({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          campaignId: 'CAMP-ACTION-CONFLICT',
        },
      });
      const action = await prisma.adAction.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          listingId: oldListing.listing.id,
          listingOptionId: oldListing.listingOption.id,
          adTargetDailyId: oldTarget.id,
          actionType: 'adjust_bid',
          targetType: 'product',
          targetLabel: 'Keep linked target',
          reason: 'integration conflict guard',
        },
      });
      await seedListing({
        organizationId: TEST_ORGANIZATION_ID,
        externalId: 'EXT-ACTION-NEW',
        externalOptionId: 'VI-ACTION-NEW',
      });

      await expect(adSyncService.sync(
        {
          type: 'ad_campaign',
          ...AUTHORITATIVE_CAMPAIGN_DAY,
          campaignName: 'Campaign action conflict',
          normalizedRows: [{
            pageType: 'product',
            campaignId: 'CAMP-ACTION-CONFLICT',
            campaignName: 'Campaign action conflict',
            vendorItemId: 'VI-ACTION-NEW',
            spend: 200,
          }],
        },
        TEST_ORGANIZATION_ID,
      )).rejects.toMatchObject({
        constructor: ConflictException,
        response: { code: 'dependent_action_conflict' },
      });
      expect(await prisma.channelAdTargetDailySnapshot.findUnique({
        where: { id: oldTarget.id },
      })).toEqual(oldTarget);
      expect(await prisma.adAction.findUniqueOrThrow({
        where: { id: action.id },
      })).toEqual(action);
      expect(await prisma.channelAdTargetDailySnapshot.count({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          campaignId: 'CAMP-ACTION-CONFLICT',
        },
      })).toBe(1);
      const rejectedRun = await prisma.channelScrapeRun.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID, source: 'advertising' },
        orderBy: { createdAt: 'desc' },
      });
      expect(rejectedRun).toMatchObject({
        status: 'partial',
        errorCount: 1,
        errorJson: { projectionRejectionCode: 'dependent_action_conflict' },
      });
    });

    it('replaces only the selected account when two accounts share campaign identity and date', async () => {
      const primary = await prisma.channelAccount.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID, channel: 'coupang' },
      });
      const secondary = await prisma.channelAccount.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'coupang',
          name: 'Ad Sync PG Coupang Secondary',
          externalAccountId: 'ad-sync-pg-isolation',
        },
      });
      for (const [accountId, vendorItemId, spend] of [
        [primary.id, 'VI-ACCOUNT-PRIMARY', 300],
        [secondary.id, 'VI-ACCOUNT-SECONDARY', 600],
      ] as const) {
        await adSyncService.sync(
          {
            type: 'ad_campaign',
            ...AUTHORITATIVE_CAMPAIGN_DAY,
            channelAccountId: accountId,
            campaignName: 'Shared campaign identity',
            normalizedRows: [{
              pageType: 'product',
              campaignId: 'CAMP-SHARED-ACCOUNT',
              campaignName: 'Shared campaign identity',
              vendorItemId,
              spend,
            }],
          },
          TEST_ORGANIZATION_ID,
        );
      }

      await adSyncService.sync(
        {
          type: 'ad_campaign',
          ...AUTHORITATIVE_CAMPAIGN_DAY,
          channelAccountId: primary.id,
          campaignName: 'Shared campaign identity',
          normalizedRows: [{
            pageType: 'campaign',
            campaignId: 'CAMP-SHARED-ACCOUNT',
            campaignName: 'Shared campaign identity',
            _campaignOnly: true,
            onOff: 'ON',
          }],
        },
        TEST_ORGANIZATION_ID,
      );

      const targets = await prisma.channelAdTargetDailySnapshot.findMany({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          campaignId: 'CAMP-SHARED-ACCOUNT',
        },
        orderBy: { targetKey: 'asc' },
      });
      expect(targets).toHaveLength(2);
      expect(targets).toEqual(expect.arrayContaining([
        expect.objectContaining({
          targetKey: `account:${primary.id}:campaign:CAMP-SHARED-ACCOUNT`,
          targetType: 'campaign',
          spend: 0,
        }),
        expect.objectContaining({
          targetKey:
            `account:${secondary.id}:product:CAMP-SHARED-ACCOUNT:VI-ACCOUNT-SECONDARY`,
          targetType: 'product',
          spend: 600,
        }),
      ]));
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

  describe('cross-source ownership', () => {
    it('#9 ad_campaign target facts do not contaminate traffic-owned listing aggregates', async () => {
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
          ...AUTHORITATIVE_CAMPAIGN_DAY,
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

      expect(listingDaily?.adSpend).toBe(0);
      expect(listingDaily?.adRevenue).toBe(0);
      expect(listingDaily?.trafficVisitors).toBe(200);
      expect(listingDaily?.trafficOrders).toBe(8);

      // Listing metadata belongs only to the traffic source.
      const meta = listingDaily?.metaJson as Record<string, unknown>;
      expect(meta).toMatchObject({
        'wing.traffic': {
          periodDays: 14,
        },
      });
      expect(Object.keys(meta)).toEqual(['wing.traffic']);
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
