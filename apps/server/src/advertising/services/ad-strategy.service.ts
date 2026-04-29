import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentRegistryService } from '../../agent-registry/agent-registry.service';
import { kstInclusiveDaysStart } from '../../common/kst';
import { AdConfigService } from './ad-config.service';
import { AdGradeRulesService } from './ad-grade-rules.service';
import { AdBudgetAllocatorService } from './ad-budget-allocator.service';
import { AdExposureService } from './ad-exposure.service';
import { AdRecommendService } from './ad-recommend.service';
import type { RegisterCampaignDto } from '../dto/register-campaign.dto';
import {
  adAggregatesToMetricSnapshots,
  computeListingProfitRate,
  emptyMetrics,
  firstOptionByListing,
  getCurrentPeriod,
  getWeekRange,
  sumListingStock,
  toAdAggregateRows,
  toGradeMapStrict,
} from '../domain/strategy-context';
import {
  getInventorySnapshot,
  hydrateListings,
  loadLeadTimeByListing,
  loadStrategyContext,
} from '../adapter/out/prisma/ad-strategy-context.query';
import {
  toAdRulesData,
  toRecommendationCards,
} from '../mapper/ad-strategy.mapper';
import type {
  AdRulesData,
  AdStrategyAction,
  AdStrategyRecommendation,
  AdWeeklyPlan,
  ExposureAnalysisData,
  ExposureProductScore,
} from '@kiditem/shared/advertising';

type Priority = 'urgent' | 'high' | 'medium' | 'low';

/**
 * Endpoint orchestration for `/api/ads/strategy/*` and `/api/ads/campaigns/register`.
 *
 * Heavy lifting (raw SQL latest-state reads, multi-step hydration, pure rule
 * evaluation, mapping) lives in `domain/`, `adapter/out/prisma/`, `mapper/`,
 * and the four sub-service calculators (`AdGradeRulesService`,
 * `AdBudgetAllocatorService`, `AdExposureService`, `AdRecommendService`).
 *
 * This service only:
 *   - composes the per-endpoint Promise.all batches,
 *   - delegates calculation to the sub-services,
 *   - assembles response shapes via mappers,
 *   - and writes for `registerCampaign()` (kept here because of its IDOR +
 *     duplicate-guard + ExecutionTask creation contract).
 */
@Injectable()
export class AdStrategyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adConfigService: AdConfigService,
    private readonly agentRegistry: AgentRegistryService,
    private readonly adGradeRules: AdGradeRulesService,
    private readonly adBudgetAllocator: AdBudgetAllocatorService,
    private readonly adExposure: AdExposureService,
    private readonly adRecommend: AdRecommendService,
  ) {}

  // ───── PUBLIC API (6 endpoints) ─────

  /** ABC 등급 규칙 기반 recommendations + 요약. */
  async getRules(
    _period: '7d' | '14d' | 'month',
    companyId: string,
  ): Promise<AdRulesData> {
    const recommendations = await this.buildActions(companyId);
    return toAdRulesData(recommendations);
  }

  /** 주간 액션 플랜 — strategy context 한 번 hydrate 후 4 sub-service 조립. */
  async getWeeklyPlan(
    period: '7d' | '14d' | 'month',
    companyId: string,
  ): Promise<AdWeeklyPlan> {
    const { year, month } = getCurrentPeriod();
    const ctx = await loadStrategyContext(
      this.prisma,
      this.adConfigService,
      companyId,
      year,
      month,
    );

    // calcBudgetAllocation 은 AdWeeklyPlan shape 에 노출되진 않지만
    // adConfig.getConfig 부작용 (seed) 보존을 위해 호출해 둔다.
    this.adBudgetAllocator.calcBudgetAllocation({
      config: ctx.config,
      adGroups: ctx.adGroups,
      listings: ctx.listings,
      gradeMap: toGradeMapStrict(ctx.gradeMap),
    });

    return {
      actions: this.adGradeRules.calcActions({
        adGroups: ctx.adGroups,
        listings: ctx.listings,
        gradeMap: ctx.gradeMap,
        profitRateByListing: ctx.profitRateByListing,
        channelStateByListing: ctx.channelStateByListing,
      }),
      issues: this.adGradeRules.calcAdIssues({
        adGroups: ctx.adIssuesAdGroups,
        listings: ctx.listings,
        gradeMap: ctx.gradeMap,
      }),
      tierAnalysis: this.adBudgetAllocator.calcTierAnalysis({
        listings: ctx.listings,
        adGroups: ctx.adGroups,
      }),
      top20: this.adBudgetAllocator.calcTop20({
        listings: ctx.listings,
        adGroups: ctx.adGroups,
      }),
      week: getWeekRange(period),
    } satisfies AdWeeklyPlan;
  }

  /** AI agent 로 보강한 주간 플랜. agent 미정의/실패 시 원본 그대로 (graceful). */
  async getAiEnhancedPlan(
    period: '7d' | '14d' | 'month',
    companyId: string,
  ): Promise<AdWeeklyPlan> {
    const plan = await this.getWeeklyPlan(period, companyId);
    const enhancedActions = await this.adRecommend.enhanceActionsWithAi(
      plan.actions,
      companyId,
    );
    return { ...plan, actions: enhancedActions } satisfies AdWeeklyPlan;
  }

  /**
   * urgent/high 만 필터 → 상위 20 → recommendation 카드. 계산기 기반 —
   * agent task 의존 없음 (B2b 복원).
   */
  async getRecommendations(companyId: string): Promise<AdStrategyRecommendation[]> {
    const actions = await this.buildActions(companyId);
    return toRecommendationCards(actions);
  }

  /** Exposure analysis — ad aggregate + review + traffic + leadTime hydrate 후 ad-exposure 위임. */
  async getExposureAnalysis(companyId: string): Promise<ExposureAnalysisData> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [adAggAll, reviewAgg, recentReviewAgg] = await Promise.all([
      this.prisma.channelListingDailySnapshot.groupBy({
        by: ['listingId'],
        where: { companyId },
        _sum: {
          adSpend: true,
          adRevenue: true,
          adClicks: true,
          adImpressions: true,
          adConversions: true,
        },
      }),
      this.prisma.review.groupBy({
        by: ['listingId'],
        where: { companyId, listingId: { not: null } },
        _count: { id: true },
        _avg: { rating: true },
      }),
      this.prisma.review.groupBy({
        by: ['listingId'],
        where: {
          companyId,
          listingId: { not: null },
          reviewedAt: { gte: thirtyDaysAgo },
        },
        _count: { id: true },
      }),
    ]);

    const listingIds = adAggAll
      .map((a) => a.listingId)
      .filter((id): id is string => id != null);

    if (listingIds.length === 0) {
      return { scores: [], urgentActions: [] } satisfies ExposureAnalysisData;
    }

    // Inclusive KST window: 14 businessDates split at the 7-day cutoff into
    // current (last 7d) vs prior (8..14d) windows for delta computation.
    const since14d = kstInclusiveDaysStart(14);
    const cutoff7d = kstInclusiveDaysStart(7);

    const [listings, trafficDailyRows, inventoryByOption, leadTimeByListing] =
      await Promise.all([
        hydrateListings(this.prisma, companyId, listingIds),
        this.prisma.channelListingDailySnapshot.findMany({
          where: {
            companyId,
            listingId: { in: listingIds },
            businessDate: { gte: since14d },
          },
          select: {
            listingId: true,
            businessDate: true,
            trafficRevenue: true,
            trafficOrders: true,
          },
        }),
        getInventorySnapshot(this.prisma, companyId, listingIds),
        loadLeadTimeByListing(this.prisma, companyId, listingIds),
      ]);

    const adGroups = toAdAggregateRows(adAggAll);
    const metricsResult = this.adBudgetAllocator.calcSnapshotKeyMetrics({
      snapshots: adAggregatesToMetricSnapshots(adGroups),
      listings,
    });

    const reviewMap = new Map(
      reviewAgg.map((r) => [
        r.listingId!,
        {
          totalReviews: r._count.id,
          avgRating: r._avg.rating != null ? Number(r._avg.rating) : 0,
        },
      ]),
    );
    const recentReviewMap = new Map(
      recentReviewAgg.map((r) => [r.listingId!, r._count.id]),
    );

    const trafficByListing = new Map<
      string,
      { rev: number; prevRev: number; orders: number }
    >();
    for (const row of trafficDailyRows) {
      const isCurrent = row.businessDate >= cutoff7d;
      const slot = trafficByListing.get(row.listingId) ?? {
        rev: 0,
        prevRev: 0,
        orders: 0,
      };
      if (isCurrent) {
        slot.rev += row.trafficRevenue;
        slot.orders += row.trafficOrders;
      } else {
        slot.prevRev += row.trafficRevenue;
      }
      trafficByListing.set(row.listingId, slot);
    }
    const maxT14 = Math.max(
      1,
      ...[...trafficByListing.values()].map((t) => t.rev),
    );

    const primaryOptionByListing = firstOptionByListing(inventoryByOption);

    const scores: ExposureProductScore[] = [];
    for (const listing of listings) {
      const optionId = primaryOptionByListing.get(listing.id);
      const inv = optionId ? (inventoryByOption.get(optionId) ?? null) : null;
      const listingStock = sumListingStock(inventoryByOption, listing.id);
      const profitRate = computeListingProfitRate(inv);
      const leadTime = leadTimeByListing.get(listing.id) ?? null;
      const traffic = trafficByListing.get(listing.id) ?? { rev: 0, prevRev: 0, orders: 0 };
      const metrics = metricsResult.perListing.get(listing.id) ?? emptyMetrics(listing.id);

      scores.push(
        this.adExposure.calculateScores({
          listing,
          metrics,
          inventory: inv
            ? { ...inv, availableStock: listingStock }
            : null,
          reviewStats: {
            totalReviews: reviewMap.get(listing.id)?.totalReviews ?? 0,
            recentReviews: recentReviewMap.get(listing.id) ?? 0,
            avgRating: reviewMap.get(listing.id)?.avgRating ?? 0,
          },
          trafficContext: {
            maxT14,
            t14Rev: traffic.rev,
            t14PrevRev: traffic.prevRev,
            t14Orders: traffic.orders,
          },
          fulfillmentContext: { leadTime, profitRate },
        }),
      );
    }

    return this.adExposure.assembleExposureData(scores);
  }

  /**
   * 캠페인 등록 — listing IDOR guard + 중복 차단 + AdAction + ExecutionTask 생성.
   *
   * Write use case kept inside the service because it carries the
   * IDOR / duplicate / task creation invariants. The `agentRegistry`
   * dependency is intentionally retained even though this method does not
   * call it: it is reserved for the campaign approval lifecycle hooks that
   * other services (ad-recommend) depend on through this service.
   */
  async registerCampaign(
    dto: RegisterCampaignDto,
    companyId: string,
  ): Promise<{ ok: true; actionId: string; taskId: string | null }> {
    void this.agentRegistry; // referenced to keep DI parity

    // 1. listingId 검증 (per-item IDOR guard)
    for (const listing of dto.listings) {
      const found = await this.prisma.channelListing.findFirst({
        where: { id: listing.listingId, companyId, isDeleted: false },
        select: { id: true },
      });
      if (!found) {
        throw new NotFoundException(
          `Listing ${listing.listingId} not found or not yours`,
        );
      }
    }

    // 2. 중복 캠페인 체크
    const existing = await this.prisma.adAction.findFirst({
      where: {
        companyId,
        actionType: 'create_campaign',
        targetLabel: dto.campaignName,
        executeStatus: { in: ['queued', 'running', 'done'] },
      },
      select: { id: true, executeStatus: true },
    });
    if (existing) {
      throw new ConflictException(
        `캠페인 '${dto.campaignName}'이 이미 ${existing.executeStatus === 'done' ? '등록 완료' : '등록 진행 중'}입니다. (ActionID: ${existing.id})`,
      );
    }

    const priority: Priority = dto.grade === 'A' ? 'high' : dto.grade === 'B' ? 'medium' : 'low';

    const payload = {
      campaignName: dto.campaignName,
      adGroupName: dto.adGroupName,
      grade: dto.grade,
      goalType: 'SALES',
      dailyBudget: dto.dailyBudget,
      operationMode: dto.operationMode,
      listings: dto.listings as unknown as Prisma.InputJsonValue,
      smartTargetingBid: dto.smartTargetingBid ?? null,
      keywords: (dto.keywords ?? []) as unknown as Prisma.InputJsonValue,
      nonSearchBid: dto.nonSearchBid ?? null,
      targetRoas: dto.targetRoas ?? null,
      pageType: 'campaign_registration',
    } satisfies Prisma.InputJsonObject;

    const action = await this.prisma.adAction.create({
      data: {
        companyId,
        actionType: 'create_campaign',
        targetType: 'campaign',
        targetLabel: dto.campaignName,
        reason: `${dto.grade}등급 전략 기반 캠페인 등록`,
        priority,
        approvalStatus: 'approved',
        executeStatus: 'queued',
        payload,
        executionTasks: {
          create: { status: 'queued' },
        },
      },
      include: { executionTasks: true },
    });

    return {
      ok: true,
      actionId: action.id,
      taskId: (action.executionTasks as { id: string }[])[0]?.id ?? null,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // PRIVATE
  // ─────────────────────────────────────────────────────────────

  /** getRules / getRecommendations 공통 — strategy context hydrate 후 rule 평가. */
  private async buildActions(companyId: string): Promise<AdStrategyAction[]> {
    const { year, month } = getCurrentPeriod();
    const ctx = await loadStrategyContext(
      this.prisma,
      this.adConfigService,
      companyId,
      year,
      month,
    );
    return this.adGradeRules.calcActions({
      adGroups: ctx.adGroups,
      listings: ctx.listings,
      gradeMap: ctx.gradeMap,
      profitRateByListing: ctx.profitRateByListing,
      channelStateByListing: ctx.channelStateByListing,
    });
  }
}
