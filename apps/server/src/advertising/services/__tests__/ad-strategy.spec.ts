import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdStrategyService } from '../ad-strategy.service';

/**
 * Orchestrator 의 thin delegation 확인 전용 (Plan B2b.refactor T9).
 *
 * T7 재작성으로 내부 calc* 메서드는 모두 sub-service 4개로 이전. 본 suite 는 orchestrator 가
 * 각 public API 경유로 **sub-service 를 올바르게 호출하는지** 만 검증한다. 계산 정확성·
 * threshold·ABC grade 로직 회귀 보호는 각 sub-service unit spec + integration 12 시나리오
 * (ad-strategy-flow.pg.integration.spec.ts) 로 위임.
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
      adSnapshot: { findMany: vi.fn().mockResolvedValue([]) },
      ad: { groupBy: vi.fn().mockResolvedValue([]) },
      channelListing: { findMany: vi.fn().mockResolvedValue([]) },
      channelListingOption: { findMany: vi.fn().mockResolvedValue([]) },
      profitLoss: { findMany: vi.fn().mockResolvedValue([]) },
      review: { groupBy: vi.fn().mockResolvedValue([]) },
      agentTask: { findFirst: vi.fn().mockResolvedValue(null) },
      trafficStats: { findMany: vi.fn().mockResolvedValue([]) },
    };
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

  /**
   * Orchestrator 는 snapshots/adAgg/listings 가 비어있으면 hydrate 이후 일부 경로에서 early
   * return 한다 (buildActions / getExposureAnalysis). Delegation 확인을 위해 각 테스트는
   * 최소 1건의 snapshot 또는 ad aggregate 를 seed 해서 sub-service 호출까지 진입한다.
   */
  function seedRuleSnapshot() {
    prisma.adSnapshot.findMany.mockResolvedValue([
      {
        id: 's1',
        listingId: 'L1',
        optionId: null,
        pageType: 'campaign',
        externalId: 'E1',
        campaignName: 'cmp',
        status: 'active',
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
        roas: null,
        dailyBudget: 0,
        currentBid: null,
      },
    ]);
    prisma.channelListing.findMany.mockResolvedValue([]);
  }

  it('getRules → adGradeRules.calcActions 호출 (snapshots 기반)', async () => {
    seedRuleSnapshot();
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

  it('getAiEnhancedPlan → getWeeklyPlan 결과를 adRecommend.enhanceActionsWithAi 로 전달', async () => {
    await service.getAiEnhancedPlan('14d', 'company-1');
    expect(adRecommend.enhanceActionsWithAi).toHaveBeenCalled();
  });

  it('getRecommendations → adRecommend.toRecommendations(agentTask.output) 호출', async () => {
    await service.getRecommendations('company-1');
    expect(adRecommend.toRecommendations).toHaveBeenCalled();
  });

  it('getExposureAnalysis → adExposure.assembleExposureData 호출', async () => {
    // listingId 가 있어야 hydrate 이후 scores 루프로 진입 — ad aggregate 하나만 seed.
    prisma.ad.groupBy.mockResolvedValue([
      {
        listingId: 'L1',
        _sum: { spend: 0, revenue: 0, clicks: 0, impressions: 0, conversions: 0 },
      },
    ]);
    await service.getExposureAnalysis('company-1');
    expect(adExposure.assembleExposureData).toHaveBeenCalled();
  });
});
