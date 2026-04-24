import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { AdStrategyService } from '../services/ad-strategy.service';
import { AdConfigService } from '../services/ad-config.service';
import { AdGradeRulesService } from '../services/ad-grade-rules.service';
import { AdBudgetAllocatorService } from '../services/ad-budget-allocator.service';
import { AdExposureService } from '../services/ad-exposure.service';
import { AdRecommendService } from '../services/ad-recommend.service';
import { AgentRegistryService } from '../../agent-registry/agent-registry.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  makeTestPrisma,
  resetDb,
  seedBaseFixture,
  TEST_COMPANY_ID,
  OTHER_COMPANY_ID,
} from '../../test-helpers/real-prisma';
import { seedOrderWithLineItems } from '../../test-helpers/finance-seeds';

describe('AdStrategy flow (PG integration)', () => {
  let prisma: PrismaClient;
  let service: AdStrategyService;

  async function seedGradedListing(params: {
    companyId: string;
    abcGrade: 'A' | 'B' | 'C';
    adTier?: string | null;
    healthScore?: number | null;
    availableStock?: number | null;
    costPrice?: number | null;
    sellPrice?: number | null;
    commissionRate?: number | null;
    shippingCost?: number | null;
    suffix: string;
  }) {
    const master = await prisma.masterProduct.create({
      data: {
        companyId: params.companyId,
        code: `M-${params.suffix}`,
        name: `Master ${params.suffix}`,
        abcGrade: params.abcGrade,
        adTier: params.adTier ?? null,
        healthScore: params.healthScore ?? null,
        optionCounter: 0,
      },
    });
    const option = await prisma.productOption.create({
      data: {
        companyId: params.companyId,
        masterId: master.id,
        sku: `SKU-${params.suffix}`,
        optionName: `Option ${params.suffix}`,
        availableStock: params.availableStock ?? 100,
        costPrice: params.costPrice ?? 5000,
        sellPrice: params.sellPrice ?? 20000,
        commissionRate: params.commissionRate ?? 0.1,
        shippingCost: params.shippingCost ?? 2500,
      },
    });
    const listing = await prisma.channelListing.create({
      data: {
        companyId: params.companyId,
        masterId: master.id,
        channel: 'coupang',
        externalId: `EXT-${params.suffix}`,
        channelName: `Channel ${params.suffix}`,
      },
    });
    const listingOption = await prisma.channelListingOption.create({
      data: {
        companyId: params.companyId,
        listingId: listing.id,
        optionId: option.id,
        externalOptionId: `VI-${params.suffix}`,
        isActive: true,
      },
    });
    return { master, option, listing, listingOption };
  }

  async function seedAd(params: {
    companyId: string;
    listingId: string;
    optionId?: string | null;
    daysAgo?: number;
    spend: number;
    revenue: number;
    clicks?: number;
    impressions?: number;
    conversions?: number;
  }) {
    const date = new Date();
    date.setDate(date.getDate() - (params.daysAgo ?? 0));
    return prisma.ad.create({
      data: {
        companyId: params.companyId,
        listingId: params.listingId,
        optionId: params.optionId ?? null,
        platform: 'coupang',
        date,
        spend: params.spend,
        revenue: params.revenue,
        clicks: params.clicks ?? 0,
        impressions: params.impressions ?? 0,
        conversions: params.conversions ?? 0,
      },
    });
  }

  beforeAll(async () => {
    prisma = makeTestPrisma();
    await prisma.$connect();

    const m = await Test.createTestingModule({
      providers: [
        AdStrategyService,
        AdConfigService,
        AdGradeRulesService,
        AdBudgetAllocatorService,
        AdExposureService,
        AdRecommendService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AgentRegistryService,
          useValue: { findByType: vi.fn().mockResolvedValue(null) },
        },
      ],
    }).compile();
    service = m.get(AdStrategyService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    await seedBaseFixture(prisma);
  });

  describe('getRules / getWeeklyPlan — 3-grade listing scenario', () => {
    it('#1 A 등급 ROAS 480+ → recommendations 에 포함 + summary 집계', async () => {
      const a = await seedGradedListing({
        companyId: TEST_COMPANY_ID,
        abcGrade: 'A',
        adTier: '1차',
        healthScore: 80,
        costPrice: 10_000,
        suffix: 'A-EXPAND',
      });
      await seedOrderWithLineItems(prisma, {
        companyId: TEST_COMPANY_ID,
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
        companyId: TEST_COMPANY_ID,
        listingId: a.listing.id,
        optionId: a.option.id,
        spend: 2_000,
        revenue: 10_000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });

      const rules = await service.getRules('14d', TEST_COMPANY_ID);

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
        companyId: TEST_COMPANY_ID,
        abcGrade: 'A',
        adTier: '1차',
        suffix: 'A-GOOD',
      });
      const b = await seedGradedListing({
        companyId: TEST_COMPANY_ID,
        abcGrade: 'B',
        suffix: 'B-OK',
      });
      const c = await seedGradedListing({
        companyId: TEST_COMPANY_ID,
        abcGrade: 'C',
        availableStock: 0,
        adTier: '2차',
        suffix: 'C-URGENT',
      });

      // A: 공격 확장 (high)
      await seedAd({
        companyId: TEST_COMPANY_ID,
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
        companyId: TEST_COMPANY_ID,
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
        companyId: TEST_COMPANY_ID,
        listingId: c.listing.id,
        optionId: c.option.id,
        spend: 10000,
        revenue: 50000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });

      const plan = await service.getWeeklyPlan('14d', TEST_COMPANY_ID);

      expect(plan.actions.length).toBe(3);
      // priority 정렬: urgent 먼저
      expect(plan.actions[0].priority).toBe('urgent');
      expect(plan.actions[0].grade).toBe('C');
      expect(plan.week.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(plan.week.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('#3 getWeeklyPlan 의 issues + tierAnalysis + top20 shape', async () => {
      const a = await seedGradedListing({
        companyId: TEST_COMPANY_ID,
        abcGrade: 'A',
        adTier: '1차',
        costPrice: 10_000,
        suffix: 'A-TOP',
      });

      // 14일 내 Ad history → adIssues 포착 (highSpend)
      for (let i = 0; i < 10; i++) {
        await seedAd({
          companyId: TEST_COMPANY_ID,
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
        companyId: TEST_COMPANY_ID,
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

      const plan = await service.getWeeklyPlan('14d', TEST_COMPANY_ID);

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
        companyId: TEST_COMPANY_ID,
        abcGrade: 'C',
        availableStock: 0,
        adTier: '3차',
        suffix: 'C-URGENT',
      });
      const a = await seedGradedListing({
        companyId: TEST_COMPANY_ID,
        abcGrade: 'A',
        suffix: 'A-HIGH',
      });
      const b = await seedGradedListing({
        companyId: TEST_COMPANY_ID,
        abcGrade: 'B',
        suffix: 'B-LOW',
      });

      // urgent: 재고 0
      await seedAd({
        companyId: TEST_COMPANY_ID,
        listingId: c.listing.id,
        optionId: c.option.id,
        spend: 5000,
        revenue: 5000,
        clicks: 50,
        impressions: 5000,
      });
      // A-1 high: ROAS 500
      await seedAd({
        companyId: TEST_COMPANY_ID,
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
        companyId: TEST_COMPANY_ID,
        listingId: b.listing.id,
        optionId: b.option.id,
        spend: 10000,
        revenue: 31000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });

      const recs = await service.getRecommendations(TEST_COMPANY_ID);

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
        companyId: TEST_COMPANY_ID,
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
        companyId: TEST_COMPANY_ID,
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
          companyId: TEST_COMPANY_ID,
          listingId: listing.listing.id,
          platform: 'coupang',
          rating: 5,
          reviewedAt: new Date(Date.now() - i * 24 * 3600 * 1000),
        })),
      });

      // TrafficStats seed
      await prisma.trafficStats.create({
        data: {
          companyId: TEST_COMPANY_ID,
          listingId: listing.listing.id,
          date: new Date(),
          periodDays: 14,
          revenue: 500000,
          orders: 30,
          visitors: 1000,
          views: 3000,
        },
      });

      const result = await service.getExposureAnalysis(TEST_COMPANY_ID);

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
        companyId: TEST_COMPANY_ID,
        abcGrade: 'C',
        healthScore: 10,
        availableStock: 0,
        costPrice: 10000,
        sellPrice: 12000,
        commissionRate: 0.1,
        shippingCost: 3000,
        suffix: 'EXP-WEAK',
      });

      await seedAd({
        companyId: TEST_COMPANY_ID,
        listingId: weak.listing.id,
        optionId: weak.option.id,
        spend: 100000,
        revenue: 10000,
        clicks: 500,
        impressions: 100000,
        conversions: 2,
      });

      const result = await service.getExposureAnalysis(TEST_COMPANY_ID);

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
          TEST_COMPANY_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('#8 cross-tenant listingId → NotFoundException (IDOR guard)', async () => {
      const foreign = await seedGradedListing({
        companyId: OTHER_COMPANY_ID,
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
          TEST_COMPANY_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('#9 soft-deleted listing → NotFoundException', async () => {
      const deleted = await seedGradedListing({
        companyId: TEST_COMPANY_ID,
        abcGrade: 'A',
        suffix: 'DELETED',
      });
      await prisma.channelListing.update({
        where: { id: deleted.listing.id },
        data: { isDeleted: true },
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
          TEST_COMPANY_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('#10 유효 listing → AdAction + ExecutionTask 생성', async () => {
      const listing = await seedGradedListing({
        companyId: TEST_COMPANY_ID,
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
        TEST_COMPANY_ID,
      );

      expect(result.ok).toBe(true);
      expect(result.actionId).toBeTruthy();
      expect(result.taskId).toBeTruthy();

      const action = await prisma.adAction.findUniqueOrThrow({
        where: { id: result.actionId },
      });
      expect(action.companyId).toBe(TEST_COMPANY_ID);
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
        companyId: TEST_COMPANY_ID,
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

      await service.registerCampaign(dto, TEST_COMPANY_ID);

      await expect(
        service.registerCampaign(dto, TEST_COMPANY_ID),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('cross-tenant scope', () => {
    it('#12 다른 회사의 Ad 집계에 침범하지 않음', async () => {
      const own = await seedGradedListing({
        companyId: TEST_COMPANY_ID,
        abcGrade: 'A',
        adTier: '1차',
        suffix: 'OWN',
      });
      const foreign = await seedGradedListing({
        companyId: OTHER_COMPANY_ID,
        abcGrade: 'A',
        adTier: '1차',
        suffix: 'FOREIGN',
      });

      await seedAd({
        companyId: TEST_COMPANY_ID,
        listingId: own.listing.id,
        optionId: own.option.id,
        spend: 10000,
        revenue: 50000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });
      await seedAd({
        companyId: OTHER_COMPANY_ID,
        listingId: foreign.listing.id,
        optionId: foreign.option.id,
        spend: 10000,
        revenue: 50000,
        clicks: 100,
        impressions: 10000,
        conversions: 10,
      });

      const plan = await service.getWeeklyPlan('14d', TEST_COMPANY_ID);

      expect(plan.actions).toHaveLength(1);
      expect(plan.actions[0].listing.listingId).toBe(own.listing.id);

      const exposure = await service.getExposureAnalysis(TEST_COMPANY_ID);
      expect(exposure.scores).toHaveLength(1);
      expect(exposure.scores[0].listing.listingId).toBe(own.listing.id);
    });
  });
});
