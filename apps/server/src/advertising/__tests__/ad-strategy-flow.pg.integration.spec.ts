import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { Test } from '@nestjs/testing';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { NotFoundException, ConflictException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { AdvertisingModule } from '../advertising.module';
import { AdStrategyService } from '../application/service/ad-strategy.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_ORGANIZATION_ID,
  OTHER_ORGANIZATION_ID,
} from '../../test-helpers/real-prisma';

describe('AdStrategy flow (PG integration)', () => {
  let prisma: PrismaClient;
  let service: AdStrategyService;

  async function seedOrderWithLineItems(
    client: PrismaClient,
    opts: {
      organizationId: string;
      externalOrderId: string;
      orderedAt: string;
      shippingPrice: number;
      lineItems: Array<{
        quantity: number;
        totalPrice: number;
        listingOptionId: string;
        optionId?: string;
      }>;
    },
  ) {
    const account = await client.channelAccount.findFirstOrThrow({
      where: {
        organizationId: opts.organizationId,
        channel: 'coupang',
        status: 'active',
      },
      orderBy: { isPrimary: 'desc' },
    });
    const order = await client.order.create({
      data: {
        organizationId: opts.organizationId,
        channelAccountId: account.id,
        externalOrderId: opts.externalOrderId,
        orderedAt: new Date(opts.orderedAt),
        status: 'accepted',
        shippingPrice: opts.shippingPrice,
        totalPrice: opts.lineItems.reduce(
          (sum, item) => sum + item.totalPrice,
          0,
        ),
      },
    });
    await client.orderLineItem.createMany({
      data: opts.lineItems.map((item, index) => ({
        organizationId: opts.organizationId,
        orderId: order.id,
        listingOptionId: item.listingOptionId,
        productName: `Product ${index + 1}`,
        quantity: item.quantity,
        unitPrice: Math.round(item.totalPrice / item.quantity),
        totalPrice: item.totalPrice,
        externalLineId: `${opts.externalOrderId}-${index + 1}`,
      })),
    });
    return order;
  }

  async function seedGradedListing(params: {
    organizationId: string;
    abcGrade: 'A' | 'B' | 'C';
    adTier?: string | null;
    healthScore?: number | null;
    sellableStock?: number | null;
    costPrice?: number | null;
    sellPrice?: number | null;
    commissionRate?: number | null;
    shippingCost?: number | null;
    suffix: string;
  }) {
    const channelAccount =
      (await prisma.channelAccount.findFirst({
        where: {
          organizationId: params.organizationId,
          channel: 'coupang',
          externalAccountId: 'advertising-strategy-pg',
        },
      })) ??
      (await prisma.channelAccount.create({
        data: {
          organizationId: params.organizationId,
          channel: 'coupang',
          name: 'Advertising Strategy PG Coupang',
          externalAccountId: 'advertising-strategy-pg',
          isPrimary: true,
        },
      }));
    const importRun = await prisma.sourceImportRun.create({
      data: {
        organizationId: params.organizationId,
        sourceType: 'coupang_wing_catalog',
        channelAccountId: channelAccount.id,
        fileName: 'advertising-strategy-pg.xlsx',
        fileHash: `advertising-strategy-pg-${params.suffix}`,
        status: 'completed',
        rowCount: 1,
        importedAt: new Date(),
      },
    });
    const sellableStock = params.sellableStock ?? 100;
    const master = await prisma.masterProduct.create({
      data: {
        organizationId: params.organizationId,
        code: `M-${params.suffix}`,
        name: `Master ${params.suffix}`,
        abcGrade: params.abcGrade,
        adTier: params.adTier ?? null,
        healthScore: params.healthScore ?? null,
      },
    });
    const inventorySku = await prisma.sellpiaInventorySku.create({
      data: {
        organizationId: params.organizationId,
        code: `SP-${params.suffix}`,
        name: `Sellpia ${params.suffix}`,
        currentStock: sellableStock,
        purchasePrice: params.costPrice ?? 5000,
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        organizationId: params.organizationId,
        masterProductId: master.id,
        code: `VAR-${params.suffix}`,
        name: `Variant ${params.suffix}`,
        isDefault: true,
      },
    });
    await prisma.productVariantComponent.create({
      data: {
        organizationId: params.organizationId,
        productVariantId: variant.id,
        sellpiaInventorySkuId: inventorySku.id,
        quantity: 1,
        source: 'manual',
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        organizationId: params.organizationId,
        channelAccountId: channelAccount.id,
        masterProductId: master.id,
        externalId: `EXT-${params.suffix}`,
        channelName: `Channel ${params.suffix}`,
        lastImportRunId: importRun.id,
      },
    });
    const listingOption = await prisma.channelListingOption.create({
      data: {
        organizationId: params.organizationId,
        listingId: listing.id,
        productVariantId: variant.id,
        externalOptionId: `VI-${params.suffix}`,
        salePrice: params.sellPrice ?? 20000,
        costPriceOverride: params.costPrice ?? 5000,
        commissionRate: params.commissionRate ?? 0.1,
        shippingCost: params.shippingCost ?? 2500,
        lastImportRunId: importRun.id,
        isActive: true,
      },
    });
    const option = listingOption;
    return { master, option, listing, listingOption };
  }

  /**
   * H3 — strategy reads now aggregate `ChannelListingDailySnapshot.adSpend /
   * adRevenue / adClicks / adImpressions / adConversions` over the period
   * window. Seed the daily-fact table directly. `optionId` is no longer
   * material to the strategy aggregate but is kept on the param shape so
   * call-sites need not change.
   */
  async function seedAd(params: {
    organizationId: string;
    listingId: string;
    optionId?: string | null;
    externalId?: string;
    daysAgo?: number;
    spend: number;
    revenue: number;
    clicks?: number;
    impressions?: number;
    conversions?: number;
  }) {
    const date = new Date();
    date.setDate(date.getDate() - (params.daysAgo ?? 0));
    date.setHours(0, 0, 0, 0);
    // Pull the listing's externalId so daily-fact has a stable canonical
    // identifier when the caller doesn't pass one.
    const listing = await prisma.channelListing.findUniqueOrThrow({
      where: { id: params.listingId },
      select: { externalId: true },
    });
    return prisma.channelListingDailySnapshot.create({
      data: {
        organizationId: params.organizationId,
        listingId: params.listingId,
        channel: 'coupang',
        externalId: params.externalId ?? listing.externalId,
        businessDate: date,
        adSpend: params.spend,
        adRevenue: params.revenue,
        adClicks: params.clicks ?? 0,
        adImpressions: params.impressions ?? 0,
        adConversions: params.conversions ?? 0,
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
    service = m.get(AdStrategyService);
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

  describe('getRules / getWeeklyPlan — 3-grade listing scenario', () => {
    it('#1 A 등급 ROAS 480+ → recommendations 에 포함 + summary 집계', async () => {
      const a = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        adTier: '1차',
        healthScore: 80,
        costPrice: 10_000,
        suffix: 'A-EXPAND',
      });
      await seedOrderWithLineItems(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'ORD-A-EXPAND',
        orderedAt: new Date().toISOString(),
        shippingPrice: 2_000,
        lineItems: [
          {
            quantity: 1,
            totalPrice: 20_000,
            optionId: a.option.id,
            listingOptionId: a.listingOption.id,
          },
        ],
      });
      await seedAd({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: a.listing.id,
        optionId: a.option.id,
        spend: 2_000,
        revenue: 10_000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });

      const rules = await service.getRules('14d', TEST_ORGANIZATION_ID);

      expect(rules.recommendations.length).toBeGreaterThanOrEqual(1);
      const aAction = rules.recommendations.find((row) => row.listing.listingId === a.listing.id);
      expect(aAction?.grade).toBe('A');
      expect(aAction?.priority).toBe('high');
      expect(aAction?.proposedValue).toBe(20);
      expect(rules.summary.totalActions).toBe(rules.recommendations.length);
      expect(rules.summary.urgentCount).toBe(
        rules.recommendations.filter((r) => r.priority === 'urgent').length,
      );
    });

    it('#2 3-grade listing 동시 평가 + priority 정렬', async () => {
      const a = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        adTier: '1차',
        suffix: 'A-GOOD',
      });
      const b = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'B',
        suffix: 'B-OK',
      });
      const c = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'C',
        sellableStock: 0,
        adTier: '2차',
        suffix: 'C-URGENT',
      });

      // A: 공격 확장 (high)
      await seedAd({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: a.listing.id,
        optionId: a.option.id,
        spend: 10000,
        revenue: 60000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });
      // B: 유지 (low)
      await seedAd({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: b.listing.id,
        optionId: b.option.id,
        spend: 10000,
        revenue: 35000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });
      // C: 재고 0 + 광고 ON → 긴급
      await seedAd({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: c.listing.id,
        optionId: c.option.id,
        spend: 10000,
        revenue: 50000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });

      const plan = await service.getWeeklyPlan('14d', TEST_ORGANIZATION_ID);

      expect(plan.actions.length).toBe(3);
      // priority 정렬: urgent 먼저
      expect(plan.actions[0].priority).toBe('urgent');
      expect(plan.actions[0].grade).toBe('C');
      expect(plan.week.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(plan.week.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('#3 getWeeklyPlan 의 issues + tierAnalysis + top20 shape', async () => {
      const a = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        adTier: '1차',
        costPrice: 10_000,
        suffix: 'A-TOP',
      });

      // 14일 내 Ad history → adIssues 포착 (highSpend)
      for (let i = 0; i < 10; i++) {
        await seedAd({
          organizationId: TEST_ORGANIZATION_ID,
          listingId: a.listing.id,
          optionId: a.option.id,
          daysAgo: i,
          spend: 15000,
          revenue: 30000,
          clicks: 50,
          impressions: 5000,
          conversions: 5,
        });
      }
      await seedOrderWithLineItems(prisma, {
        organizationId: TEST_ORGANIZATION_ID,
        externalOrderId: 'ORD-A-TOP',
        orderedAt: new Date().toISOString(),
        shippingPrice: 2_000,
        lineItems: [
          {
            quantity: 1,
            totalPrice: 20_000,
            optionId: a.option.id,
            listingOptionId: a.listingOption.id,
          },
        ],
      });

      const plan = await service.getWeeklyPlan('14d', TEST_ORGANIZATION_ID);

      // Issues shape
      expect(plan.issues).toHaveProperty('zeroConversion');
      expect(plan.issues).toHaveProperty('lowRoas');
      expect(plan.issues).toHaveProperty('highSpend');
      // highSpend 배열에 포함 (spend 15000 * 10 = 150000 > 10000)
      expect(plan.issues.highSpend.length).toBeGreaterThanOrEqual(1);
      expect(plan.issues.highSpend[0].listing.listingId).toBe(a.listing.id);

      // tierAnalysis: '1차' 등장
      const tierRow = plan.tierAnalysis.find((t) => t.tier === '1차');
      expect(tierRow).toBeDefined();
      expect(tierRow?.count).toBe(1);

      // top20: listing 포함 + rank=1
      expect(plan.top20.length).toBe(1);
      expect(plan.top20[0].rank).toBe(1);
      expect(plan.top20[0].listing.listingId).toBe(a.listing.id);
    });
  });

  describe('getRecommendations', () => {
    it('#4 urgent/high 만 필터링, 20개 limit', async () => {
      // urgent 1건 + high 2건 + low 1건 seed
      const c = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'C',
        sellableStock: 0,
        adTier: '3차',
        suffix: 'C-URGENT',
      });
      const a = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        suffix: 'A-HIGH',
      });
      const b = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'B',
        suffix: 'B-LOW',
      });

      // urgent: 재고 0
      await seedAd({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: c.listing.id,
        optionId: c.option.id,
        spend: 5000,
        revenue: 5000,
        clicks: 50,
        impressions: 5000,
      });
      // A-1 high: ROAS 500
      await seedAd({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: a.listing.id,
        optionId: a.option.id,
        spend: 10000,
        revenue: 60000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });
      // B-3 low: ROAS 310
      await seedAd({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: b.listing.id,
        optionId: b.option.id,
        spend: 10000,
        revenue: 31000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });

      const recs = await service.getRecommendations(TEST_ORGANIZATION_ID);

      expect(recs.length).toBeLessThanOrEqual(20);
      // low 는 제외
      for (const r of recs) {
        expect(['urgent', 'high']).toContain(r.priority);
      }
      // urgent 가 먼저 (calcActions priority sort)
      if (recs.length >= 2) {
        expect(recs[0].priority === 'urgent' || recs[0].priority === 'high').toBe(true);
      }
      // recommendation shape
      expect(recs[0]).toHaveProperty('listing');
      expect(recs[0]).toHaveProperty('title');
      expect(recs[0]).toHaveProperty('body');
    });
  });

  describe('getExposureAnalysis', () => {
    it('#5 점수 집계 + factor shape', async () => {
      const listing = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        adTier: '1차',
        healthScore: 80,
        costPrice: 5000,
        sellPrice: 20000,
        commissionRate: 0.1,
        shippingCost: 2500,
        suffix: 'EXP-A',
      });

      await seedAd({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: listing.listing.id,
        optionId: listing.option.id,
        spend: 10000,
        revenue: 60000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });

      // Review seed (listingId 필수)
      await prisma.review.createMany({
        data: Array.from({ length: 25 }, (_, i) => ({
          organizationId: TEST_ORGANIZATION_ID,
          listingId: listing.listing.id,
          platform: 'coupang',
          rating: 5,
          reviewedAt: new Date(Date.now() - i * 24 * 3600 * 1000),
        })),
      });

      // H3 — Traffic metrics now live on the same `ChannelListingDailySnapshot`
      // row. Update the daily-fact created by `seedAd` (same listing + today)
      // to add `trafficRevenue / trafficOrders / trafficVisitors / trafficViews`.
      const todayUpdate = new Date();
      todayUpdate.setHours(0, 0, 0, 0);
      await prisma.channelListingDailySnapshot.update({
        where: {
          organizationId_listingId_businessDate: {
            organizationId: TEST_ORGANIZATION_ID,
            listingId: listing.listing.id,
            businessDate: todayUpdate,
          },
        },
        data: {
          trafficRevenue: 500000,
          trafficOrders: 30,
          trafficVisitors: 1000,
          trafficViews: 3000,
        },
      });

      const result = await service.getExposureAnalysis(TEST_ORGANIZATION_ID);

      expect(result.scores.length).toBe(1);
      const score = result.scores[0];
      expect(score.listing.listingId).toBe(listing.listing.id);
      expect(score.grade).toBe('A');
      expect(score.factors).toHaveLength(5);
      // factor keys
      const factorKeys = score.factors.map((f) => f.factor).sort();
      expect(factorKeys).toEqual(['ad', 'fulfillment', 'info', 'review', 'sales']);
      // weight 합 1.0
      const weightSum = score.factors.reduce((s, f) => s + f.weight, 0);
      expect(weightSum).toBeCloseTo(1.0, 2);
      expect(score.totalScore).toBeGreaterThan(0);
      expect(score.totalScore).toBeLessThanOrEqual(100);
    });

    it('#6 urgentActions: factor score <30 listing 만 추출', async () => {
      // 점수 낮은 listing: 리뷰 0, 광고 있으나 ROAS 낮음
      const weak = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'C',
        healthScore: 10,
        sellableStock: 0,
        costPrice: 10000,
        sellPrice: 12000,
        commissionRate: 0.1,
        shippingCost: 3000,
        suffix: 'EXP-WEAK',
      });

      await seedAd({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: weak.listing.id,
        optionId: weak.option.id,
        spend: 100000,
        revenue: 10000,
        clicks: 500,
        impressions: 100000,
        conversions: 2,
      });

      const result = await service.getExposureAnalysis(TEST_ORGANIZATION_ID);

      expect(result.urgentActions.length).toBeGreaterThanOrEqual(1);
      const urgent = result.urgentActions.find(
        (u) => u.listing.listingId === weak.listing.id,
      );
      expect(urgent).toBeDefined();
      expect(urgent?.suggestedAction).toBeTruthy();
    });
  });

  describe('registerCampaign — IDOR + duplicate guard', () => {
    it('#7 존재하지 않는 listingId → NotFoundException', async () => {
      const fakeListingId = '99999999-9999-4999-8999-999999999999';

      await expect(
        service.registerCampaign(
          {
            campaignName: 'Test campaign',
            adGroupName: 'ag',
            grade: 'A',
            dailyBudget: 10000,
            operationMode: 'manual',
            listings: [{ listingId: fakeListingId }],
          },
          TEST_ORGANIZATION_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('#8 cross-tenant listingId → NotFoundException (IDOR guard)', async () => {
      const foreign = await seedGradedListing({
        organizationId: OTHER_ORGANIZATION_ID,
        abcGrade: 'A',
        suffix: 'FOREIGN',
      });

      await expect(
        service.registerCampaign(
          {
            campaignName: 'Hijack attempt',
            adGroupName: 'ag',
            grade: 'A',
            dailyBudget: 10000,
            operationMode: 'manual',
            listings: [{ listingId: foreign.listing.id }],
          },
          TEST_ORGANIZATION_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('#9 inactive listing → NotFoundException', async () => {
      const deleted = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        suffix: 'DELETED',
      });
      await prisma.channelListing.update({
        where: { id: deleted.listing.id },
        data: { isActive: false },
      });

      await expect(
        service.registerCampaign(
          {
            campaignName: 'Deleted target',
            adGroupName: 'ag',
            grade: 'A',
            dailyBudget: 10000,
            operationMode: 'manual',
            listings: [{ listingId: deleted.listing.id }],
          },
          TEST_ORGANIZATION_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('#10 유효 listing → AdAction + ExecutionTask 생성', async () => {
      const listing = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        suffix: 'OK',
      });

      const result = await service.registerCampaign(
        {
          campaignName: 'OK campaign',
          adGroupName: 'ag',
          grade: 'A',
          dailyBudget: 10000,
          operationMode: 'manual',
          listings: [{ listingId: listing.listing.id }],
          keywords: [{ keyword: 'kids toy', bidPrice: 200 }],
          targetRoas: 300,
        },
        TEST_ORGANIZATION_ID,
      );

      expect(result.ok).toBe(true);
      expect(result.actionId).toBeTruthy();
      expect(result.taskId).toBeTruthy();

      const action = await prisma.adAction.findUniqueOrThrow({
        where: { id: result.actionId },
      });
      expect(action.organizationId).toBe(TEST_ORGANIZATION_ID);
      expect(action.actionType).toBe('create_campaign');
      expect(action.targetType).toBe('campaign');
      expect(action.targetLabel).toBe('OK campaign');
      expect(action.priority).toBe('high'); // grade A → high
      expect(action.approvalStatus).toBe('approved');
      expect(action.executeStatus).toBe('queued');

      const tasks = await prisma.executionTask.findMany({
        where: { actionId: result.actionId },
      });
      expect(tasks).toHaveLength(1);
      expect(tasks[0].status).toBe('queued');
    });

    it('#11 동일 campaignName 재등록 → ConflictException', async () => {
      const listing = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        suffix: 'DUP',
      });
      const dto = {
        campaignName: 'Duplicate campaign',
        adGroupName: 'ag',
        grade: 'A',
        dailyBudget: 10000,
        operationMode: 'manual',
        listings: [{ listingId: listing.listing.id }],
      };

      await service.registerCampaign(dto, TEST_ORGANIZATION_ID);

      await expect(
        service.registerCampaign(dto, TEST_ORGANIZATION_ID),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('cross-tenant scope', () => {
    it('#12 다른 회사의 Ad 집계에 침범하지 않음', async () => {
      const own = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        adTier: '1차',
        suffix: 'OWN',
      });
      const foreign = await seedGradedListing({
        organizationId: OTHER_ORGANIZATION_ID,
        abcGrade: 'A',
        adTier: '1차',
        suffix: 'FOREIGN',
      });

      await seedAd({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: own.listing.id,
        optionId: own.option.id,
        spend: 10000,
        revenue: 50000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });
      await seedAd({
        organizationId: OTHER_ORGANIZATION_ID,
        listingId: foreign.listing.id,
        optionId: foreign.option.id,
        spend: 10000,
        revenue: 50000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });

      const plan = await service.getWeeklyPlan('14d', TEST_ORGANIZATION_ID);

      expect(plan.actions).toHaveLength(1);
      expect(plan.actions[0].listing.listingId).toBe(own.listing.id);

      const exposure = await service.getExposureAnalysis(TEST_ORGANIZATION_ID);
      expect(exposure.scores).toHaveLength(1);
      expect(exposure.scores[0].listing.listingId).toBe(own.listing.id);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Wave C4 — channel daily snapshot evidence on strategy actions
  // ─────────────────────────────────────────────────────────────

  describe('Wave C4 — channel state signals on getRules / getWeeklyPlan', () => {
    async function seedListingDaily(params: {
      organizationId: string;
      listingId: string;
      channel?: string;
      externalId: string;
      businessDate: string;
      isOfferWinner?: boolean | null;
      myPrice?: number | null;
      winnerPrice?: number | null;
      winnerGapPrice?: number | null;
      exposureStatus?: string | null;
      saleStatus?: string | null;
    }) {
      return prisma.channelListingDailySnapshot.create({
        data: {
          organizationId: params.organizationId,
          listingId: params.listingId,
          channel: params.channel ?? 'coupang',
          externalId: params.externalId,
          businessDate: new Date(`${params.businessDate}T00:00:00Z`),
          sampleCount: 1,
          isOfferWinner: params.isOfferWinner ?? null,
          myPrice: params.myPrice ?? null,
          winnerPrice: params.winnerPrice ?? null,
          winnerGapPrice: params.winnerGapPrice ?? null,
          exposureStatus: params.exposureStatus ?? null,
          saleStatus: params.saleStatus ?? null,
        },
      });
    }

    async function seedOptionDaily(params: {
      organizationId: string;
      listingId: string;
      listingOptionId: string;
      externalId: string;
      externalOptionId: string;
      businessDate: string;
      stockQty?: number | null;
    }) {
      return prisma.channelListingOptionDailySnapshot.create({
        data: {
          organizationId: params.organizationId,
          listingId: params.listingId,
          listingOptionId: params.listingOptionId,
          channel: 'coupang',
          externalId: params.externalId,
          externalOptionId: params.externalOptionId,
          businessDate: new Date(`${params.businessDate}T00:00:00Z`),
          sampleCount: 1,
          stockQty: params.stockQty ?? null,
        },
      });
    }

    it('attaches latest listing+option daily snapshot to action.channelState (C4-#1)', async () => {
      const a = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        adTier: '1차',
        suffix: 'C4-EV',
      });
      // H3 — the strategy aggregate now reads ad-metric columns from the
      // same `ChannelListingDailySnapshot` rows. Land the ad metrics on the
      // 2026-04-14 row so it remains the latest businessDate AND carries
      // the spend/revenue the rule engine needs.
      await seedListingDaily({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: a.listing.id,
        externalId: a.listing.externalId,
        businessDate: '2026-04-13',
        isOfferWinner: true,
        myPrice: 12000,
      });
      await prisma.channelListingDailySnapshot.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          listingId: a.listing.id,
          channel: 'coupang',
          externalId: a.listing.externalId,
          businessDate: new Date('2026-04-14T00:00:00Z'),
          isOfferWinner: false,
          myPrice: 12000,
          winnerPrice: 11500,
          winnerGapPrice: -500,
          adSpend: 10000,
          adRevenue: 60000,
          adClicks: 100,
          adImpressions: 10000,
          adConversions: 10,
        },
      });
      await seedOptionDaily({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: a.listing.id,
        listingOptionId: a.listingOption.id,
        externalId: a.listing.externalId,
        externalOptionId: 'VI-C4-EV',
        businessDate: '2026-04-14',
        stockQty: 0,
      });

      const rules = await service.getRules('14d', TEST_ORGANIZATION_ID);
      const action = rules.recommendations.find(
        (r) => r.listing.listingId === a.listing.id,
      );
      expect(action).toBeDefined();
      expect(action?.channelState).not.toBeNull();
      expect(action?.channelState?.businessDate).toBe('2026-04-14');
      expect(action?.channelState?.isOfferWinner).toBe(false);
      expect(action?.channelState?.winnerGapPrice).toBe(-500);
      expect(action?.channelState?.primaryOption?.stockQty).toBe(0);
      expect(action?.reason).toContain('아이템위너 아님');
      expect(action?.reason).toContain('옵션 재고 0');
      expect(action?.reason).toContain('2026-04-14 관측');
    });

    it('uses the deterministic hydrated primary option, not an arbitrary option daily row (C4-#1b)', async () => {
      const a = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        adTier: '1차',
        suffix: 'C4-MULTI',
      });
      const earlierSku = await prisma.sellpiaInventorySku.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          code: 'SP-C4-MULTI-EARLY',
          name: 'Sellpia C4 MULTI EARLY',
          currentStock: 100,
          purchasePrice: 5000,
        },
      });
      const earlierVariant = await prisma.productVariant.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          masterProductId: a.master.id,
          code: 'VAR-C4-MULTI-EARLY',
          name: 'Variant C4 MULTI EARLY',
        },
      });
      await prisma.productVariantComponent.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          productVariantId: earlierVariant.id,
          sellpiaInventorySkuId: earlierSku.id,
          quantity: 1,
          source: 'manual',
        },
      });
      const earlierListingOption = await prisma.channelListingOption.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          listingId: a.listing.id,
          productVariantId: earlierVariant.id,
          externalOptionId: 'VI-C4-MULTI-EARLY',
          salePrice: 20000,
          costPriceOverride: 5000,
          commissionRate: 0.1,
          shippingCost: 2500,
          lastImportRunId: a.listing.lastImportRunId,
          isActive: true,
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
        },
      });
      // H3 — bake ad metrics into the 2026-04-14 listing-daily so it remains
      // the strategy aggregate input AND the latest channel-state.
      await prisma.channelListingDailySnapshot.create({
        data: {
          organizationId: TEST_ORGANIZATION_ID,
          listingId: a.listing.id,
          channel: 'coupang',
          externalId: a.listing.externalId,
          businessDate: new Date('2026-04-14T00:00:00Z'),
          isOfferWinner: true,
          adSpend: 10000,
          adRevenue: 60000,
          adClicks: 100,
          adImpressions: 10000,
          adConversions: 10,
        },
      });
      await seedOptionDaily({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: a.listing.id,
        listingOptionId: a.listingOption.id,
        externalId: a.listing.externalId,
        externalOptionId: a.listingOption.externalOptionId,
        businessDate: '2026-04-14',
        stockQty: 0,
      });
      await seedOptionDaily({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: a.listing.id,
        listingOptionId: earlierListingOption.id,
        externalId: a.listing.externalId,
        externalOptionId: earlierListingOption.externalOptionId,
        businessDate: '2026-04-14',
        stockQty: 7,
      });

      const rules = await service.getRules('14d', TEST_ORGANIZATION_ID);
      const action = rules.recommendations.find(
        (r) => r.listing.listingId === a.listing.id,
      );
      expect(action).toBeDefined();
      expect(action?.channelState?.primaryOption?.listingOptionId).toBe(
        earlierListingOption.id,
      );
      expect(action?.channelState?.primaryOption?.stockQty).toBe(7);
      expect(action?.reason).not.toContain('옵션 재고 0');
    });

    it('observable state absent → reason untouched (C4-#2 fallback, H3 semantics)', async () => {
      // H3 — ad metrics now live on the same daily-fact table that backs
      // `channelState`. So a listing with ad-metric-only daily rows still
      // produces a (mostly empty) `channelState`. The C4 contract that
      // matters here is: when no observable winner/exposure/saleStatus is
      // present, the rule engine MUST NOT append the ' · 관측' evidence
      // suffix to `reason`.
      const a = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        adTier: '1차',
        suffix: 'C4-NOSNAP',
      });
      await seedAd({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: a.listing.id,
        optionId: a.option.id,
        spend: 10000,
        revenue: 60000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });

      const rules = await service.getRules('14d', TEST_ORGANIZATION_ID);
      const action = rules.recommendations.find(
        (r) => r.listing.listingId === a.listing.id,
      );
      expect(action).toBeDefined();
      // channelState exists (ad-metric daily-fact row), but observable
      // winner/exposure/sale fields are all null.
      expect(action?.channelState?.isOfferWinner).toBeNull();
      expect(action?.channelState?.exposureStatus).toBeNull();
      expect(action?.channelState?.saleStatus).toBeNull();
      expect(action?.channelState?.primaryOption).toBeNull();
      // No '관측' suffix, no winner-loss appendix — observable state was empty.
      expect(action?.reason).not.toContain('관측');
      expect(action?.reason).not.toContain('아이템위너');
    });

    it('cross-tenant — OTHER_COMPANY daily snapshot does not bleed into TEST_COMPANY action (C4-#3, H3 semantics)', async () => {
      const ours = await seedGradedListing({
        organizationId: TEST_ORGANIZATION_ID,
        abcGrade: 'A',
        adTier: '1차',
        suffix: 'C4-OURS',
      });
      const theirs = await seedGradedListing({
        organizationId: OTHER_ORGANIZATION_ID,
        abcGrade: 'A',
        adTier: '1차',
        suffix: 'C4-THEIRS',
      });
      await seedAd({
        organizationId: TEST_ORGANIZATION_ID,
        listingId: ours.listing.id,
        optionId: ours.option.id,
        spend: 10000,
        revenue: 60000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });
      // Seed a noisy daily snapshot in the OTHER organization — must not leak.
      await seedListingDaily({
        organizationId: OTHER_ORGANIZATION_ID,
        listingId: theirs.listing.id,
        externalId: theirs.listing.externalId,
        businessDate: '2026-04-14',
        isOfferWinner: false,
        winnerGapPrice: -9999,
      });

      const rules = await service.getRules('14d', TEST_ORGANIZATION_ID);
      const action = rules.recommendations.find(
        (r) => r.listing.listingId === ours.listing.id,
      );
      expect(action).toBeDefined();
      // H3 — ours has an ad-metric daily-fact row from seedAd, so
      // channelState exists but carries OUR externalId (not OTHER's
      // -9999 winner gap). The cross-tenant invariant is the externalId
      // and the absence of OTHER's winner state.
      expect(action?.channelState?.externalId).toBe(ours.listing.externalId);
      expect(action?.channelState?.winnerGapPrice).toBeNull();
      expect(action?.channelState?.isOfferWinner).toBeNull();
    });
  });
});
