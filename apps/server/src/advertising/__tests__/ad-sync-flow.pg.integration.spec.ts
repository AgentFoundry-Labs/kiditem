import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaClient } from '@prisma/client';
import { AdSyncService } from '../services/ad-sync.service';
import { ChannelScrapePersistenceService } from '../services/channel-scrape-persistence.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
  OTHER_COMPANY_ID,
} from '../../test-helpers/real-prisma';

describe('AdSync flow (PG integration)', () => {
  let prisma: PrismaClient;
  let adSyncService: AdSyncService;

  async function seedListing(params: {
    companyId: string;
    externalId: string;
    externalOptionId: string;
    legacySuffix?: string;
  }) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}${params.legacySuffix ?? ''}`;
    const master = await prisma.masterProduct.create({
      data: {
        companyId: params.companyId,
        code: `M-${unique}`,
        name: `Master ${unique}`,
        optionCounter: 0,
      },
    });
    const option = await prisma.productOption.create({
      data: {
        companyId: params.companyId,
        masterId: master.id,
        sku: `SKU-${unique}`,
        optionName: `Option ${unique}`,
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        companyId: params.companyId,
        masterId: master.id,
        channel: 'coupang',
        externalId: params.externalId,
      },
    });
    const listingOption = await prisma.channelListingOption.create({
      data: {
        companyId: params.companyId,
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
    it('#1 populates externalOptionIdMap + externalIdMap only for scoped company', async () => {
      const a = await seedListing({
        companyId: TEST_COMPANY_ID,
        externalId: 'EXT-A',
        externalOptionId: 'VENDOR-A',
        legacySuffix: '-a',
      });
      await seedListing({
        companyId: OTHER_COMPANY_ID,
        externalId: 'EXT-OTHER',
        externalOptionId: 'VENDOR-OTHER',
        legacySuffix: '-other',
      });

      const map = await adSyncService.buildListingMap(TEST_COMPANY_ID);

      // Wave C2: externalOptionIdMap entries now carry listingOptionId so C3
      // can land option daily snapshots even when the internal optionId is
      // null. Existing matched-option case still resolves to the same internal
      // optionId / listingId. Wave C3 additionally carries listing.externalId
      // for denormalized daily snapshot rows without a second DB lookup.
      expect(map.externalOptionIdMap.get('VENDOR-A')).toEqual({
        listingId: a.listing.id,
        listingOptionId: a.listingOption.id,
        optionId: a.option.id,
        externalId: 'EXT-A',
      });
      expect(map.externalIdMap.get('EXT-A')).toEqual({ listingId: a.listing.id });
      expect(map.externalOptionIdMap.has('VENDOR-OTHER')).toBe(false);
      expect(map.externalIdMap.has('EXT-OTHER')).toBe(false);
    });
  });

  describe('sync(ad_campaign)', () => {
    it('#2 vendorItemId hit → snapshots + Ad row keyed by listingId+optionId', async () => {
      const seeded = await seedListing({
        companyId: TEST_COMPANY_ID,
        externalId: 'EXT-COUPANG-1',
        externalOptionId: 'VI-HIT-1',
      });

      const result = await adSyncService.sync(
        {
          type: 'ad_campaign',
          campaignName: 'Campaign-α',
          period: '7d',
          kpis: { '전체 집행 광고비': '12000', '광고 전환 매출': '30000' },
          normalizedRows: [
            {
              pageType: 'product',
              campaignName: 'Campaign-α',
              productName: 'Product-α',
              vendorItemId: 'VI-HIT-1',
              itemId: 'VI-HIT-1',
              spend: '1500',
              revenue: '5000',
              impressions: '1000',
              clicks: '50',
              conversions: '3',
              orders: '3',
              roas: '3.33',
              ctr: '5.0',
            },
          ],
        },
        TEST_COMPANY_ID,
      );

      expect(result.success).toBe(true);
      const campaignResult = result as { snapshotCount: number; productCount: number; adCount: number };
      expect(campaignResult.snapshotCount).toBe(1);
      expect(campaignResult.productCount).toBe(1);
      expect(campaignResult.adCount).toBe(1);

      const productSnapshot = await prisma.adSnapshot.findFirst({
        where: { companyId: TEST_COMPANY_ID, level: 'product' },
      });
      expect(productSnapshot?.listingId).toBe(seeded.listing.id);
      expect(productSnapshot?.optionId).toBe(seeded.option.id);

      const ad = await prisma.ad.findFirst({
        where: { companyId: TEST_COMPANY_ID, platform: 'coupang' },
      });
      expect(ad?.listingId).toBe(seeded.listing.id);
      expect(ad?.optionId).toBe(seeded.option.id);
      expect(ad?.spend).toBe(1500);
      expect(ad?.revenue).toBe(5000);
    });

    it('#3 externalId hit (no vendorItemId) → snapshot with listingId but optionId null', async () => {
      const seeded = await seedListing({
        companyId: TEST_COMPANY_ID,
        externalId: 'EXT-COUPANG-2',
        externalOptionId: 'VI-UNUSED-2',
      });

      await adSyncService.sync(
        {
          type: 'ad_campaign',
          campaignName: 'Campaign-β',
          period: '7d',
          normalizedRows: [
            {
              pageType: 'keyword',
              campaignName: 'Campaign-β',
              keyword: 'widget',
              externalId: 'EXT-COUPANG-2',
              spend: '800',
              impressions: '200',
              clicks: '10',
            },
          ],
        },
        TEST_COMPANY_ID,
      );

      const snapshot = await prisma.adSnapshot.findFirst({
        where: {
          companyId: TEST_COMPANY_ID,
          pageType: 'keyword',
          keyword: 'widget',
        },
      });
      expect(snapshot?.listingId).toBe(seeded.listing.id);
      expect(snapshot?.optionId).toBeNull();

      const ad = await prisma.ad.findFirst({
        where: { companyId: TEST_COMPANY_ID, platform: 'coupang' },
      });
      expect(ad?.listingId).toBe(seeded.listing.id);
      expect(ad?.optionId).toBeNull();
    });

    it('#4 unmatched row → snapshot row with null listing/option, no Ad created', async () => {
      await seedListing({
        companyId: TEST_COMPANY_ID,
        externalId: 'EXT-PRESENT',
        externalOptionId: 'VI-PRESENT',
      });

      const result = await adSyncService.sync(
        {
          type: 'ad_campaign',
          campaignName: 'Campaign-γ',
          period: '7d',
          normalizedRows: [
            {
              pageType: 'campaign',
              campaignName: 'Campaign-γ',
              vendorItemId: 'VI-NO-MATCH',
              externalId: 'EXT-NO-MATCH',
              spend: '500',
              impressions: '100',
              clicks: '5',
            },
          ],
        },
        TEST_COMPANY_ID,
      );

      const campaignResult = result as { snapshotCount: number; productCount: number; adCount: number };
      expect(campaignResult.snapshotCount).toBe(1);
      expect(campaignResult.productCount).toBe(0);
      expect(campaignResult.adCount).toBe(0);

      const unmatchedSnapshot = await prisma.adSnapshot.findFirst({
        where: {
          companyId: TEST_COMPANY_ID,
          pageType: 'campaign',
          campaignName: 'Campaign-γ',
          level: null,
        },
      });
      expect(unmatchedSnapshot?.listingId).toBeNull();
      expect(unmatchedSnapshot?.optionId).toBeNull();

      const adCount = await prisma.ad.count({
        where: { companyId: TEST_COMPANY_ID },
      });
      expect(adCount).toBe(0);
    });

    it('#5 cross-tenant: other company vendorItemId must not match this company', async () => {
      await seedListing({
        companyId: OTHER_COMPANY_ID,
        externalId: 'EXT-OTHER-ONLY',
        externalOptionId: 'VI-OTHER-ONLY',
        legacySuffix: '-xt',
      });

      const result = await adSyncService.sync(
        {
          type: 'ad_campaign',
          campaignName: 'Campaign-δ',
          period: '7d',
          normalizedRows: [
            {
              pageType: 'product',
              campaignName: 'Campaign-δ',
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
        TEST_COMPANY_ID,
      );

      const campaignResult = result as { snapshotCount: number; productCount: number; adCount: number };
      expect(campaignResult.snapshotCount).toBe(1);
      expect(campaignResult.adCount).toBe(0);

      const snapshots = await prisma.adSnapshot.findMany({
        where: { companyId: TEST_COMPANY_ID },
      });
      expect(snapshots.every((s) => s.listingId === null && s.optionId === null)).toBe(true);

      const otherSnapshots = await prisma.adSnapshot.count({
        where: { companyId: OTHER_COMPANY_ID },
      });
      expect(otherSnapshots).toBe(0);

      const ads = await prisma.ad.count({
        where: { companyId: TEST_COMPANY_ID },
      });
      expect(ads).toBe(0);
    });
  });
});
