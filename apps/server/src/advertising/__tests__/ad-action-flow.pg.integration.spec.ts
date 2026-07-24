import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { EventEmitterModule } from '@nestjs/event-emitter';
import type { PrismaClient } from '@prisma/client';
import { AdvertisingModule } from '../advertising.module';
import { AdActionService } from '../application/service/ad-action.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';

describe('AdAction flow (PG integration)', () => {
  let prisma: PrismaClient;
  let adActionService: AdActionService;

  async function seedListingWithOption(params: {
    organizationId: string;
    abcGrade?: string | null;
    sellableStock?: number | null;
    costPrice?: number | null;
    sellPrice?: number | null;
    commissionRate?: number | null;
    externalIdSuffix?: string;
  }) {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channelAccount =
      (await prisma.channelAccount.findFirst({
        where: {
          organizationId: params.organizationId,
          channel: 'coupang',
          externalAccountId: 'advertising-pg',
        },
      })) ??
      (await prisma.channelAccount.create({
        data: {
          organizationId: params.organizationId,
          channel: 'coupang',
          name: 'Advertising PG Coupang',
          externalAccountId: 'advertising-pg',
          isPrimary: true,
        },
      }));
    const importRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: params.organizationId,
        sourceType: 'coupang_wing_catalog',
        channelAccountId: channelAccount.id,
        fileName: 'advertising-pg.xlsx',
        fileHash: `advertising-pg-${unique}`,
        status: 'completed',
        rowCount: 1,
        importedAt: new Date(),
      },
    });
    const master = await prisma.masterProduct.create({
      data: {
        organizationId: params.organizationId,
        code: `M-${unique}`,
        name: `Master ${unique}`,
        abcGrade: params.abcGrade ?? null,
      },
    });
    const matched = params.sellableStock != null;
    const inventorySku = matched
      ? await prisma.sellpiaInventorySku.create({
          data: {
            organizationId: params.organizationId,
            code: `SP-${unique}`,
            name: `Sellpia ${unique}`,
            currentStock: params.sellableStock!,
            purchasePrice: params.costPrice ?? null,
          },
        })
      : null;
    const variant = matched
      ? await prisma.productVariant.create({
          data: {
            organizationId: params.organizationId,
            masterProductId: master.id,
            code: `VAR-${unique}`,
            name: `Variant ${unique}`,
            isDefault: true,
          },
        })
      : null;
    if (variant && inventorySku) {
      await prisma.productVariantComponent.create({
        data: {
          organizationId: params.organizationId,
          productVariantId: variant.id,
          sellpiaInventorySkuId: inventorySku.id,
          quantity: 1,
          source: 'manual',
        },
      });
    }
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: params.organizationId,
        channelAccountId: channelAccount.id,
        masterProductId: master.id,
        externalId: `EXT-${unique}${params.externalIdSuffix ?? ''}`,
        lastImportRunId: importRun.id,
      },
    });
    const listingOption = await prisma.channelListingOption.create({
      data: {
        organizationId: params.organizationId,
        listingId: listing.id,
        productVariantId: variant?.id ?? null,
        externalOptionId: `VID-${unique}`,
        salePrice: params.sellPrice ?? null,
        costPriceOverride: params.costPrice ?? null,
        commissionRate: params.commissionRate ?? null,
        lastImportRunId: importRun.id,
        isActive: true,
      },
    });
    const option = listingOption;
    return { master, option, listing, listingOption };
  }

  /**
   * H3 — seed `ChannelAdTargetDailySnapshot` (the new source-of-truth) instead
   * of legacy `AdSnapshot`. Maps the legacy `seedSnapshot` shape onto the new
   * target-daily columns (pageType → targetType, etc.). Each row uses today's
   * KST businessDate so the latest-per-targetKey query lands it.
   */
  async function seedSnapshot(params: {
    organizationId: string;
    channelAccountId?: string;
    listingId: string;
    listingOptionId?: string | null;
    optionId?: string | null;
    pageType: 'campaign' | 'keyword' | 'product';
    externalId: string;
    campaignName?: string;
    keyword?: string;
    status?: string;
    currentBid?: number | null;
    dailyBudget?: number | null;
    impressions?: number;
    clicks?: number;
    conversions?: number;
    spend?: number;
    revenue?: number;
    /** Legacy ROAS input — when provided, derive revenue from spend so
     * `recomputeRoas(revenue, spend)` returns this value (matches the old
     * provider-ratio expectation in tests). */
    roas?: number;
  }) {
    // Today's KST business date (same `@db.Date` shape ingestion writes).
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const channelAccountId = params.channelAccountId ?? (
      await prisma.channelListing.findFirstOrThrow({
        where: {
          id: params.listingId,
          organizationId: params.organizationId,
        },
        select: { channelAccountId: true },
      })
    ).channelAccountId;
    const campaignIdentity = params.campaignName
      ? `campaign:test:${params.campaignName}`
      : null;

    // targetKey shape per util/ad-target-key.ts
    const targetKeySuffix =
      params.pageType === 'keyword'
        ? `keyword:${params.campaignName ?? 'C'}::${params.keyword ?? params.externalId}`
        : params.pageType === 'product'
          ? `product:${params.externalId}`
          : `campaign:${params.campaignName ?? params.externalId}`;
    const targetKey = `account:${channelAccountId}:${targetKeySuffix}`;

    // When the test passes `roas` without an explicit spend, default spend to
    // 1000 so `recomputeRoas(revenue, spend)` returns the intended ratio.
    const spend =
      params.spend ?? (params.roas != null && params.revenue == null ? 1000 : 0);
    // Derive revenue from explicit value, or from legacy roas hint, else 0.
    const revenue =
      params.revenue ??
      (params.roas != null && spend > 0
        ? Math.round((params.roas / 100) * spend)
        : 0);

    return prisma.channelAdTargetDailySnapshot.create({
      data: {
        organizationId: params.organizationId,
        channelAccountId,
        channel: 'coupang',
        businessDate: today,
        targetType: params.pageType,
        targetKey,
        listingId: params.listingId,
        listingOptionId: params.listingOptionId ?? null,
        externalId: params.externalId,
        campaignName: params.campaignName ?? null,
        campaignIdentity,
        keyword: params.keyword ?? null,
        status: params.status ?? null,
        currentBid: params.currentBid ?? null,
        dailyBudget: params.dailyBudget ?? null,
        impressions: params.impressions ?? 0,
        clicks: params.clicks ?? 0,
        conversions: params.conversions ?? 0,
        spend,
        revenue,
        adSpend: spend,
        adRevenue: revenue,
      },
    });
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
    adActionService = m.get(AdActionService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    await prisma.sellpiaInventoryState.createMany({
      data: [TEST_ORGANIZATION_ID, OTHER_ORGANIZATION_ID].map(
        (organizationId) => ({
          organizationId,
          requestedGeneration: 1n,
          verifiedGeneration: 1n,
          lastVerifiedAt: new Date(),
        }),
      ),
    });
  });

  describe('generateActions — 5 rules', () => {
    it('#1 Rule 1: zero stock + campaign + dailyBudget>0 → change_daily_budget urgent', async () => {
      const { listing, option, listingOption } = await seedListingWithOption({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'B',
        sellableStock: 0,
      });
      await seedSnapshot({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        listingOptionId: listingOption.id,
        optionId: option.id,
        pageType: 'campaign',
        externalId: 'CAMP-ZERO-STOCK',
        campaignName: 'Zero stock campaign',
        dailyBudget: 10000,
      });

      const result = await adActionService.generateActions(TEST_ORGANIZATION_ID);

      expect(result.generated).toBe(1);
      const action = await prisma.adAction.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID },
      });
      expect(action.actionType).toBe('change_daily_budget');
      expect(action.targetType).toBe('campaign');
      expect(action.priority).toBe('urgent');
      expect(action.currentValue).toBe(10000);
      expect(action.proposedValue).toBe(3000);
    });

    it('#2 Rule 1 skip when target row has no listingOptionId (option daily join 불가)', async () => {
      const { listing } = await seedListingWithOption({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'B',
      });
      await seedSnapshot({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        listingOptionId: null,
        optionId: null,
        pageType: 'campaign',
        externalId: 'CAMP-NO-OPTION',
        campaignName: 'No option campaign',
        dailyBudget: 3000,
        roas: 300,
      });

      const result = await adActionService.generateActions(TEST_ORGANIZATION_ID);

      expect(result.generated).toBe(0);
      const count = await prisma.adAction.count({ where: { organizationId: TEST_ORGANIZATION_ID } });
      expect(count).toBe(0);
    });

    it('#3 Rule 2: keyword + spend>=5000 + conversions=0 → pause_keyword urgent', async () => {
      const { listing, option, listingOption } = await seedListingWithOption({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'B',
      });
      await seedSnapshot({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        listingOptionId: listingOption.id,
        optionId: option.id,
        pageType: 'keyword',
        externalId: 'KW-WASTE',
        keyword: 'waste keyword',
        spend: 6000,
        conversions: 0,
      });

      const result = await adActionService.generateActions(TEST_ORGANIZATION_ID);

      expect(result.generated).toBe(1);
      const action = await prisma.adAction.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID },
      });
      expect(action.actionType).toBe('pause_keyword');
      expect(action.targetType).toBe('keyword');
      expect(action.priority).toBe('urgent');
    });

    it('#4 Rule 3: keyword + currentBid>0 + 100<=roas<200 → change_bid to 85% rounded', async () => {
      const { listing, option, listingOption } = await seedListingWithOption({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'B',
      });
      await seedSnapshot({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        listingOptionId: listingOption.id,
        optionId: option.id,
        pageType: 'keyword',
        externalId: 'KW-BID-DOWN',
        keyword: 'bid down',
        currentBid: 1000,
        spend: 1000,
        conversions: 2,
        roas: 150,
      });

      const result = await adActionService.generateActions(TEST_ORGANIZATION_ID);

      expect(result.generated).toBe(1);
      const action = await prisma.adAction.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID },
      });
      expect(action.actionType).toBe('change_bid');
      expect(action.currentValue).toBe(1000);
      expect(action.proposedValue).toBe(850);
    });

    it('#5 Rule 4: A grade + campaign + roas>=480 → budget expand 1.2x', async () => {
      const { listing, option, listingOption } = await seedListingWithOption({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        sellableStock: 100,
      });
      await seedSnapshot({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        listingOptionId: listingOption.id,
        optionId: option.id,
        pageType: 'campaign',
        externalId: 'CAMP-A-EXPAND',
        campaignName: 'A expand',
        dailyBudget: 10000,
        roas: 500,
      });

      const result = await adActionService.generateActions(TEST_ORGANIZATION_ID);

      expect(result.generated).toBe(1);
      const action = await prisma.adAction.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID },
      });
      expect(action.actionType).toBe('change_daily_budget');
      expect(action.currentValue).toBe(10000);
      expect(action.proposedValue).toBe(12000);
      expect(action.priority).toBe('high');
    });

    it('#6 Rule 5: C grade campaign + dailyBudget>3000 → budget shrink to 50% (min 3000)', async () => {
      const { listing, option, listingOption } = await seedListingWithOption({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'C',
        sellableStock: 50,
      });
      await seedSnapshot({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        listingOptionId: listingOption.id,
        optionId: option.id,
        pageType: 'campaign',
        externalId: 'CAMP-C-SHRINK',
        campaignName: 'C shrink',
        dailyBudget: 20000,
        roas: 50,
      });

      const result = await adActionService.generateActions(TEST_ORGANIZATION_ID);

      expect(result.generated).toBe(1);
      const action = await prisma.adAction.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID },
      });
      expect(action.actionType).toBe('change_daily_budget');
      expect(action.currentValue).toBe(20000);
      expect(action.proposedValue).toBe(10000);
    });
  });

  describe('lifecycle + ExecutionTask', () => {
    it('#7 approve → ExecutionTask created (idempotent)', async () => {
      const { listing, option, listingOption } = await seedListingWithOption({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'B',
        sellableStock: 0,
      });
      await seedSnapshot({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        listingOptionId: listingOption.id,
        optionId: option.id,
        pageType: 'campaign',
        externalId: 'CAMP-APPROVE',
        campaignName: 'approve',
        dailyBudget: 5000,
      });
      await adActionService.generateActions(TEST_ORGANIZATION_ID);
      const action = await prisma.adAction.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID },
      });

      await adActionService.approveActions([action.id], TEST_ORGANIZATION_ID);

      const updated = await prisma.adAction.findUniqueOrThrow({ where: { id: action.id } });
      expect(updated.approvalStatus).toBe('approved');
      expect(updated.executeStatus).toBe('queued');
      const tasks = await prisma.executionTask.findMany({ where: { actionId: action.id } });
      expect(tasks).toHaveLength(1);
      expect(tasks[0].status).toBe('queued');

      await adActionService.approveActions([action.id], TEST_ORGANIZATION_ID);
      const tasksAgain = await prisma.executionTask.findMany({ where: { actionId: action.id } });
      expect(tasksAgain).toHaveLength(1);
    });

    it('#8 markRunning → markFailed → resetFailed → re-queued + new ExecutionTask', async () => {
      const { listing, option, listingOption } = await seedListingWithOption({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'B',
        sellableStock: 0,
      });
      await seedSnapshot({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        listingOptionId: listingOption.id,
        optionId: option.id,
        pageType: 'campaign',
        externalId: 'CAMP-RETRY',
        campaignName: 'retry',
        dailyBudget: 5000,
      });
      await adActionService.generateActions(TEST_ORGANIZATION_ID);
      const action = await prisma.adAction.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID },
      });
      await adActionService.approveActions([action.id], TEST_ORGANIZATION_ID);

      await adActionService.markRunning(action.id, { snapshot: 'before' }, TEST_ORGANIZATION_ID);
      let current = await prisma.adAction.findUniqueOrThrow({ where: { id: action.id } });
      expect(current.executeStatus).toBe('running');

      await adActionService.markFailed(action.id, 'timeout', { err: 'boom' }, TEST_ORGANIZATION_ID);
      current = await prisma.adAction.findUniqueOrThrow({ where: { id: action.id } });
      expect(current.executeStatus).toBe('failed');
      expect(current.errorMessage).toBe('timeout');

      await adActionService.resetFailed(TEST_ORGANIZATION_ID);
      current = await prisma.adAction.findUniqueOrThrow({ where: { id: action.id } });
      expect(current.executeStatus).toBe('queued');
      expect(current.errorMessage).toBeNull();

      const tasks = await prisma.executionTask.findMany({
        where: { actionId: action.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(tasks).toHaveLength(2);
      expect(tasks[1].status).toBe('queued');
    });

    it('#9 markDone → executeStatus=done + executedAt set', async () => {
      const { listing, option, listingOption } = await seedListingWithOption({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'B',
        sellableStock: 0,
      });
      await seedSnapshot({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        listingOptionId: listingOption.id,
        optionId: option.id,
        pageType: 'campaign',
        externalId: 'CAMP-DONE',
        campaignName: 'done',
        dailyBudget: 5000,
      });
      await adActionService.generateActions(TEST_ORGANIZATION_ID);
      const action = await prisma.adAction.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID },
      });
      await adActionService.approveActions([action.id], TEST_ORGANIZATION_ID);
      await adActionService.markRunning(action.id, undefined, TEST_ORGANIZATION_ID);

      await adActionService.markDone(action.id, { after: 'ok' }, TEST_ORGANIZATION_ID);

      const current = await prisma.adAction.findUniqueOrThrow({ where: { id: action.id } });
      expect(current.executeStatus).toBe('done');
      expect(current.executedAt).not.toBeNull();
    });

    it('#10 reject → approvalStatus=rejected + open tasks cancelled', async () => {
      const { listing, option, listingOption } = await seedListingWithOption({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'B',
        sellableStock: 0,
      });
      await seedSnapshot({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        listingOptionId: listingOption.id,
        optionId: option.id,
        pageType: 'campaign',
        externalId: 'CAMP-REJECT',
        campaignName: 'reject',
        dailyBudget: 5000,
      });
      await adActionService.generateActions(TEST_ORGANIZATION_ID);
      const action = await prisma.adAction.findFirstOrThrow({
        where: { organizationId: TEST_ORGANIZATION_ID },
      });
      await adActionService.approveActions([action.id], TEST_ORGANIZATION_ID);

      await adActionService.rejectActions([action.id], TEST_ORGANIZATION_ID);

      const current = await prisma.adAction.findUniqueOrThrow({ where: { id: action.id } });
      expect(current.approvalStatus).toBe('rejected');
      const tasks = await prisma.executionTask.findMany({ where: { actionId: action.id } });
      expect(tasks.every((t) => t.status === 'cancelled')).toBe(true);
    });
  });

  describe('cross-tenant + IDOR', () => {
    it('#11 generateActions scopes to organizationId — other organization snapshot ignored', async () => {
      const mine = await seedListingWithOption({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'B',
        sellableStock: 0,
      });
      await seedSnapshot({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: mine.listing.id,
        listingOptionId: mine.listingOption.id,
        optionId: mine.option.id,
        pageType: 'campaign',
        externalId: 'MINE-CAMP',
        campaignName: 'mine',
        dailyBudget: 5000,
      });

      const other = await seedListingWithOption({
        organizationId: OTHER_ORGANIZATION_ID,
        abcGrade: 'B',
        sellableStock: 0,
        externalIdSuffix: '-other',
      });
      await seedSnapshot({
        organizationId: OTHER_ORGANIZATION_ID,
        listingId: other.listing.id,
        listingOptionId: other.listingOption.id,
        optionId: other.option.id,
        pageType: 'campaign',
        externalId: 'OTHER-CAMP',
        campaignName: 'other',
        dailyBudget: 9000,
      });

      const result = await adActionService.generateActions(TEST_ORGANIZATION_ID);

      expect(result.generated).toBe(1);
      const mineCount = await prisma.adAction.count({ where: { organizationId: TEST_ORGANIZATION_ID } });
      const otherCount = await prisma.adAction.count({ where: { organizationId: OTHER_ORGANIZATION_ID } });
      expect(mineCount).toBe(1);
      expect(otherCount).toBe(0);
    });

    it('#12 composite tenant FK rejects cross-tenant listing references', async () => {
      const local = await seedListingWithOption({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
      });
      const foreign = await seedListingWithOption({
        organizationId: OTHER_ORGANIZATION_ID,
        abcGrade: 'A',
      });
      await expect(
        seedSnapshot({
          organizationId: TEST_ORGANIZATION_ID,
          channelAccountId: local.listing.channelAccountId,
          listingId: foreign.listing.id,
          listingOptionId: foreign.listingOption.id,
          optionId: foreign.option.id,
          pageType: 'keyword',
          externalId: 'CORRUPT-KW',
          keyword: 'corrupt keyword',
          spend: 6000,
          conversions: 0,
        }),
      ).rejects.toThrow(/foreign key/i);
    });

    it('#13 markRunning on another tenant id → NotFoundException', async () => {
      const other = await seedListingWithOption({
        organizationId: OTHER_ORGANIZATION_ID,
        abcGrade: 'B',
        sellableStock: 0,
      });
      await seedSnapshot({
        organizationId: OTHER_ORGANIZATION_ID,
        listingId: other.listing.id,
        listingOptionId: other.listingOption.id,
        optionId: other.option.id,
        pageType: 'campaign',
        externalId: 'OTHER-ONLY',
        campaignName: 'other only',
        dailyBudget: 5000,
      });
      await adActionService.generateActions(OTHER_ORGANIZATION_ID);
      const foreignAction = await prisma.adAction.findFirstOrThrow({
        where: { organizationId: OTHER_ORGANIZATION_ID },
      });

      await expect(
        adActionService.markRunning(foreignAction.id, undefined, TEST_ORGANIZATION_ID),
      ).rejects.toThrow(/not found/i);

      const foreignAfter = await prisma.adAction.findUniqueOrThrow({ where: { id: foreignAction.id } });
      expect(foreignAfter.executeStatus).toBe('queued');
    });
  });
});
