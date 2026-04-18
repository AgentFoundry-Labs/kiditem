import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentRegistryService } from '../../agent-registry/agent-registry.service';
import { AdConfigService } from './ad-config.service';
import { AdGradeRulesService } from './ad-grade-rules.service';
import { AdBudgetAllocatorService } from './ad-budget-allocator.service';
import { AdExposureService } from './ad-exposure.service';
import { AdRecommendService } from './ad-recommend.service';
import type { RegisterCampaignDto } from '../dto/register-campaign.dto';
import type {
  AdAggregateRow,
  AdsConfig,
  HydratedListing,
  InventoryRow,
  ListingMetricsRow,
} from './types';
import {
  getCurrentPeriod,
  getInventorySnapshot,
  getWeekRange,
  hydrateListings,
} from './util/ad-strategy-helpers';
import type {
  AdRulesData,
  AdStrategyAction,
  AdStrategyRecommendation,
  AdWeeklyPlan,
  ExposureAnalysisData,
  ExposureProductScore,
} from '@kiditem/shared';

type Priority = 'urgent' | 'high' | 'medium' | 'low';

/**
 * Orchestrator — 6 public endpoint 당 Promise.all fetch 후 sub-service 로 delegation.
 * Plan B2b.refactor T7. Prisma 호출은 본 service 에만, sub-service 는 pure calculator.
 * 응답 shape / threshold / 계산 결과 동일성 보장 (registerCampaign 은 완전 보존).
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

  /** ABC 등급 규칙 기반 recommendations + 요약 — ad-grade-rules 위임. */
  async getRules(
    _period: '7d' | '14d' | 'month',
    companyId: string,
  ): Promise<AdRulesData> {
    const recommendations = await this.buildActions(companyId);
    return {
      recommendations,
      summary: {
        totalActions: recommendations.length,
        urgentCount: recommendations.filter((a) => a.priority === 'urgent').length,
      },
    } satisfies AdRulesData;
  }

  /** 주간 액션 플랜 — loadStrategyContext Promise.all batch 후 4 sub-service 조립. */
  async getWeeklyPlan(
    period: '7d' | '14d' | 'month',
    companyId: string,
  ): Promise<AdWeeklyPlan> {
    const { year, month } = getCurrentPeriod();
    const ctx = await this.loadStrategyContext(companyId, year, month);

    // calcBudgetAllocation 은 AdWeeklyPlan shape 에 없지만 adConfig.getConfig 부작용 (seed) 보존용 호출.
    this.adBudgetAllocator.calcBudgetAllocation({
      config: ctx.config,
      adGroups: ctx.adGroups,
      listings: ctx.listings,
      gradeMap: ctx.gradeMap,
    });

    return {
      actions: this.adGradeRules.calcActions({
        snapshots: ctx.snapshots,
        listings: ctx.listings,
        inventory: ctx.inventory,
        gradeMap: ctx.gradeMap,
      }),
      issues: this.adGradeRules.calcAdIssues({
        adGroups: ctx.adGroups,
        listings: ctx.listings,
        gradeMap: ctx.gradeMap,
      }),
      tierAnalysis: this.adBudgetAllocator.calcTierAnalysis({
        listings: ctx.listings,
        adGroups: ctx.adGroups,
      }),
      top20: this.adBudgetAllocator.calcTop20({
        profitLosses: ctx.profitLosses,
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

  /** AI agent 최신 결과 → 추천 카드. task 없으면 빈 배열. */
  async getRecommendations(companyId: string): Promise<AdStrategyRecommendation[]> {
    const task = await this.prisma.agentTask.findFirst({
      where: { companyId, agentType: 'ad_strategy', status: 'succeeded' },
      orderBy: { completedAt: 'desc' },
      select: { output: true },
    });
    return this.adRecommend.toRecommendations(task?.output ?? null);
  }

  /** Exposure analysis — ad aggregate + review + traffic + leadTime 흡수 후 ad-exposure 위임. */
  async getExposureAnalysis(companyId: string): Promise<ExposureAnalysisData> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Promise.all 통합 fetch — adGroups + review aggregate (전체+최근 30d) 한 번에.
    const [adAgg, reviewAgg, recentReviewAgg] = await Promise.all([
      this.prisma.ad.groupBy({
        by: ['listingId'],
        where: { companyId },
        _sum: {
          spend: true,
          revenue: true,
          clicks: true,
          impressions: true,
          conversions: true,
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

    const listingIds = adAgg
      .map((a) => a.listingId)
      .filter((id): id is string => id != null);

    if (listingIds.length === 0) {
      return { scores: [], urgentActions: [] } satisfies ExposureAnalysisData;
    }

    // listings + trafficStats + inventoryByListing 을 병렬로 fetch.
    const [listings, trafficStats, inventoryByOption, leadTimeByListing] = await Promise.all([
      hydrateListings(this.prisma, companyId, listingIds),
      this.prisma.trafficStats.findMany({
        where: { companyId, listingId: { in: listingIds }, periodDays: 14 },
        orderBy: { date: 'desc' },
        select: { listingId: true, revenue: true, orders: true, date: true },
      }),
      getInventorySnapshot(this.prisma, companyId, listingIds),
      this.loadLeadTimeByListing(companyId, listingIds),
    ]);

    const adGroups = toAdAggregateRows(adAgg);
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

    // traffic aggregate: 최신 period 를 rev, 직전 period 를 prevRev 로 (원본 line 248-256).
    const trafficByListing = new Map<string, { rev: number; prevRev: number; orders: number }>();
    for (const t of trafficStats) {
      const cur = trafficByListing.get(t.listingId);
      if (!cur) {
        trafficByListing.set(t.listingId, { rev: t.revenue, prevRev: 0, orders: t.orders });
      } else if (cur.prevRev === 0) {
        cur.prevRev = t.revenue;
      }
    }
    const maxT14 = Math.max(1, ...[...trafficByListing.values()].map((t) => t.rev));

    // listingId → 첫번째 optionId 매핑 (score/profitRate 계산에 primary option 사용).
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
   * 기존 line 373-446 본문 완전 보존 (sub-service 이관 대상 아님).
   */
  async registerCampaign(
    dto: RegisterCampaignDto,
    companyId: string,
  ): Promise<{ ok: true; actionId: string; taskId: string | null }> {
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
  // PRIVATE — orchestration helpers
  // ─────────────────────────────────────────────────────────────

  /** getRules / getAiEnhancedPlan 공통 — snapshots hydrate 후 rule 평가. */
  private async buildActions(companyId: string): Promise<AdStrategyAction[]> {
    const snapshots = await this.fetchRuleSnapshots(companyId);
    const listingIds = uniqueIds(snapshots.map((s) => s.listingId));
    if (listingIds.length === 0) return [];
    const [listings, inventory] = await Promise.all([
      hydrateListings(this.prisma, companyId, listingIds),
      getInventorySnapshot(this.prisma, companyId, listingIds),
    ]);
    return this.adGradeRules.calcActions({
      snapshots,
      listings,
      inventory,
      gradeMap: buildGradeMap(listings),
    });
  }

  /**
   * getWeeklyPlan 컨텍스트 — 6 sub-service 가 요구하는 hydrated context 를 Promise.all batch.
   * 빈 회사여도 빈 context 로 통과 (sub-service 는 빈 입력 허용).
   */
  private async loadStrategyContext(companyId: string, year: number, month: number) {
    const [snapshots, adAgg, config] = await Promise.all([
      this.fetchRuleSnapshots(companyId),
      this.prisma.ad.groupBy({
        by: ['listingId'],
        where: { companyId },
        _sum: { spend: true, revenue: true, clicks: true, impressions: true, conversions: true },
      }),
      this.adConfigService.getConfig(companyId),
    ]);
    const listingIds = uniqueIds([
      ...snapshots.map((s) => s.listingId),
      ...adAgg.map((a) => a.listingId),
    ]);
    const [listings, inventory, profitLossRows] = await Promise.all([
      hydrateListings(this.prisma, companyId, listingIds),
      getInventorySnapshot(this.prisma, companyId, listingIds),
      this.prisma.profitLoss.findMany({
        where: { companyId, year, month, listingId: { in: listingIds } },
        select: { listingId: true, netProfit: true, profitRate: true },
      }),
    ]);
    // Prisma netProfit → Top20Input.profitLosses.profit 로 remap (T1 type 경계 준수).
    const profitLosses = profitLossRows.map((pl) => ({
      listingId: pl.listingId as string | null,
      profit: pl.netProfit as number | null,
      profitRate: pl.profitRate,
    }));
    return {
      snapshots,
      adGroups: toAdAggregateRows(adAgg),
      listings,
      inventory,
      profitLosses,
      gradeMap: buildGradeMap(listings),
      config: config satisfies AdsConfig,
    };
  }

  /** coupang_ads source 의 campaign/keyword snapshot 만 rule 평가 대상. */
  private fetchRuleSnapshots(companyId: string) {
    return this.prisma.adSnapshot.findMany({
      where: {
        companyId,
        source: 'coupang_ads',
        pageType: { in: ['campaign', 'keyword'] },
      },
      select: {
        id: true,
        listingId: true,
        optionId: true,
        pageType: true,
        externalId: true,
        campaignName: true,
        status: true,
        spend: true,
        impressions: true,
        clicks: true,
        conversions: true,
        revenue: true,
        roas: true,
        dailyBudget: true,
        currentBid: true,
      },
    });
  }

  /** getExposureAnalysis 전용 — listing 당 최소 leadTimeDays. */
  private async loadLeadTimeByListing(
    companyId: string,
    listingIds: string[],
  ): Promise<Map<string, number | null>> {
    const map = new Map<string, number | null>();
    if (listingIds.length === 0) return map;
    const rows = await this.prisma.channelListingOption.findMany({
      where: { companyId, listingId: { in: listingIds }, isActive: true },
      select: {
        listingId: true,
        option: { select: { inventory: { select: { leadTimeDays: true } } } },
      },
    });
    for (const r of rows) {
      const lt = r.option?.inventory?.leadTimeDays ?? null;
      const cur = map.get(r.listingId) ?? null;
      if (lt != null && (cur == null || lt < cur)) map.set(r.listingId, lt);
      else if (!map.has(r.listingId)) map.set(r.listingId, cur);
    }
    return map;
  }

}

// ─────────────────────────────────────────────────────────────
// Module-private pure helpers (테스트 용 export 는 불필요 — sub-service 가 담당)
// ─────────────────────────────────────────────────────────────

/** listingIds (중복 + null 허용) → 유일한 listingId 배열. */
function uniqueIds(ids: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const id of ids) if (id) set.add(id);
  return [...set];
}

/** HydratedListing[] → listingId → ABC grade. null 은 skip. */
function buildGradeMap(listings: HydratedListing[]): Map<string, 'A' | 'B' | 'C'> {
  const map = new Map<string, 'A' | 'B' | 'C'>();
  for (const l of listings) {
    const g = l.masterProduct.abcGrade;
    if (g === 'A' || g === 'B' || g === 'C') map.set(l.id, g);
  }
  return map;
}

/** prisma.ad.groupBy 결과 → AdAggregateRow[]. listingId null 은 drop. */
function toAdAggregateRows(
  rows: Array<{
    listingId: string | null;
    _sum: {
      spend: number | null;
      revenue: number | null;
      clicks: number | null;
      impressions: number | null;
      conversions: number | null;
    };
  }>,
): AdAggregateRow[] {
  const out: AdAggregateRow[] = [];
  for (const r of rows) {
    if (!r.listingId) continue;
    out.push({
      listingId: r.listingId,
      spend: r._sum.spend ?? 0,
      revenue: r._sum.revenue ?? 0,
      clicks: r._sum.clicks ?? 0,
      impressions: r._sum.impressions ?? 0,
      conversions: r._sum.conversions ?? 0,
    });
  }
  return out;
}

/** AdAggregateRow → calcSnapshotKeyMetrics 가 기대하는 flat snapshot shape. */
function adAggregatesToMetricSnapshots(adGroups: AdAggregateRow[]) {
  return adGroups.map((g) => ({
    listingId: g.listingId,
    spend: g.spend,
    revenue: g.revenue,
    clicks: g.clicks,
    impressions: g.impressions,
    conversions: g.conversions,
  }));
}

/** InventoryRow map → listingId → 첫 optionId (primary option). */
function firstOptionByListing(inventory: Map<string, InventoryRow>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [optionId, row] of inventory) {
    if (!map.has(row.listingId)) map.set(row.listingId, optionId);
  }
  return map;
}

/** 단일 listing 에 속한 모든 option 의 availableStock 합. */
function sumListingStock(inventory: Map<string, InventoryRow>, listingId: string): number {
  let total = 0;
  for (const row of inventory.values()) {
    if (row.listingId === listingId) total += row.availableStock;
  }
  return total;
}

/**
 * primary option profitRate (% 스케일). 원본 line 78-88 의 calcOptionProfitRate 와 정합 —
 * ad-grade-rules 의 0~1 ratio 와 달리 여기선 × 100 후 round.
 */
function computeListingProfitRate(inv: InventoryRow | null): number {
  if (!inv) return 0;
  const cost = inv.costPrice ?? 0;
  const sell = inv.sellPrice ?? 0;
  if (sell <= 0) return 0;
  const commission = inv.commissionRate != null ? Number(inv.commissionRate) : 0;
  return Math.round(((sell - cost - sell * commission) / sell) * 100);
}

/** Zero-metrics row for listings without ad snapshots. */
function emptyMetrics(listingId: string): ListingMetricsRow {
  return {
    listingId,
    metrics: {
      spend: 0,
      revenue: 0,
      clicks: 0,
      impressions: 0,
      conversions: 0,
      ctr: null,
      roas: null,
      cvr: null,
    },
  } satisfies ListingMetricsRow;
}
