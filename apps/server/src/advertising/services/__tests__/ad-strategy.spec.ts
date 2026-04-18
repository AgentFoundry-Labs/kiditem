import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { AdStrategyService } from '../ad-strategy.service';

describe('AdStrategyService', () => {
  let service: AdStrategyService;
  let prisma: any;
  let adConfig: any;

  const companyA = 'company-a';
  const companyB = 'company-b';

  beforeEach(() => {
    prisma = {
      ad: {
        groupBy: vi.fn(),
        aggregate: vi.fn(),
      },
      adSnapshot: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      adAction: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
      alert: {
        findMany: vi.fn().mockResolvedValue([]),
        createMany: vi.fn(),
      },
      channelListing: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
      },
      masterProduct: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      profitLoss: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      review: {
        groupBy: vi.fn().mockResolvedValue([]),
      },
      trafficStats: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      systemSetting: { findMany: vi.fn().mockResolvedValue([]) },
    };
    adConfig = {
      getConfig: vi.fn().mockResolvedValue({
        budget: { allocation: { A: 60, B: 30, C: 10 } },
        roasTargetByGrade: { A: 300, B: 400, C: 500 },
      }),
    };
    service = new AdStrategyService(prisma, adConfig);
  });

  function listingFixture(overrides: Partial<any> = {}) {
    return {
      id: 'L1',
      externalId: 'COUPANG-1',
      channelName: '쿠팡',
      master: {
        id: 'M1',
        code: 'M-001',
        name: '상품1',
        abcGrade: 'A',
        adTier: '1차',
        healthScore: 70,
      },
      options: [
        {
          option: {
            id: 'O1',
            sku: 'SKU-1',
            optionName: 'opt1',
            availableStock: 100,
            costPrice: 3000,
            sellPrice: 10000,
            commissionRate: 0.1,
            shippingCost: 500,
          },
        },
      ],
      ...overrides,
    };
  }

  describe('getRules — ABC grade classification via calcActions', () => {
    it('A 등급 listing 이 ROAS 500% → high priority (A-1 매출 확대)', async () => {
      prisma.ad.groupBy.mockResolvedValue([
        { listingId: 'L1', _sum: { spend: 10000, revenue: 50000, clicks: 100, impressions: 5000, conversions: 10 } },
      ]);
      prisma.channelListing.findMany.mockResolvedValue([listingFixture()]);

      const result = await service.getRules('14d', companyA);

      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0].grade).toBe('A');
      expect(result.recommendations[0].priority).toBe('high');
      expect(result.recommendations[0].listing.listingId).toBe('L1');
      expect(result.summary.totalActions).toBe(1);
      expect(result.summary.urgentCount).toBe(0);
    });

    it('A 등급 listing ROAS 150% + spend 5000 → urgent (A-3 위험 감지)', async () => {
      prisma.ad.groupBy.mockResolvedValue([
        { listingId: 'L1', _sum: { spend: 5000, revenue: 7500, clicks: 100, impressions: 5000, conversions: 10 } },
      ]);
      prisma.channelListing.findMany.mockResolvedValue([listingFixture()]);

      const result = await service.getRules('14d', companyA);

      expect(result.summary.urgentCount).toBe(1);
      expect(result.recommendations[0].priority).toBe('urgent');
    });

    it('재고 0 + adTier ON + spend > 0 → urgent (긴급: 재고0 광고ON)', async () => {
      prisma.ad.groupBy.mockResolvedValue([
        { listingId: 'L1', _sum: { spend: 5000, revenue: 3000, clicks: 20, impressions: 1000, conversions: 1 } },
      ]);
      const listing = listingFixture();
      listing.options[0].option.availableStock = 0;
      prisma.channelListing.findMany.mockResolvedValue([listing]);

      const result = await service.getRules('14d', companyA);

      expect(result.recommendations[0].priority).toBe('urgent');
      expect(prisma.alert.createMany).toHaveBeenCalled();
    });

    it('spend 0 → listing 이 actions 에 포함되지 않음', async () => {
      prisma.ad.groupBy.mockResolvedValue([
        { listingId: 'L1', _sum: { spend: 0, revenue: 0, clicks: 0, impressions: 0, conversions: 0 } },
      ]);
      prisma.channelListing.findMany.mockResolvedValue([listingFixture()]);

      const result = await service.getRules('14d', companyA);

      expect(result.recommendations).toHaveLength(0);
    });
  });

  describe('5 score calculators', () => {
    it('calculateSalesScore: t14Rev > t14PrevRev (성장) → growthScore 20', () => {
      const score = (service as any).calculateSalesScore({
        maxT14: 100000,
        t14Rev: 50000,
        t14PrevRev: 40000,
        t14Orders: 5,
      });
      // 50000/100000*60 = 30 + 20(growth) + 20(orders) = 70
      expect(score).toBe(70);
    });

    it('calculateReviewScore: 많은 리뷰 + 높은 평점 → 최대치', () => {
      const score = (service as any).calculateReviewScore({
        totalReviews: 100,
        recentReviews: 20,
        avgRating: 5,
      });
      // 40(total>=50) + 40(recent>=10) + 20(rating) = 100
      expect(score).toBe(100);
    });

    it('calculateAdScore: spend=0 → 중립 50', () => {
      const score = (service as any).calculateAdScore({
        spend: 0,
        roas: 0,
        ctr: 0,
        cvr: 0,
      });
      expect(score).toBe(50);
    });

    it('calculateAdScore: roas 650 + ctr 0.5 + cvr 5 → 100', () => {
      const score = (service as any).calculateAdScore({
        spend: 10000,
        roas: 650,
        ctr: 0.5,
        cvr: 5,
      });
      expect(score).toBe(100);
    });

    it('calculateFulfillmentScore: leadTime null → leadScore 20 (기본)', () => {
      const score = (service as any).calculateFulfillmentScore({
        leadTime: null,
        stock: 20,
        profitRate: 5,
      });
      // 20(leadTime null default) + 20(stock>=10) + 20(profit>=5) = 60
      expect(score).toBe(60);
    });

    it('calculateInfoScore: healthScore null + adTier null → 0', () => {
      const score = (service as any).calculateInfoScore({
        healthScore: null,
        adTier: null,
      });
      expect(score).toBe(0);
    });

    it('calculateInfoScore: healthScore 70 + adTier 1차 → 90', () => {
      const score = (service as any).calculateInfoScore({
        healthScore: 70,
        adTier: '1차',
      });
      // min(80, 70) + 20 = 90
      expect(score).toBe(90);
    });
  });

  describe('getWeeklyPlan', () => {
    it('반환 shape: actions + issues + tierAnalysis + top20 + week', async () => {
      prisma.ad.groupBy.mockResolvedValue([]);
      prisma.masterProduct.findMany.mockResolvedValue([]);
      prisma.profitLoss.findMany.mockResolvedValue([]);
      prisma.channelListing.findMany.mockResolvedValue([]);

      const result = await service.getWeeklyPlan('14d', companyA);

      expect(result).toHaveProperty('actions');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('tierAnalysis');
      expect(result).toHaveProperty('top20');
      expect(result.week.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(result.week.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('budget allocator 는 getWeeklyPlan 경유로 호출됨 (public surface)', async () => {
      prisma.ad.groupBy.mockResolvedValue([]);
      prisma.channelListing.findMany.mockResolvedValue([]);
      prisma.masterProduct.findMany.mockResolvedValue([]);
      prisma.profitLoss.findMany.mockResolvedValue([]);

      await service.getWeeklyPlan('14d', companyA);

      // calcBudgetAllocation 은 adConfig.getConfig 를 호출 → 호출 확인으로 실행 증명
      expect(adConfig.getConfig).toHaveBeenCalledWith(companyA);
    });
  });

  describe('registerCampaign — IDOR guard', () => {
    const validDto = {
      campaignName: 'Test Campaign',
      adGroupName: 'AG-1',
      grade: 'A',
      dailyBudget: 30000,
      operationMode: 'manual',
      listings: [{ listingId: 'L1' }],
    };

    it('listingId not found → NotFoundException', async () => {
      prisma.channelListing.findFirst.mockResolvedValue(null);

      await expect(service.registerCampaign(validDto as any, companyA)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.channelListing.findFirst).toHaveBeenCalledWith({
        where: { id: 'L1', companyId: companyA, isDeleted: false },
        select: { id: true },
      });
    });

    it('listingId belongs to other company → NotFoundException', async () => {
      // companyB 가 소유한 listing 을 companyA 가 요청
      prisma.channelListing.findFirst.mockImplementation((args: any) => {
        if (args.where.companyId === companyB) return Promise.resolve({ id: 'L1' });
        return Promise.resolve(null);
      });

      await expect(service.registerCampaign(validDto as any, companyA)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('listing 소유권 OK + 신규 캠페인 → AdAction create', async () => {
      prisma.channelListing.findFirst.mockResolvedValue({ id: 'L1' });
      prisma.adAction.findFirst.mockResolvedValue(null);
      prisma.adAction.create.mockResolvedValue({
        id: 'A1',
        executionTasks: [{ id: 'T1' }],
      });

      const result = await service.registerCampaign(validDto as any, companyA);

      expect(result.ok).toBe(true);
      expect(result.actionId).toBe('A1');
      expect(result.taskId).toBe('T1');
      expect(prisma.adAction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: companyA,
            actionType: 'create_campaign',
            targetType: 'campaign',
            targetLabel: 'Test Campaign',
          }),
        }),
      );
    });

    it('중복 캠페인명 → ConflictException', async () => {
      prisma.channelListing.findFirst.mockResolvedValue({ id: 'L1' });
      prisma.adAction.findFirst.mockResolvedValue({
        id: 'existing',
        executeStatus: 'queued',
      });

      await expect(service.registerCampaign(validDto as any, companyA)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('getRecommendations', () => {
    it('listing-primary array 반환 (urgent + high 만)', async () => {
      prisma.ad.groupBy.mockResolvedValue([
        { listingId: 'L1', _sum: { spend: 10000, revenue: 50000, clicks: 100, impressions: 5000, conversions: 10 } },
        { listingId: 'L2', _sum: { spend: 1000, revenue: 500, clicks: 2, impressions: 100, conversions: 0 } },
      ]);
      prisma.channelListing.findMany.mockResolvedValue([
        listingFixture(),
        { ...listingFixture(), id: 'L2', externalId: 'COUPANG-2', master: { ...listingFixture().master, id: 'M2', code: 'M-002', abcGrade: 'C' } },
      ]);

      const result = await service.getRecommendations(companyA);

      expect(Array.isArray(result)).toBe(true);
      for (const rec of result) {
        expect(rec.listing.listingId).toBeDefined();
        expect(['urgent', 'high']).toContain(rec.priority);
      }
    });
  });

  describe('getExposureAnalysis', () => {
    it('listing-primary scores + urgentActions', async () => {
      prisma.ad.groupBy.mockResolvedValue([
        { listingId: 'L1', _sum: { spend: 0, revenue: 0, clicks: 0, impressions: 0, conversions: 0 } },
      ]);
      prisma.channelListing.findMany.mockResolvedValue([listingFixture()]);

      const result = await service.getExposureAnalysis(companyA);

      expect(result).toHaveProperty('scores');
      expect(result).toHaveProperty('urgentActions');
      expect(Array.isArray(result.scores)).toBe(true);
      expect(Array.isArray(result.urgentActions)).toBe(true);
      if (result.scores.length > 0) {
        expect(result.scores[0].listing.listingId).toBeDefined();
        expect(result.scores[0].factors).toHaveLength(5);
      }
    });
  });

  describe('ADR-0006 — no default company fallback', () => {
    it('모든 public 메서드가 companyId 마지막 파라미터로 받음', async () => {
      prisma.ad.groupBy.mockResolvedValue([]);
      prisma.channelListing.findMany.mockResolvedValue([]);
      prisma.masterProduct.findMany.mockResolvedValue([]);
      prisma.profitLoss.findMany.mockResolvedValue([]);

      await service.getRules('14d', 'company-xyz');
      await service.getWeeklyPlan('14d', 'company-xyz');
      await service.getRecommendations('company-xyz');
      await service.getExposureAnalysis('company-xyz');

      // ad.groupBy 는 companyId 필터로 호출되어야 함
      expect(prisma.ad.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ companyId: 'company-xyz' }),
        }),
      );
    });
  });
});
