import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import type { PrismaClient } from '@prisma/client';
import { AdvertisingModule } from '../advertising.module';
import { AdSyncService } from '../application/service/ad-sync.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CHANNEL_TARGET_DAILY_REPOSITORY_PORT,
  type ChannelTargetDailyRepositoryPort,
} from '../application/port/out/repository/channel-target-daily.repository.port';
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
  let targetDailyRepo: ChannelTargetDailyRepositoryPort;
  const observedMetrics = {
    adSpend: true,
    adRevenue: true,
    impressions: true,
    clicks: true,
    conversions: true,
    orders: true,
  };

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
    targetDailyRepo = m.get(CHANNEL_TARGET_DAILY_REPOSITORY_PORT);
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

    it('uses the primary active account when an organization has multiple active Coupang accounts', async () => {
      const primary = await prisma.channelAccount.findFirstOrThrow({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'coupang',
          isPrimary: true,
        },
        select: { id: true },
      });
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
      ).resolves.toMatchObject({ channelAccountId: primary.id });
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

    it('#2 vendorItemId hit → campaign-qualified ChannelAdTargetDailySnapshot without a lossy listing-day projection', async () => {
      const seeded = await seedListing({
        organizationId: TEST_ORGANIZATION_ID,
        externalId: 'EXT-COUPANG-1',
        externalOptionId: 'VI-HIT-1',
      });

      const result = await adSyncService.sync(
        {
          type: 'ad_campaign',
          campaignReportScope: 'single_campaign_authoritative',
          campaignName: 'Campaign-α',
          period: '1d',
          startDate: '2026-04-14',
          endDate: '2026-04-14',
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
              _observedMetrics: observedMetrics,
            },
          ],
        },
        TEST_ORGANIZATION_ID,
      );

      expect(result.success).toBe(true);

      // Campaigns arrive as separate requests, so this handler cannot safely
      // aggregate a listing that participates in several campaigns.
      const listingDaily = await prisma.channelListingDailySnapshot.findFirst({
        where: { organizationId: TEST_ORGANIZATION_ID, listingId: seeded.listing.id },
      });
      expect(listingDaily).toBeNull();

      // Target daily fact retains both campaign and vendor-item identity.
      const targetDaily = await prisma.channelAdTargetDailySnapshot.findFirst({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          targetType: 'product',
          targetKey: 'product:CAMP-1:VI-HIT-1',
        },
      });
      expect(targetDaily).toBeDefined();
      expect(targetDaily?.spend).toBe(1500);
      expect(targetDaily?.revenue).toBe(5000);
      expect(targetDaily?.adSpend).toBe(1500);
      expect(targetDaily?.adRevenue).toBe(5000);
      expect(targetDaily?.listingId).toBe(seeded.listing.id);
      expect(targetDaily?.listingOptionId).toBe(seeded.listingOption.id);

      // Per-campaign requests must not overwrite the account/day KPI row.
      // Exact account totals are persisted only by `coupang_ads_daily`.
      const kpi = await prisma.channelAccountDailyKpiSnapshot.findFirst({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          source: 'advertising',
          kpiType: 'advertising_campaign_kpis',
        },
      });
      expect(kpi).toBeNull();
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
          campaignReportScope: 'single_campaign_authoritative',
          campaignName: 'Campaign-β',
          period: '1d',
          startDate: '2026-04-14',
          endDate: '2026-04-14',
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
              _observedMetrics: observedMetrics,
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
          campaignReportScope: 'single_campaign_authoritative',
          campaignName: 'Campaign-γ',
          period: '1d',
          startDate: '2026-04-14',
          endDate: '2026-04-14',
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
              _observedMetrics: observedMetrics,
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
          campaignReportScope: 'single_campaign_authoritative',
          campaignName: 'Campaign-δ',
          period: '1d',
          startDate: '2026-04-14',
          endDate: '2026-04-14',
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
              _observedMetrics: observedMetrics,
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

    it('#6 idempotent replay: same campaign-product payload twice → one target fact, sampleCount=2', async () => {
      const seeded = await seedListing({
        organizationId: TEST_ORGANIZATION_ID,
        externalId: 'EXT-IDEM',
        externalOptionId: 'VI-IDEM',
      });

      const payload = {
        type: 'ad_campaign' as const,
        campaignReportScope: 'single_campaign_authoritative' as const,
        campaignName: 'Camp-Idem',
        period: '1d',
        startDate: '2026-04-14',
        endDate: '2026-04-14',
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
            _observedMetrics: observedMetrics,
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
          targetKey: 'product:CAMP-IDEM:VI-IDEM',
        },
      });
      expect(targetDaily?.spend).toBe(1000);
      expect(targetDaily?.revenue).toBe(3000);
      expect(targetDaily?.sampleCount).toBe(2);
    });

    it('authoritatively replaces one campaign day so A+B followed by A removes B', async () => {
      await seedListing({
        organizationId: TEST_ORGANIZATION_ID,
        externalId: 'EXT-REPLACE-A',
        externalOptionId: 'VI-REPLACE-A',
      });
      await seedListing({
        organizationId: TEST_ORGANIZATION_ID,
        externalId: 'EXT-REPLACE-B',
        externalOptionId: 'VI-REPLACE-B',
      });
      const base = {
        type: 'ad_campaign' as const,
        campaignReportScope: 'single_campaign_authoritative' as const,
        campaignName: 'Campaign replace',
        period: '1d',
        startDate: '2026-04-15',
        endDate: '2026-04-15',
      };
      const row = (vendorItemId: string) => ({
        pageType: 'product',
        campaignName: 'Campaign replace',
        campaignId: 'CAMP-REPLACE',
        vendorItemId,
        spend: '100',
        _observedMetrics: observedMetrics,
      });

      await adSyncService.sync(
        {
          ...base,
          normalizedRows: [row('VI-REPLACE-A'), row('VI-REPLACE-B')],
        },
        TEST_ORGANIZATION_ID,
      );
      await adSyncService.sync(
        { ...base, normalizedRows: [row('VI-REPLACE-A')] },
        TEST_ORGANIZATION_ID,
      );

      const facts = await prisma.channelAdTargetDailySnapshot.findMany({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          businessDate: new Date('2026-04-15T00:00:00.000Z'),
          campaignId: 'CAMP-REPLACE',
        },
        select: { targetKey: true },
      });
      expect(facts).toEqual([
        { targetKey: 'product:CAMP-REPLACE:VI-REPLACE-A' },
      ]);
      expect(
        await prisma.channelScrapeSnapshot.count({
          where: { organizationId: TEST_ORGANIZATION_ID },
        }),
      ).toBe(3);
    });

    it('preserves ambiguous name-only legacy aliases while replacing the exact campaign id', async () => {
      await seedListing({
        organizationId: TEST_ORGANIZATION_ID,
        externalId: 'EXT-ALIAS',
        externalOptionId: 'VI-ALIAS',
      });
      const businessDate = new Date('2026-04-18T00:00:00.000Z');
      await prisma.channelAdTargetDailySnapshot.createMany({
        data: [
          {
            organizationId: TEST_ORGANIZATION_ID,
            channel: 'coupang',
            businessDate,
            targetType: 'product',
            targetKey: 'product:VI-LEGACY',
            campaignName: 'Same display name',
            externalOptionId: 'VI-LEGACY',
            metaJson: { 'advertising.campaign.target': { legacy: true } },
          },
          {
            organizationId: TEST_ORGANIZATION_ID,
            channel: 'coupang',
            businessDate,
            targetType: 'campaign',
            targetKey: 'campaign:CAMP-OTHER',
            campaignId: 'CAMP-OTHER',
            campaignName: 'Same display name',
            metaJson: { 'advertising.campaign.target': { other: true } },
          },
          {
            organizationId: TEST_ORGANIZATION_ID,
            channel: 'coupang',
            businessDate,
            targetType: 'product',
            targetKey: 'product:VI-RAW-ONLY',
            campaignName: 'Same display name',
            externalOptionId: 'VI-RAW-ONLY',
            metaJson: { 'advertising.raw.target': { rawOnly: true } },
          },
        ],
      });

      await adSyncService.sync(
        {
          type: 'ad_campaign',
          campaignReportScope: 'single_campaign_authoritative',
          campaignName: 'Same display name',
          startDate: '2026-04-18',
          endDate: '2026-04-18',
          normalizedRows: [
            {
              pageType: 'product',
              campaignName: 'Same display name',
              campaignId: 'CAMP-CURRENT',
              vendorItemId: 'VI-ALIAS',
              _observedMetrics: observedMetrics,
            },
          ],
        },
        TEST_ORGANIZATION_ID,
      );

      const keys = await prisma.channelAdTargetDailySnapshot.findMany({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          businessDate,
          campaignName: 'Same display name',
        },
        orderBy: { targetKey: 'asc' },
        select: { targetKey: true },
      });
      expect(keys).toEqual([
        { targetKey: 'campaign:CAMP-OTHER' },
        { targetKey: 'product:CAMP-CURRENT:VI-ALIAS' },
        { targetKey: 'product:VI-LEGACY' },
        { targetKey: 'product:VI-RAW-ONLY' },
      ]);
    });

    it('removes stale products for OFF and explicit-empty campaign reports', async () => {
      await seedListing({
        organizationId: TEST_ORGANIZATION_ID,
        externalId: 'EXT-OFF',
        externalOptionId: 'VI-OFF',
      });
      const base = {
        type: 'ad_campaign' as const,
        campaignReportScope: 'single_campaign_authoritative' as const,
        campaignName: 'Campaign off',
        startDate: '2026-04-16',
        endDate: '2026-04-16',
      };

      await adSyncService.sync(
        {
          ...base,
          normalizedRows: [
            {
              pageType: 'product',
              campaignName: 'Campaign off',
              campaignId: 'CAMP-OFF',
              vendorItemId: 'VI-OFF',
              _observedMetrics: observedMetrics,
            },
          ],
        },
        TEST_ORGANIZATION_ID,
      );
      await adSyncService.sync(
        {
          ...base,
          dashboardOnOff: 'OFF',
          normalizedRows: [
            {
              pageType: 'campaign',
              campaignName: 'Campaign off',
              campaignId: 'CAMP-OFF',
              onOff: 'OFF',
              status: '일시정지',
              _campaignOnly: true,
            },
          ],
        },
        TEST_ORGANIZATION_ID,
      );

      expect(
        await prisma.channelAdTargetDailySnapshot.findMany({
          where: {
            organizationId: TEST_ORGANIZATION_ID,
            campaignId: 'CAMP-OFF',
          },
          select: { targetKey: true, onOff: true },
        }),
      ).toEqual([{ targetKey: 'campaign:CAMP-OFF', onOff: 'OFF' }]);

      await adSyncService.sync(
        {
          ...base,
          normalizedRows: [
            {
              pageType: 'product',
              campaignName: 'Campaign off',
              campaignId: 'CAMP-OFF',
              vendorItemId: 'VI-OFF',
              _observedMetrics: observedMetrics,
            },
          ],
        },
        TEST_ORGANIZATION_ID,
      );
      await adSyncService.sync(
        {
          ...base,
          normalizedRows: [
            {
              pageType: 'campaign',
              campaignName: 'Campaign off',
              campaignId: 'CAMP-OFF',
              status: '집행중',
              _campaignOnly: true,
            },
          ],
        },
        TEST_ORGANIZATION_ID,
      );
      expect(
        await prisma.channelAdTargetDailySnapshot.findMany({
          where: {
            organizationId: TEST_ORGANIZATION_ID,
            campaignName: 'Campaign off',
          },
          select: { targetKey: true, status: true },
        }),
      ).toEqual([{ targetKey: 'campaign:CAMP-OFF', status: '집행중' }]);
    });

    it('rolls back the complete campaign replacement when a later insert fails', async () => {
      const businessDate = new Date('2026-04-17T00:00:00.000Z');
      const target = (overrides: Record<string, unknown> = {}) => ({
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        businessDate,
        targetType: 'product' as const,
        targetKey: 'product:CAMP-ATOMIC:VI-ATOMIC-A',
        campaignId: 'CAMP-ATOMIC',
        campaignName: 'Campaign atomic',
        externalOptionId: 'VI-ATOMIC-A',
        spend: 100,
        metaJson: {
          source: 'advertising.campaign.target',
          data: { pageType: 'product' },
        },
        ...overrides,
      });
      await targetDailyRepo.replaceCampaignDay({
        organizationId: TEST_ORGANIZATION_ID,
        channel: 'coupang',
        businessDate,
        campaignId: 'CAMP-ATOMIC',
        campaignName: 'Campaign atomic',
        targets: [target()],
      });

      await expect(
        targetDailyRepo.replaceCampaignDay({
          organizationId: TEST_ORGANIZATION_ID,
          channel: 'coupang',
          businessDate,
          campaignId: 'CAMP-ATOMIC',
          campaignName: 'Campaign atomic',
          targets: [
            target({ spend: 999 }),
            target({
              targetKey: 'product:CAMP-ATOMIC:VI-ATOMIC-B',
              externalOptionId: 'VI-ATOMIC-B',
              listingId: '11111111-1111-4111-8111-111111111111',
            }),
          ],
        }),
      ).rejects.toThrow();

      const facts = await prisma.channelAdTargetDailySnapshot.findMany({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          campaignId: 'CAMP-ATOMIC',
        },
        select: { targetKey: true, spend: true },
      });
      expect(facts).toEqual([
        {
          targetKey: 'product:CAMP-ATOMIC:VI-ATOMIC-A',
          spend: 100,
        },
      ]);
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
    it('#9 ad_campaign target facts do not contaminate traffic-owned listing-day metrics', async () => {
      const seeded = await seedListing({
        organizationId: TEST_ORGANIZATION_ID,
        externalId: 'EXT-META-MERGE',
        externalOptionId: 'VI-META-MERGE',
      });

      // Campaign metrics remain at campaign-qualified target grain.
      await adSyncService.sync(
        {
          type: 'ad_campaign',
          campaignReportScope: 'single_campaign_authoritative',
          campaignName: 'CampaignMerge',
          period: '1d',
          startDate: '2026-04-14',
          endDate: '2026-04-14',
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
              _observedMetrics: observedMetrics,
            },
          ],
        },
        TEST_ORGANIZATION_ID,
      );

      // Traffic remains the owner of its listing-day projection.
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

      const meta = listingDaily?.metaJson as Record<string, unknown>;
      expect(meta).toMatchObject({
        'wing.traffic': {
          periodDays: 14,
        },
      });
      expect(Object.keys(meta)).toEqual(['wing.traffic']);

      const targetDaily = await prisma.channelAdTargetDailySnapshot.findFirst({
        where: {
          organizationId: TEST_ORGANIZATION_ID,
          targetKey: 'product:CAMP-MERGE:VI-META-MERGE',
        },
      });
      expect(targetDaily).toMatchObject({ spend: 1500, revenue: 5000 });
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
