import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildPerListingMetrics } from '../../../common/per-listing-profit';
import { AdStrategyService } from '../ad-strategy.service';

vi.mock('../../../common/per-listing-profit', () => ({
  buildPerListingMetrics: vi.fn(),
}));

const mockedBuildPerListingMetrics = vi.mocked(buildPerListingMetrics);

/**
 * Orchestrator 의 thin delegation 확인 전용 (Plan B2b.refactor T9 + T7-fix).
 *
 * H3 — orchestrator no longer reads `prisma.ad`/`prisma.trafficStats`.
 * Lifetime + 14-day ad aggregates come from `ChannelListingDailySnapshot`,
 * exposure traffic windowing comes from the same daily-fact table, and the
 * exposure aggregate uses `ChannelListingDailySnapshot.groupBy` directly.
 *
 * 계산 정확성 / threshold / ABC grade 로직 회귀 보호는 sub-service unit spec +
 * integration 12 시나리오 (ad-strategy-flow.pg.integration.spec.ts) 로 위임.
 */
describe('AdStrategyService (orchestrator delegation)', () => {
  let service: AdStrategyService;
  let prisma: any;
  let adConfig: any;
  let agentRegistry: any;
  let adGradeRules: any;
  let adBudgetAllocator: any;
  let adExposure: any;
  let adRecommend: any;

  beforeEach(() => {
    prisma = {
      // H3 — primary ad-aggregate source: ChannelListingDailySnapshot.
      channelListingDailySnapshot: {
        groupBy: vi.fn().mockResolvedValue([]),
        findMany: vi.fn().mockResolvedValue([]),
      },
      channelListing: { findMany: vi.fn().mockResolvedValue([]) },
      channelListingOption: { findMany: vi.fn().mockResolvedValue([]) },
      channelListingOptionDailySnapshot: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      review: { groupBy: vi.fn().mockResolvedValue([]) },
      // Wave C4: orchestrator now reads latest daily snapshots into the
      // strategy context via $queryRaw (DISTINCT ON). Stubbed here so the
      // unit test stays focused on delegation.
      $queryRaw: vi.fn().mockResolvedValue([]),
    };
    mockedBuildPerListingMetrics.mockReset();
    mockedBuildPerListingMetrics.mockResolvedValue([]);
    adConfig = { getConfig: vi.fn().mockResolvedValue({}) };
    agentRegistry = { findByType: vi.fn().mockResolvedValue(null) };
    adGradeRules = {
      calcActions: vi.fn().mockReturnValue([]),
      calcAdIssues: vi
        .fn()
        .mockReturnValue({ zeroConversion: [], lowRoas: [], highSpend: [] }),
    };
    adBudgetAllocator = {
      calcSnapshotKeyMetrics: vi.fn().mockReturnValue({
        totals: { spend: 0, revenue: 0, clicks: 0, impressions: 0, conversions: 0 },
        perListing: new Map(),
        gradeMap: new Map(),
      }),
      calcBudgetAllocation: vi.fn().mockReturnValue([]),
      calcTierAnalysis: vi.fn().mockReturnValue([]),
      calcTop20: vi.fn().mockReturnValue([]),
    };
    adExposure = {
      calculateScores: vi.fn(),
      assembleExposureData: vi.fn().mockReturnValue({ scores: [], urgentActions: [] }),
    };
    adRecommend = {
      enhanceActionsWithAi: vi.fn().mockResolvedValue([]),
      toRecommendations: vi.fn().mockReturnValue([]),
    };
    service = new AdStrategyService(
      prisma,
      adConfig,
      agentRegistry,
      adGradeRules,
      adBudgetAllocator,
      adExposure,
      adRecommend,
    );
  });

  it('getRules → adGradeRules.calcActions 호출 (adGroups 기반)', async () => {
    prisma.channelListingDailySnapshot.groupBy.mockResolvedValue([
      {
        listingId: 'L1',
        _sum: {
          adSpend: 10000,
          adRevenue: 50000,
          adClicks: 100,
          adImpressions: 10000,
          adConversions: 10,
        },
      },
    ]);
    await service.getRules('14d', 'company-1');
    expect(adGradeRules.calcActions).toHaveBeenCalled();
  });

  it('getWeeklyPlan → 4 sub-service 메서드 호출 (allocation + actions + issues + tier + top20)', async () => {
    await service.getWeeklyPlan('14d', 'company-1');
    expect(adBudgetAllocator.calcBudgetAllocation).toHaveBeenCalled();
    expect(adGradeRules.calcActions).toHaveBeenCalled();
    expect(adGradeRules.calcAdIssues).toHaveBeenCalled();
    expect(adBudgetAllocator.calcTierAnalysis).toHaveBeenCalled();
    expect(adBudgetAllocator.calcTop20).toHaveBeenCalled();
  });

  it('getWeeklyPlan passes live percentage profit rates without multiplying by 100', async () => {
    prisma.channelListingDailySnapshot.groupBy
      .mockResolvedValueOnce([
        {
          listingId: 'L1',
          _sum: {
            adSpend: 10000,
            adRevenue: 50000,
            adClicks: 100,
            adImpressions: 10000,
            adConversions: 10,
          },
        },
      ])
      .mockResolvedValueOnce([]);
    mockedBuildPerListingMetrics.mockResolvedValue([
      {
        listingId: 'L1',
        externalId: 'EXT-1',
        channel: 'coupang',
        channelName: '쿠팡',
        masterId: 'M1',
        masterCode: 'M-1',
        masterName: '상품 1',
        category: null,
        grade: 'A',
        thumbnailUrl: null,
        revenue: 20000,
        costOfGoods: 10000,
        commission: 2000,
        shippingCost: 2000,
        adCost: 2000,
        otherCost: 0,
        netProfit: 4000,
        profitRate: 20,
        orderCount: 1,
      },
    ]);

    await service.getWeeklyPlan('14d', 'company-1');

    const gradeArg = adGradeRules.calcActions.mock.calls[0]?.[0];
    expect(gradeArg.profitRateByListing.get('L1')).toBe(20);

    const top20Arg = adBudgetAllocator.calcTop20.mock.calls[0]?.[0];
    expect(top20Arg).not.toHaveProperty('profitLosses');
  });

  it('getAiEnhancedPlan → getWeeklyPlan 결과를 adRecommend.enhanceActionsWithAi 로 전달', async () => {
    await service.getAiEnhancedPlan('14d', 'company-1');
    expect(adRecommend.enhanceActionsWithAi).toHaveBeenCalled();
  });

  it('getRecommendations → adGradeRules.calcActions 기반 (B2b 복원, agent task 미사용)', async () => {
    prisma.channelListingDailySnapshot.groupBy.mockResolvedValue([
      {
        listingId: 'L1',
        _sum: {
          adSpend: 10000,
          adRevenue: 50000,
          adClicks: 100,
          adImpressions: 10000,
          adConversions: 10,
        },
      },
    ]);
    await service.getRecommendations('company-1');
    expect(adGradeRules.calcActions).toHaveBeenCalled();
    // agent task 기반이 아니므로 toRecommendations 는 호출되지 않는다.
    expect(adRecommend.toRecommendations).not.toHaveBeenCalled();
  });

  it('getExposureAnalysis → adExposure.assembleExposureData 호출', async () => {
    prisma.channelListingDailySnapshot.groupBy.mockResolvedValue([
      {
        listingId: 'L1',
        _sum: {
          adSpend: 0,
          adRevenue: 0,
          adClicks: 0,
          adImpressions: 0,
          adConversions: 0,
        },
      },
    ]);
    await service.getExposureAnalysis('company-1');
    expect(adExposure.assembleExposureData).toHaveBeenCalled();
  });
});
