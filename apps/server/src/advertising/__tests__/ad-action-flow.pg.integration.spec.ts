import { randomUUID } from 'node:crypto';
import { AdLedgerReadPersistenceAdapter } from '../adapter/out/persistence/ad-ledger-read.repository';
import { profitCatalogTestReaders } from '../../test-helpers/channel-fact-ports';
import { channelFactTestPorts } from '../../test-helpers/channel-fact-ports';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AdvertisingModule } from '../advertising.module';
import { AdActionRepositoryAdapter } from '../adapter/out/persistence/ad-action.repository';
import { AdListingRepositoryAdapter } from '../adapter/out/persistence/ad-listing.repository';
import { AdActionService } from '../application/service/ad-action.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';
import type { PrismaClient } from '@prisma/client';
import { seedPublishedProductAbcGrades } from '../../products/__tests__/test-helpers/published-product-abc';
import { seedSourceProduct } from '../../test-helpers/inventory-seeds';
import { measuredRunCovering } from '../../test-helpers/__tests__/ad-ledger-listing-seeds';
import { seedAdReportRun } from '../../test-helpers/ad-ledger-seeds';

describe('AdAction flow (PG integration)', () => {
  let prisma: PrismaClient;
  let adActionService: AdActionService;

  async function seedListingWithOption(params: {
    organizationId: string;
    abcGrade?: string | null;
    sellableStock?: number | null;
    costPrice?: number | null;
    sellPrice?: number | null;
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
    // 카탈로그 리스팅은 실행이 쓴 행만 게시된 것이다(KID-365).
    const catalogOperationId = randomUUID();
    const master = await seedSourceProduct(prisma, {
      organizationId: params.organizationId,
      code: `SP-${unique}`,
      name: `Master ${unique}`,
      currentStock: params.sellableStock ?? 0,
      purchasePrice: params.costPrice ?? null,
    });
    if (params.abcGrade === 'A' || params.abcGrade === 'B' || params.abcGrade === 'C') {
      await seedPublishedProductAbcGrades(prisma, {
        organizationId: params.organizationId,
        grades: [{ masterProductId: master.id, abcGrade: params.abcGrade }],
      });
    }
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: params.organizationId,
        channelAccountId: channelAccount.id,
        externalId: `EXT-${unique}${params.externalIdSuffix ?? ''}`,
        lastOperationId: catalogOperationId,
      },
    });
    const listingOption = await prisma.channelListingOption.create({
      data: {
        organizationId: params.organizationId,
        listingId: listing.id,
        externalOptionId: `VID-${unique}`,
        salePrice: params.sellPrice ?? null,
        lastOperationId: catalogOperationId,
        isActive: true,
      },
    });
    await prisma.channelListingOptionInventoryComponent.create({
      data: {
        organizationId: params.organizationId,
        channelListingOptionId: listingOption.id,
        masterProductId: master.id,
        quantity: 1,
      },
    });
    const option = listingOption;
    return { master, option, listing, listingOption };
  }

  /**
   * One ad report target of today's KST date in the ad report ledger (KID-372),
   * under a succeeded `advertising.ad_report` run covering the day. A campaign
   * is its `ChannelAdCampaign` row (budget, ON/OFF) plus one product row of the
   * advertised option; a keyword is a keyword-table row plus a zero product row
   * that ties its option to the listing.
   */
  async function seedSnapshot(params: {
    organizationId: string;
    channelAccountId?: string;
    listingId: string;
    listingOptionId?: string | null;
    optionId?: string | null;
    pageType: 'campaign' | 'keyword';
    externalId: string;
    campaignName?: string;
    keyword?: string;
    status?: string;
    dailyBudget?: number | null;
    impressions?: number;
    clicks?: number;
    conversions?: number;
    spend?: number;
    revenue?: number;
    /** Derive revenue from spend so `recomputeRoas(revenue, spend)` returns this value. */
    roas?: number;
  }) {
    const date = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const day = new Date(`${date}T00:00:00.000Z`);
    const channelAccountId = params.channelAccountId ?? (
      await prisma.channelListing.findFirstOrThrow({
        where: { id: params.listingId, organizationId: params.organizationId },
        select: { channelAccountId: true },
      })
    ).channelAccountId;
    const operationId = await measuredRunCovering(prisma, params.organizationId, channelAccountId, date);
    const vendorItemId = params.listingOptionId
      ? (await prisma.channelListingOption.findUniqueOrThrow({
          where: { id: params.listingOptionId },
          select: { externalOptionId: true },
        })).externalOptionId
      : `VI-${params.externalId}`;
    const spend = params.spend ?? (params.roas != null && params.revenue == null ? 1000 : 0);
    const revenue = params.revenue ?? (params.roas != null && spend > 0 ? Math.round((params.roas / 100) * spend) : 0);
    const orders = params.conversions ?? 0;
    const campaignId = params.pageType === 'campaign' ? params.externalId : `KW-CAMPAIGN-${params.externalId}`;
    const product = {
      organizationId: params.organizationId, channelAccountId, operationId, date: day, campaignId,
      adGroupId: 'G1', vendorItemId, listingId: params.listingId,
    };
    if (params.pageType === 'campaign') {
      await prisma.channelAdCampaign.create({
        data: {
          organizationId: params.organizationId, channelAccountId, operationId, campaignId,
          name: params.campaignName ?? 'C',
          isActive: !(params.status ?? '').toLowerCase().includes('off'),
          budget: params.dailyBudget ?? null,
          lastSeenAt: new Date(),
        },
      });
      await prisma.channelAdProductDailySnapshot.create({
        data: {
          ...product, impressions: params.impressions ?? 0, clicks: params.clicks ?? 0,
          spend, billedSpend: spend, revenue, orders, units: orders,
        },
      });
      return;
    }
    await prisma.channelAdProductDailySnapshot.create({
      data: { ...product, impressions: 0, clicks: 0, spend: 0, billedSpend: 0, revenue: 0, orders: 0, units: 0 },
    });
    await prisma.channelAdKeywordDailySnapshot.create({
      data: {
        organizationId: params.organizationId, channelAccountId, operationId, date: day, campaignId,
        adGroupId: 'G1', vendorItemId, keyword: params.keyword ?? params.externalId,
        impressions: params.impressions ?? 0, clicks: params.clicks ?? 1, spend, revenue, orders, units: orders,
      },
    });
  }

  /**
   * A proposal awaiting review. The lifecycle cases use campaign registration,
   * the one action type the browser extension still executes (KID-138
   * decision A); the others are applied by hand in the ad center.
   */
  async function seedPendingAction(
    targetLabel: string,
    organizationId = TEST_ORGANIZATION_ID,
    actionType = 'create_campaign',
  ) {
    const numeric = actionType === 'change_bid' || actionType === 'change_daily_budget';
    return prisma.adAction.create({
      data: {
        organizationId,
        actionType,
        targetType:
          actionType === 'pause_keyword' || actionType === 'change_bid' ? 'keyword' : 'campaign',
        targetLabel,
        reason: targetLabel + ' 제안',
        priority: 'high',
        currentValue: numeric ? 5000 : null,
        proposedValue: numeric ? 3000 : null,
      },
      select: { id: true },
    });
  }

  async function reviewItem(actionId: string) {
    const { items } = await adActionService.getActions({ limit: 200 }, TEST_ORGANIZATION_ID);
    const item = items.find((candidate) => candidate.id === actionId);
    if (!item) throw new Error('action missing from the review list: ' + actionId);
    return item;
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
    vi.useRealTimers();
    await resetDb(prisma);
    await seedBaseFixture(prisma);
    for (const organizationId of [TEST_ORGANIZATION_ID, OTHER_ORGANIZATION_ID]) {
      const verifiedAt = new Date();
      const inventoryRun = await prisma.sourceImportRun.create({
        data: {
          organizationId,
          sourceType: 'sellpia_inventory',
          channelAccountId: null,
          fileName: 'advertising-action-inventory.json',
          fileHash: `advertising-action-inventory-${organizationId}`,
          status: 'completed',
          rowCount: 0,
          importedAt: verifiedAt,
          lastVerifiedAt: verifiedAt,
          verificationCount: 1,
          freshnessGeneration: 1n,
        },
      });
      await prisma.sellpiaInventoryState.create({
        data: {
          organizationId,
          requestedGeneration: 1n,
          verifiedGeneration: 1n,
          lastVerifiedAt: verifiedAt,
          lastCompletedOperationId: inventoryRun.id,
        },
      });
    }
  });

  describe('generateActions over the ad report ledger (KID-372)', () => {
    it('#1 Rule 1: every advertised option sold out + campaign budget>0 (KRW/day assumed) → change_daily_budget urgent', async () => {
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

    it('#2 Rule 1 skip when the advertised option has no catalog capacity', async () => {
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

    it('#3 Rule 2: keyword + spend>=5000 + zero orders → pause_keyword urgent with the ad report evidence', async () => {
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
      expect(action.listingId).toBe(listing.id);
      expect(action.externalId).toBe(listingOption.externalOptionId);
      expect(action.payload).toMatchObject({
        adTarget: {
          campaignId: 'KW-CAMPAIGN-KW-WASTE',
          adGroupId: 'G1',
          vendorItemId: listingOption.externalOptionId,
          keyword: 'waste keyword',
          source: 'ad_report',
        },
      });
    });

    it('#5 Rule 3: A grade + campaign + roas>=480 → budget expand 1.2x', async () => {
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

    it('#6 Rule 4: C grade campaign + budget>3000 → budget shrink to 50% (min 3000)', async () => {
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
    it('#6b does not propose pausing a keyword again while a pause of it stands approved, until the operator closes it', async () => {
      const { listing, option, listingOption } = await seedListingWithOption({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'B',
      });
      const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const windowStart = new Date(Date.parse(`${today}T00:00:00.000Z`) - 13 * 86_400_000).toISOString().slice(0, 10);
      await seedAdReportRun(prisma, {
        organizationId: TEST_ORGANIZATION_ID, channelAccountId: listing.channelAccountId, start: windowStart, end: today,
      });
      await seedSnapshot({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.id,
        listingOptionId: listingOption.id,
        optionId: option.id,
        pageType: 'keyword',
        externalId: 'KW-APPLIED',
        keyword: 'applied keyword',
        spend: 6000,
        conversions: 0,
      });
      await expect(adActionService.generateActions(TEST_ORGANIZATION_ID)).resolves.toMatchObject({ generated: 1 });
      const pause = await prisma.adAction.findFirstOrThrow({ where: { organizationId: TEST_ORGANIZATION_ID } });
      await adActionService.approveActions([pause.id], TEST_ORGANIZATION_ID);
      // The operator paused it in the ad center; the approval stands for the window's rows.
      const backdate = (days: number) => prisma.adAction.update({
        where: { id: pause.id },
        data: { createdAt: new Date(Date.now() - days * 86_400_000) },
      });

      // Past the 24-hour dedup, but inside the window whose rows still show the keyword's clicks.
      await backdate(3);
      await expect(adActionService.generateActions(TEST_ORGANIZATION_ID)).resolves.toMatchObject({ generated: 0 });

      // Older than the window's first measured day, the approved pause is still open work until the
      // operator closes it (a keyword pause is applied by hand, KID-138 decision A).
      await backdate(20);
      await expect(adActionService.generateActions(TEST_ORGANIZATION_ID)).resolves.toMatchObject({ generated: 0 });
      await adActionService.rejectActions([pause.id], TEST_ORGANIZATION_ID);
      await expect(adActionService.generateActions(TEST_ORGANIZATION_ID)).resolves.toMatchObject({ generated: 1 });
    });
  });

  describe('reviews that name the review they expect (KID-138 review)', () => {
    const keywordPause = (label: string) =>
      seedPendingAction(label, TEST_ORGANIZATION_ID, 'pause_keyword');

    it('#20 a bulk rejection of proposals awaiting review skips one another operator approved meanwhile', async () => {
      const pending = await keywordPause('KW-PENDING');
      const confirmed = await keywordPause('KW-CONFIRMED');
      // Another operator confirms a proposal after this operator's list was read.
      await adActionService.approveActions([confirmed.id], TEST_ORGANIZATION_ID);

      await expect(
        adActionService.rejectActions([pending.id, confirmed.id], TEST_ORGANIZATION_ID, {
          expectedApprovalStatus: 'pending_review',
        }),
      ).resolves.toEqual({ updated: 1 });

      expect(await reviewItem(pending.id)).toMatchObject({ approvalStatus: 'rejected' });
      // A keyword pause is applied by hand, so its approval prepares no run (KID-386).
      expect(await reviewItem(confirmed.id)).toMatchObject({
        approvalStatus: 'approved',
        executeStatus: 'not_prepared',
        errorMessage: null,
      });
    });

    it('#21 an approval of proposals awaiting review skips a rejected one and one already approved', async () => {
      const pending = await keywordPause('KW-PENDING');
      const closed = await keywordPause('KW-CLOSED');
      await adActionService.rejectActions([closed.id], TEST_ORGANIZATION_ID);
      const confirmed = await keywordPause('KW-CONFIRMED');
      await adActionService.approveActions([confirmed.id], TEST_ORGANIZATION_ID);

      await expect(
        adActionService.approveActions([pending.id, closed.id, confirmed.id], TEST_ORGANIZATION_ID, {
          expectedApprovalStatus: 'pending_review',
        }),
      ).resolves.toEqual({ updated: 1 });

      expect(await reviewItem(pending.id)).toMatchObject({
        approvalStatus: 'approved',
        executeStatus: 'not_prepared',
      });
      expect(await reviewItem(closed.id)).toMatchObject({ approvalStatus: 'rejected' });
      expect(await prisma.operation.count()).toBe(0);
    });

    it('#22 closing approved proposals skips one still awaiting review', async () => {
      const pending = await keywordPause('KW-PENDING');
      const confirmed = await keywordPause('KW-CONFIRMED');
      await adActionService.approveActions([confirmed.id], TEST_ORGANIZATION_ID);

      await expect(
        adActionService.rejectActions([pending.id, confirmed.id], TEST_ORGANIZATION_ID, {
          expectedApprovalStatus: 'approved',
        }),
      ).resolves.toEqual({ updated: 1 });

      expect(await reviewItem(confirmed.id)).toMatchObject({
        approvalStatus: 'rejected',
        executeStatus: 'not_prepared',
      });
      expect(await reviewItem(pending.id)).toMatchObject({
        approvalStatus: 'pending_review',
        operationId: null,
      });
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

    it('#12 a snapshot naming another organization listing never carries that listing into an action — listing facts are read inside the organization (ADR-0013: no cross-owner FK)', async () => {
      const local = await seedListingWithOption({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
      });
      const foreign = await seedListingWithOption({
        organizationId: OTHER_ORGANIZATION_ID,
        abcGrade: 'A',
        externalIdSuffix: '-foreign',
      });
      // 광고 표는 Channels 리스팅을 외래키 없이 id 로만 가리킨다. 섞인 id 가 들어와도 광고 owner 는 조직 안의
      // 리스팅 · 옵션 사실만 이어 붙이므로, 키워드 규칙이 만든 액션에는 남의 리스팅이 실리지 않는다.
      await seedSnapshot({
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
      });

      const result = await adActionService.generateActions(TEST_ORGANIZATION_ID);

      expect(result.generated).toBe(1);
      const actions = await prisma.adAction.findMany({ select: { organizationId: true, listingId: true } });
      expect(actions).toEqual([{ organizationId: TEST_ORGANIZATION_ID, listingId: null }]);
    });

    it('#14 approve and reject answer how many distinct actions of the organization they found (KID-212)', async () => {
      const first = await seedPendingAction('CAMP-COUNT-1', TEST_ORGANIZATION_ID, 'change_daily_budget');
      const second = await seedPendingAction('CAMP-COUNT-2', TEST_ORGANIZATION_ID, 'change_daily_budget');
      const foreign = await seedPendingAction('CAMP-COUNT-FOREIGN', OTHER_ORGANIZATION_ID, 'change_daily_budget');
      const unknownId = '00000000-0000-4000-8000-00000000abcd';
      // A duplicate id, another organization's action and an id no action has.
      const requested = [first.id, second.id, first.id, foreign.id, unknownId];

      await expect(adActionService.approveActions(requested, TEST_ORGANIZATION_ID))
        .resolves.toEqual({ updated: 2 });
      await expect(adActionService.rejectActions(requested, TEST_ORGANIZATION_ID))
        .resolves.toEqual({ updated: 2 });
      await expect(adActionService.approveActions([foreign.id, unknownId], TEST_ORGANIZATION_ID))
        .resolves.toEqual({ updated: 0 });
      await expect(adActionService.rejectActions([foreign.id, unknownId], TEST_ORGANIZATION_ID))
        .resolves.toEqual({ updated: 0 });

      expect(await prisma.adAction.findUniqueOrThrow({ where: { id: foreign.id } }))
        .toMatchObject({ approvalStatus: 'pending_review' });
      expect(await prisma.operation.count()).toBe(0);
    });
  });
});
