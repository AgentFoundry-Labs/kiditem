import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentRegistryService } from '../../agent-registry/agent-registry.service';
import { buildPerListingMetrics } from '../../common/per-listing-profit';
import { kstInclusiveDaysStart, kstMonthStart } from '../../common/kst';
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
import type { AdRulesData, AdStrategyAction, AdStrategyRecommendation, AdWeeklyPlan, ChannelStateSignal, ExposureAnalysisData, ExposureProductScore } from '@kiditem/shared/advertising';

type Priority = 'urgent' | 'high' | 'medium' | 'low';

/**
 * Orchestrator — 6 public endpoint 당 Promise.all fetch 후 sub-service 로 delegation.
 * Plan B2b.refactor T7 + T7-fix. Prisma 호출은 본 service 에만, sub-service 는 pure calculator.
 * B2b (commit 2c17850) 동작 완전 보존 — 응답 shape / threshold / 계산 결과 동일.
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

  private resolveMonthWindow(year: number, month: number) {
    return {
      from: kstMonthStart(year, month),
      to: kstMonthStart(year, month + 1),
    };
  }

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
   * calcActions 결과에서 urgent/high 만 필터 → 상위 20 → recommendation 카드.
   *
   * B2b 원본 (commit 2c17850) line 180-197 의 `getRecommendations` 본문 복원.
   * 계산기 기반 — agent task 의존 없음.
   */
  async getRecommendations(companyId: string): Promise<AdStrategyRecommendation[]> {
    const actions = await this.buildActions(companyId);
    return actions
      .filter((a) => a.priority === 'urgent' || a.priority === 'high')
      .slice(0, 20)
      .map(
        (a) =>
          ({
            listing: a.listing,
            grade: a.grade,
            title: a.actionType,
            body: a.reason,
            priority: a.priority,
          }) satisfies AdStrategyRecommendation,
      );
  }

  /** Exposure analysis — ad aggregate + review + traffic + leadTime 흡수 후 ad-exposure 위임. */
  async getExposureAnalysis(companyId: string): Promise<ExposureAnalysisData> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Ad aggregate sums per-listing additive ad metrics across all daily
    // facts (lifetime aggregate per listing).
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

    // Traffic aggregation reads `ChannelListingDailySnapshot` filtered by
    // businessDate. Two windows:
    //   - last 7 businessDates → "current period"
    //   - businessDates 8..14 ago → "prior period" (used for delta)
    // KST day start — period cutoff anchored at Asia/Seoul midnight (Docker prod runs UTC)
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
        this.loadLeadTimeByListing(companyId, listingIds),
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

    // Aggregate listing daily rows into current(0..7) / prior(8..14) windows.
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

  /**
   * getRules / getRecommendations 공통 — adGroups(listing-level) hydrate 후 rule 평가.
   *
   * B2b 원본 calcActions (line 653-938) 의 fetch 부분과 정합:
   *  - ChannelListingDailySnapshot.groupBy(['listingId']) 전체 기간 aggregate
   *  - listingIds + current month live metrics 병렬 hydrate
   *  - ad-grade-rules.calcActions 에 adGroups + listings + gradeMap + profitRate 전달
   */
  private async buildActions(companyId: string): Promise<AdStrategyAction[]> {
    const { year, month } = getCurrentPeriod();
    const ctx = await this.loadStrategyContext(companyId, year, month);
    return this.adGradeRules.calcActions({
      adGroups: ctx.adGroups,
      listings: ctx.listings,
      gradeMap: ctx.gradeMap,
      profitRateByListing: ctx.profitRateByListing,
      channelStateByListing: ctx.channelStateByListing,
    });
  }

  /**
   * getWeeklyPlan 컨텍스트 — sub-service 가 요구하는 hydrated context 를 Promise.all batch.
   *
   * calcActions 대상: 전체 기간 ad aggregate.
   * calcAdIssues 대상: 최근 14 일 ad aggregate (B2b 원본 line 955-963).
   * live metrics: 현재 year/month 기준 listing 별 profitRate percentage.
   */
  private async loadStrategyContext(companyId: string, year: number, month: number) {
    const since14d = kstInclusiveDaysStart(14);

    // Aggregate from `ChannelListingDailySnapshot`.
    // Lifetime = all rows for the company; 14-day = rows since the cutoff
    // businessDate. Provider ratios in `metaJson` are NOT consulted; ratios
    // recompute downstream from these additive sums.
    const [adAggAll, adAgg14d, config] = await Promise.all([
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
      this.prisma.channelListingDailySnapshot.groupBy({
        by: ['listingId'],
        where: { companyId, businessDate: { gte: since14d } },
        _sum: {
          adSpend: true,
          adRevenue: true,
          adClicks: true,
          adImpressions: true,
          adConversions: true,
        },
      }),
      this.adConfigService.getConfig(companyId),
    ]);

    const listingIds = uniqueIds([
      ...adAggAll.map((a) => a.listingId),
      ...adAgg14d.map((a) => a.listingId),
    ]);
    const listingIdSet = new Set(listingIds);
    const { from, to } = this.resolveMonthWindow(year, month);

    // Hydrate listings first so we can hand the channel-state loader an exact
    // primary-option list (avoids attaching the wrong option's daily snapshot).
    // Live profit metrics + channel state run in parallel after hydrate.
    const listings = await hydrateListings(this.prisma, companyId, listingIds);
    const [liveMetrics, channelStateByListing] = await Promise.all([
      listingIds.length === 0
        ? Promise.resolve([])
        : buildPerListingMetrics(this.prisma, companyId, from, to).then((rows) =>
            rows.filter((row) => listingIdSet.has(row.listingId)),
          ),
      this.loadChannelStateByListing(companyId, listings),
    ]);

    const profitRateByListing = new Map<string, number>(
      liveMetrics.map((metric) => [metric.listingId, metric.profitRate]),
    );

    return {
      adGroups: toAdAggregateRows(adAggAll),
      adIssuesAdGroups: toAdAggregateRows(adAgg14d),
      listings,
      profitRateByListing,
      channelStateByListing,
      gradeMap: buildGradeMap(listings),
      config: config satisfies AdsConfig,
    };
  }

  /**
   * Read the latest `ChannelListingDailySnapshot` per listing and the latest
   * `ChannelListingOptionDailySnapshot` for each listing's deterministic
   * hydrated primary option, hydrated into a `ChannelStateSignal` map keyed
   * by listingId. The map omits listings without any daily snapshot, so the
   * rule engine sees a real `null` (not stale state) and skips evidence
   * enrichment.
   *
   * Cross-domain note: `ChannelListing*DailySnapshot` are channels-namespace
   * Prisma models, but advertising owns the dual-write helper today (see
   * `apps/server/src/advertising/CLAUDE.md` "Cross-domain coupling
   * exception"). Reading them here via `PrismaService` keeps that boundary
   * intact — no `ChannelSyncService` inject.
   */
  private async loadChannelStateByListing(
    companyId: string,
    listings: HydratedListing[],
  ): Promise<Map<string, ChannelStateSignal>> {
    const map = new Map<string, ChannelStateSignal>();
    if (listings.length === 0) return map;

    const listingIds = listings.map((l) => l.id);
    // Strategy currently surfaces ONE option per listing — the same primary
    // option that hydrate picked. The option-daily query is filtered to those
    // ids so a noisy or stale "lowest listingOptionId" can't shadow the
    // primary option's daily evidence.
    const primaryListingOptionByListing = new Map<string, string>();
    for (const l of listings) {
      if (l.primaryOption) {
        primaryListingOptionByListing.set(l.id, l.primaryOption.listingOptionId);
      }
    }
    const primaryListingOptionIds = Array.from(
      primaryListingOptionByListing.values(),
    );

    type ListingDailyRow = {
      listingId: string;
      channel: string;
      externalId: string;
      businessDate: Date;
      lastObservedAt: Date;
      sampleCount: number;
      productName: string | null;
      status: string | null;
      exposureStatus: string | null;
      saleStatus: string | null;
      channelPrice: number | null;
      isOfferWinner: boolean | null;
      myPrice: number | null;
      winnerPrice: number | null;
      winnerGapPrice: number | null;
      productRank: number | null;
      categoryRank: number | null;
    };
    type OptionDailyRow = {
      listingId: string;
      listingOptionId: string;
      externalOptionId: string;
      businessDate: Date;
      optionName: string | null;
      saleStatus: string | null;
      isActive: boolean | null;
      salePrice: number | null;
      stockQty: number | null;
      isOfferWinner: boolean | null;
      myPrice: number | null;
      winnerPrice: number | null;
      winnerGapPrice: number | null;
    };

    // `DISTINCT ON` returns exactly one row per (listing_id) /
    // (listing_option_id) — the row with the newest `business_date` thanks to
    // the matching ORDER BY. This bounds the query to N rows for N listings
    // regardless of how much daily history has accumulated, and lets the
    // database do the dedup work instead of streaming everything to JS.
    const [listingDailies, optionDailies] = await Promise.all([
      this.prisma.$queryRaw<ListingDailyRow[]>(Prisma.sql`
        SELECT DISTINCT ON (listing_id)
          listing_id          AS "listingId",
          channel,
          external_id         AS "externalId",
          business_date       AS "businessDate",
          last_observed_at    AS "lastObservedAt",
          sample_count        AS "sampleCount",
          product_name        AS "productName",
          status,
          exposure_status     AS "exposureStatus",
          sale_status         AS "saleStatus",
          channel_price       AS "channelPrice",
          is_offer_winner     AS "isOfferWinner",
          my_price            AS "myPrice",
          winner_price        AS "winnerPrice",
          winner_gap_price    AS "winnerGapPrice",
          product_rank        AS "productRank",
          category_rank       AS "categoryRank"
        FROM channel_listing_daily_snapshots
        WHERE company_id = ${companyId}::uuid
          AND listing_id = ANY(${listingIds}::uuid[])
        -- Deterministic latest: business_date DESC, last_observed_at DESC, updated_at DESC, id DESC
        ORDER BY
          listing_id,
          business_date DESC,
          last_observed_at DESC NULLS LAST,
          updated_at DESC NULLS LAST,
          id DESC
      `),
      primaryListingOptionIds.length === 0
        ? Promise.resolve([] as OptionDailyRow[])
        : this.prisma.$queryRaw<OptionDailyRow[]>(Prisma.sql`
            SELECT DISTINCT ON (listing_option_id)
              listing_id           AS "listingId",
              listing_option_id    AS "listingOptionId",
              external_option_id   AS "externalOptionId",
              business_date        AS "businessDate",
              option_name          AS "optionName",
              sale_status          AS "saleStatus",
              is_active            AS "isActive",
              sale_price           AS "salePrice",
              stock_qty            AS "stockQty",
              is_offer_winner      AS "isOfferWinner",
              my_price             AS "myPrice",
              winner_price         AS "winnerPrice",
              winner_gap_price     AS "winnerGapPrice"
            FROM channel_listing_option_daily_snapshots
            WHERE company_id = ${companyId}::uuid
              AND listing_option_id = ANY(${primaryListingOptionIds}::uuid[])
            -- Deterministic latest: business_date DESC, last_observed_at DESC, updated_at DESC, id DESC
            ORDER BY
              listing_option_id,
              business_date DESC,
              last_observed_at DESC NULLS LAST,
              updated_at DESC NULLS LAST,
              id DESC
          `),
    ]);

    const optionByListing = new Map<string, OptionDailyRow>();
    for (const row of optionDailies) {
      // Each row already represents the latest day for a primary listingOption,
      // and we filtered the query by primary ids — so first wins per listing.
      if (!optionByListing.has(row.listingId)) {
        optionByListing.set(row.listingId, row);
      }
    }

    for (const ld of listingDailies) {
      const od = optionByListing.get(ld.listingId);
      const signal: ChannelStateSignal = {
        channel: ld.channel,
        externalId: ld.externalId,
        businessDate: ld.businessDate.toISOString().slice(0, 10),
        lastObservedAt: ld.lastObservedAt.toISOString(),
        sampleCount: ld.sampleCount,
        productName: ld.productName,
        status: ld.status,
        exposureStatus: ld.exposureStatus,
        saleStatus: ld.saleStatus,
        channelPrice: ld.channelPrice,
        isOfferWinner: ld.isOfferWinner,
        myPrice: ld.myPrice,
        winnerPrice: ld.winnerPrice,
        winnerGapPrice: ld.winnerGapPrice,
        productRank: ld.productRank,
        categoryRank: ld.categoryRank,
        primaryOption: od
          ? {
              listingOptionId: od.listingOptionId,
              externalOptionId: od.externalOptionId,
              optionName: od.optionName,
              saleStatus: od.saleStatus,
              isActive: od.isActive,
              salePrice: od.salePrice,
              stockQty: od.stockQty,
              isOfferWinner: od.isOfferWinner,
              myPrice: od.myPrice,
              winnerPrice: od.winnerPrice,
              winnerGapPrice: od.winnerGapPrice,
            }
          : null,
      };
      map.set(ld.listingId, signal);
    }

    return map;
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
        optionId: true,
      },
    });
    const optionIds = Array.from(
      new Set(rows.map((row) => row.optionId).filter((id): id is string => id != null)),
    );
    const inventories = optionIds.length > 0
      ? await this.prisma.inventory.findMany({
          where: { optionId: { in: optionIds }, companyId },
          select: { optionId: true, leadTimeDays: true },
        })
      : [];
    const inventoryMap = new Map(inventories.map((inventory) => [inventory.optionId, inventory]));
    for (const r of rows) {
      const lt = r.optionId ? inventoryMap.get(r.optionId)?.leadTimeDays ?? null : null;
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

/**
 * HydratedListing[] → listingId → ABC grade (null 포함).
 * B2b 원본 normalizeGrade 와 일치 — `'A'|'B'|'C'` 는 그대로, 나머지는 `null`.
 */
function buildGradeMap(listings: HydratedListing[]): Map<string, 'A' | 'B' | 'C' | null> {
  const map = new Map<string, 'A' | 'B' | 'C' | null>();
  for (const l of listings) {
    const g = l.masterProduct.abcGrade;
    map.set(l.id, g === 'A' || g === 'B' || g === 'C' ? g : null);
  }
  return map;
}

/**
 * BudgetAllocatorInput.gradeMap 은 non-null 3-valued. null grade 는 제외.
 * (calcBudgetAllocation 은 A/B/C bucket 만 사용 — null 은 allocation 영향 없음).
 */
function toGradeMapStrict(
  map: Map<string, 'A' | 'B' | 'C' | null>,
): Map<string, 'A' | 'B' | 'C'> {
  const out = new Map<string, 'A' | 'B' | 'C'>();
  for (const [id, g] of map) if (g) out.set(id, g);
  return out;
}

/**
 * `ChannelListingDailySnapshot.groupBy` result → AdAggregateRow[].
 * listingId null 은 drop. Source columns shifted from `spend/revenue/...` to
 * `adSpend/adRevenue/adClicks/adImpressions/adConversions`.
 */
function toAdAggregateRows(
  rows: Array<{
    listingId: string | null;
    _sum: {
      adSpend: number | null;
      adRevenue: number | null;
      adClicks: number | null;
      adImpressions: number | null;
      adConversions: number | null;
    };
  }>,
): AdAggregateRow[] {
  const out: AdAggregateRow[] = [];
  for (const r of rows) {
    if (!r.listingId) continue;
    out.push({
      listingId: r.listingId,
      spend: r._sum.adSpend ?? 0,
      revenue: r._sum.adRevenue ?? 0,
      clicks: r._sum.adClicks ?? 0,
      impressions: r._sum.adImpressions ?? 0,
      conversions: r._sum.adConversions ?? 0,
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
