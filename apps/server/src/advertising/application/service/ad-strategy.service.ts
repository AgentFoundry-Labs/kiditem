import {
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { kstInclusiveDaysStart } from '../../../common/kst';
import { AdConfigService } from './ad-config.service';
import { AdGradeRulesService } from './ad-grade-rules.service';
import { AdBudgetAllocatorService } from './ad-budget-allocator.service';
import { AdExposureService } from './ad-exposure.service';
import { AdRecommendService } from './ad-recommend.service';
import type { RegisterCampaignDto } from '../../adapter/in/http/dto/register-campaign.dto';
import {
  adAggregatesToMetricSnapshots,
  computeListingProfitRate,
  emptyMetrics,
  firstOptionByListing,
  getCurrentPeriod,
  getWeekRange,
  sumListingStock,
  toGradeMapStrict,
} from '../../domain/strategy-context';
import type { AdAggregateRow } from '../../domain/model/strategy-types';
import {
  AD_STRATEGY_CONTEXT_REPOSITORY_PORT,
  type AdStrategyContextRepositoryPort,
  type AllTimeAdAggregateRow,
} from '../port/out/ad-strategy-context.repository.port';
import {
  AD_ACCOUNT_KPI_REPOSITORY_PORT,
  type AdAccountKpiRepositoryPort,
} from '../port/out/ad-account-kpi.repository.port';
import {
  AD_LISTING_REPOSITORY_PORT,
  type AdListingRepositoryPort,
} from '../port/out/ad-listing.repository.port';
import {
  AD_ACTION_REPOSITORY_PORT,
  type AdActionRepositoryPort,
} from '../port/out/ad-action.repository.port';
import {
  toAdRulesData,
  toRecommendationCards,
} from '../../mapper/ad-strategy.mapper';
import { toAdAccountKpi } from '../../mapper/ad-campaign.mapper';
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
 * evaluation, mapping) lives in `domain/`, `adapter/out/repository/`, `mapper/`,
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
    @Inject(AD_STRATEGY_CONTEXT_REPOSITORY_PORT)
    private readonly strategyContextRepo: AdStrategyContextRepositoryPort,
    @Inject(AD_ACCOUNT_KPI_REPOSITORY_PORT)
    private readonly accountKpiRepo: AdAccountKpiRepositoryPort,
    @Inject(AD_LISTING_REPOSITORY_PORT)
    private readonly listingRepo: AdListingRepositoryPort,
    @Inject(AD_ACTION_REPOSITORY_PORT)
    private readonly actionRepo: AdActionRepositoryPort,
    private readonly adConfigService: AdConfigService,
    private readonly adGradeRules: AdGradeRulesService,
    private readonly adBudgetAllocator: AdBudgetAllocatorService,
    private readonly adExposure: AdExposureService,
    private readonly adRecommend: AdRecommendService,
  ) {}

  // ───── PUBLIC API (6 endpoints) ─────

  /** ABC 등급 규칙 기반 recommendations + 요약. */
  async getRules(
    _period: '7d' | '14d' | 'month',
    organizationId: string,
  ): Promise<AdRulesData> {
    const recommendations = await this.buildActions(organizationId);
    return toAdRulesData(recommendations);
  }

  /** 주간 액션 플랜 — strategy context 한 번 hydrate 후 4 sub-service 조립. */
  async getWeeklyPlan(
    period: '7d' | '14d' | 'month',
    organizationId: string,
  ): Promise<AdWeeklyPlan> {
    const { year, month } = getCurrentPeriod();
    const config = await this.adConfigService.getConfig(organizationId);
    const [ctx, accountKpiRows] = await Promise.all([
      this.strategyContextRepo.loadStrategyContext(
        organizationId,
        year,
        month,
        config,
      ),
      this.accountKpiRepo.findCoupangAdsDaily(organizationId, period),
    ]);

    // calcBudgetAllocation 은 AdWeeklyPlan shape 에 노출되진 않지만
    // adConfig.getConfig 부작용 (seed) 보존을 위해 호출해 둔다.
    this.adBudgetAllocator.calcBudgetAllocation({
      config: ctx.config,
      adGroups: ctx.adGroups,
      listings: ctx.listings,
      gradeMap: toGradeMapStrict(ctx.gradeMap),
    });

    const top20 = this.adBudgetAllocator.calcTop20({
      listings: ctx.listings,
      adGroups: ctx.adGroups,
      trafficByListing: ctx.trafficByListing,
    });
    const account = toAdAccountKpi(accountKpiRows);

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
      top20,
      accountSummary: account.summary,
      week: getWeekRange(period),
    } satisfies AdWeeklyPlan;
  }

  /** AI agent 로 보강한 주간 플랜. agent 미정의/실패 시 원본 그대로 (graceful). */
  async getAiEnhancedPlan(
    period: '7d' | '14d' | 'month',
    organizationId: string,
  ): Promise<AdWeeklyPlan> {
    const plan = await this.getWeeklyPlan(period, organizationId);
    const enhancedActions = await this.adRecommend.enhanceActionsWithAi(
      plan.actions,
      organizationId,
    );
    return { ...plan, actions: enhancedActions } satisfies AdWeeklyPlan;
  }

  /**
   * urgent/high 만 필터 → 상위 20 → recommendation 카드. 계산기 기반 —
   * agent task 의존 없음 (B2b 복원).
   */
  async getRecommendations(organizationId: string): Promise<AdStrategyRecommendation[]> {
    const actions = await this.buildActions(organizationId);
    return toRecommendationCards(actions);
  }

  /** Exposure analysis — ad aggregate + review + traffic + leadTime hydrate 후 ad-exposure 위임. */
  async getExposureAnalysis(organizationId: string): Promise<ExposureAnalysisData> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const adAggAll =
      await this.strategyContextRepo.loadAllTimeAdAggregates(organizationId);

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

    const [exposureCtx, listings, inventoryByOption, leadTimeByListing] =
      await Promise.all([
        this.strategyContextRepo.loadExposureAnalysisContext(
          organizationId,
          listingIds,
          { recentReviewSince: thirtyDaysAgo, trafficSince: since14d },
        ),
        this.strategyContextRepo.hydrateListings(organizationId, listingIds),
        this.strategyContextRepo.getInventorySnapshot(
          organizationId,
          listingIds,
        ),
        this.strategyContextRepo.loadLeadTimeByListing(
          organizationId,
          listingIds,
        ),
      ]);

    const adGroups = toAdAggregateRowsFromPort(adAggAll);
    const metricsResult = this.adBudgetAllocator.calcSnapshotKeyMetrics({
      snapshots: adAggregatesToMetricSnapshots(adGroups),
      listings,
    });

    const reviewMap = new Map(
      exposureCtx.reviewStats.map((r) => [
        r.listingId,
        {
          totalReviews: r.totalReviews,
          avgRating: r.avgRating,
        },
      ]),
    );
    const recentReviewMap = new Map(
      exposureCtx.recentReviewCounts.map((r) => [r.listingId, r.count]),
    );

    const trafficByListing = new Map<
      string,
      { rev: number; prevRev: number; orders: number }
    >();
    for (const row of exposureCtx.trafficDailyRows) {
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
   * IDOR / duplicate / task creation invariants. Agent execution for the
   * resulting tasks is handled out-of-band by `AdStrategyAgentService`
   * through the automation `AGENT_RUNNER_PORT`; this service no longer
   * touches the Agent OS facade directly.
   */
  async registerCampaign(
    dto: RegisterCampaignDto,
    organizationId: string,
  ): Promise<{ ok: true; actionId: string; taskId: string | null }> {
    // 1. listingId 검증 (per-item IDOR guard)
    for (const listing of dto.listings) {
      const owned = await this.listingRepo.verifyListingOwnership(
        listing.listingId,
        organizationId,
      );
      if (!owned) {
        throw new NotFoundException(
          `Listing ${listing.listingId} not found or not yours`,
        );
      }
    }

    // 2. 중복 캠페인 체크
    const existing = await this.actionRepo.findOpenCreateCampaignAction(
      organizationId,
      dto.campaignName,
    );
    if (existing) {
      throw new ConflictException(
        `캠페인 '${dto.campaignName}'이 이미 ${existing.executeStatus === 'done' ? '등록 완료' : '등록 진행 중'}입니다. (ActionID: ${existing.id})`,
      );
    }

    const priority: Priority = dto.grade === 'A' ? 'high' : dto.grade === 'B' ? 'medium' : 'low';

    const payload: Record<string, unknown> = {
      campaignName: dto.campaignName,
      adGroupName: dto.adGroupName,
      grade: dto.grade,
      goalType: 'SALES',
      dailyBudget: dto.dailyBudget,
      operationMode: dto.operationMode,
      listings: dto.listings,
      smartTargetingBid: dto.smartTargetingBid ?? null,
      keywords: dto.keywords ?? [],
      nonSearchBid: dto.nonSearchBid ?? null,
      targetRoas: dto.targetRoas ?? null,
      pageType: 'campaign_registration',
    };

    const { actionId, taskId } =
      await this.actionRepo.createCampaignActionWithTask({
        organizationId,
        campaignName: dto.campaignName,
        priority,
        reason: `${dto.grade}등급 전략 기반 캠페인 등록`,
        payload,
      });

    return {
      ok: true,
      actionId,
      taskId,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // PRIVATE
  // ─────────────────────────────────────────────────────────────

  /** getRules / getRecommendations 공통 — strategy context hydrate 후 rule 평가. */
  private async buildActions(organizationId: string): Promise<AdStrategyAction[]> {
    const { year, month } = getCurrentPeriod();
    const config = await this.adConfigService.getConfig(organizationId);
    const ctx = await this.strategyContextRepo.loadStrategyContext(
      organizationId,
      year,
      month,
      config,
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

/**
 * Map the port's all-time aggregate shape into the domain `AdAggregateRow`
 * shape used by metric snapshot/budget allocator inputs. The port already
 * normalizes the Prisma `_sum` envelope away; this helper drops null
 * `listingId` rows and forwards the additive metrics 1:1.
 */
function toAdAggregateRowsFromPort(
  rows: AllTimeAdAggregateRow[],
): AdAggregateRow[] {
  const out: AdAggregateRow[] = [];
  for (const r of rows) {
    if (!r.listingId) continue;
    out.push({
      listingId: r.listingId,
      spend: r.spend,
      revenue: r.revenue,
      clicks: r.clicks,
      impressions: r.impressions,
      conversions: r.conversions,
    });
  }
  return out;
}
