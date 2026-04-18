import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdConfigService } from './ad-config.service';
import { LISTING_SUMMARY_SELECT } from './types';
import type {
  AdListingSummary,
  AdRulesData,
  AdStrategyAction,
  AdStrategyRecommendation,
  AdTierAnalysis,
  AdTop20Item,
  AdWeeklyPlan,
  ExposureAnalysisData,
  ExposureFactorScore,
  ExposureProductScore,
  ExposureUrgentAction,
} from '@kiditem/shared';

type Priority = 'urgent' | 'high' | 'medium' | 'low';
type Grade = 'A' | 'B' | 'C' | null;

interface ListingHydrated {
  id: string;
  externalId: string;
  channelName: string | null;
  master: {
    id: string;
    code: string;
    name: string;
    abcGrade: string | null;
    adTier: string | null;
    healthScore: number | null;
  };
  options: Array<{
    id: string;
    sku: string;
    optionName: string | null;
    availableStock: number | null;
    costPrice: number | null;
    sellPrice: number | null;
    commissionRate: unknown; // Prisma Decimal
    shippingCost: number | null;
  }>;
}

function toSummary(
  listing: Pick<ListingHydrated, 'id' | 'externalId' | 'channelName' | 'master' | 'options'>,
): AdListingSummary {
  const primary = listing.options[0];
  return {
    listingId: listing.id,
    externalId: listing.externalId,
    channelName: listing.channelName,
    masterProduct: {
      id: listing.master.id,
      code: listing.master.code,
      name: listing.master.name,
    },
    option: primary
      ? {
          id: primary.id,
          sku: primary.sku,
          optionName: primary.optionName,
        }
      : null,
  };
}

function normalizeGrade(raw: string | null | undefined): Grade {
  if (raw === 'A' || raw === 'B' || raw === 'C') return raw;
  return null;
}

function calcOptionProfitRate(
  option: ListingHydrated['options'][number] | undefined,
): number {
  if (!option) return 0;
  const cost = option.costPrice ?? 0;
  const sell = option.sellPrice ?? 0;
  if (sell <= 0) return 0;
  const commission = option.commissionRate != null ? Number(option.commissionRate) : 0;
  const shipping = option.shippingCost ?? 0;
  return Math.round(((sell - cost - shipping - sell * commission) / sell) * 100);
}

function calcOptionMargin(
  option: ListingHydrated['options'][number] | undefined,
): number {
  if (!option) return 0;
  const cost = option.costPrice ?? 0;
  const sell = option.sellPrice ?? 0;
  if (sell <= 0 || cost <= 0) return 0;
  return sell - cost;
}

const PRIORITY_ORDER: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

@Injectable()
export class AdStrategyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adConfigService: AdConfigService,
  ) {}

  // ─────────────────────────────────────────────────────────────
  // PUBLIC API (6 endpoints)
  // ─────────────────────────────────────────────────────────────

  async getRules(
    period: '7d' | '14d' | 'month',
    companyId: string,
  ): Promise<AdRulesData> {
    const { year, month } = this.getCurrentPeriod();
    const recommendations = await this.calcActions(companyId, year, month);
    const urgentCount = recommendations.filter((a) => a.priority === 'urgent').length;
    return {
      recommendations,
      summary: {
        totalActions: recommendations.length,
        urgentCount,
      },
    } satisfies AdRulesData;
  }

  async getWeeklyPlan(
    period: '7d' | '14d' | 'month',
    companyId: string,
  ): Promise<AdWeeklyPlan> {
    const { year, month } = this.getCurrentPeriod();

    // calcBudgetAllocation 은 계산되지만 AdWeeklyPlan shared shape 에 포함되지 않음 (내부 참조용).
    const [actions, tierAnalysis, top20, adIssues] = await Promise.all([
      this.calcActions(companyId, year, month),
      this.calcTierAnalysis(companyId),
      this.calcTop20(companyId, year, month),
      this.calcAdIssues(companyId),
      this.calcBudgetAllocation(companyId),
    ]);

    const { start, end } = this.getWeekRange(period);

    return {
      actions,
      issues: adIssues,
      tierAnalysis,
      top20,
      week: { start, end },
    } satisfies AdWeeklyPlan;
  }

  async getAiEnhancedPlan(
    period: '7d' | '14d' | 'month',
    companyId: string,
  ): Promise<AdWeeklyPlan> {
    const plan = await this.getWeeklyPlan(period, companyId);
    const aiMap = await this.enhanceActionsWithAi(plan.actions);
    if (aiMap.size === 0) return plan;

    const enhancedActions = plan.actions.map((a) => {
      const ai = aiMap.get(a.listing.listingId);
      if (!ai) return a;
      return {
        ...a,
        reason: ai.weeklyAction || a.reason,
      } satisfies AdStrategyAction;
    });

    return { ...plan, actions: enhancedActions } satisfies AdWeeklyPlan;
  }

  async getRecommendations(companyId: string): Promise<AdStrategyRecommendation[]> {
    const { year, month } = this.getCurrentPeriod();
    const actions = await this.calcActions(companyId, year, month);

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

  async getExposureAnalysis(companyId: string): Promise<ExposureAnalysisData> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

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

    const listings = await this.hydrateListings(companyId, listingIds);

    const adMap = new Map(adAgg.map((a) => [a.listingId, a._sum]));
    const reviewMap = new Map(
      reviewAgg.map((r) => [r.listingId, { count: r._count.id, avg: r._avg.rating }]),
    );
    const recentReviewMap = new Map(recentReviewAgg.map((r) => [r.listingId, r._count.id]));

    const trafficStats = await this.prisma.trafficStats.findMany({
      where: { companyId, listingId: { in: listingIds }, periodDays: 14 },
      orderBy: { date: 'desc' },
    });
    const trafficByListing = new Map<string, { rev: number; prevRev: number; orders: number }>();
    for (const t of trafficStats) {
      const existing = trafficByListing.get(t.listingId);
      if (!existing) {
        trafficByListing.set(t.listingId, { rev: t.revenue, prevRev: 0, orders: t.orders });
      } else if (existing.prevRev === 0) {
        existing.prevRev = t.revenue;
      }
    }

    const inventoryByListing = await this.getInventorySnapshot(companyId, listingIds);

    const allT14 = [...trafficByListing.values()].map((t) => t.rev).sort((a, b) => a - b);
    const maxT14 = allT14[allT14.length - 1] || 1;

    const scores: ExposureProductScore[] = [];
    const urgentActions: ExposureUrgentAction[] = [];

    for (const listing of listings) {
      const ad = adMap.get(listing.id);
      const reviewInfo = reviewMap.get(listing.id) ?? { count: 0, avg: 0 };
      const recentReviews = recentReviewMap.get(listing.id) ?? 0;
      const totalReviews = reviewInfo.count;
      const avgRating = reviewInfo.avg != null ? Number(reviewInfo.avg) : 0;

      const traffic = trafficByListing.get(listing.id) ?? { rev: 0, prevRev: 0, orders: 0 };
      const inv = inventoryByListing.get(listing.id) ?? { stock: 0, leadTime: null };

      const spend = ad?.spend ?? 0;
      const adRevenue = ad?.revenue ?? 0;
      const clicks = ad?.clicks ?? 0;
      const impressions = ad?.impressions ?? 0;
      const conversions = ad?.conversions ?? 0;
      const roas = spend > 0 ? Math.round((adRevenue / spend) * 100) : 0;
      const ctr = impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0;
      const cvr = clicks > 0 ? Math.round((conversions / clicks) * 10000) / 100 : 0;

      const profitRate = calcOptionProfitRate(listing.options[0]);
      const grade = normalizeGrade(listing.master.abcGrade);

      const salesScore = this.calculateSalesScore({
        maxT14,
        t14Rev: traffic.rev,
        t14PrevRev: traffic.prevRev,
        t14Orders: traffic.orders,
      });
      const reviewScore = this.calculateReviewScore({ totalReviews, recentReviews, avgRating });
      const adScore = this.calculateAdScore({ spend, roas, ctr, cvr });
      const fulfillmentScore = this.calculateFulfillmentScore({
        leadTime: inv.leadTime,
        stock: inv.stock,
        profitRate,
      });
      const infoScore = this.calculateInfoScore({
        healthScore: listing.master.healthScore,
        adTier: listing.master.adTier,
      });

      const totalScore = Math.round(
        salesScore * 0.25 +
          reviewScore * 0.2 +
          adScore * 0.25 +
          fulfillmentScore * 0.2 +
          infoScore * 0.1,
      );

      const { topIssue, topIssueFactor } = this.determineTopIssue(
        { salesScore, reviewScore, adScore, fulfillmentScore, infoScore },
        {
          t14Orders: traffic.orders,
          t14Rev: traffic.rev,
          maxT14,
          recentReviews,
          totalReviews,
          stock: inv.stock,
          spend,
          roas,
          ctr,
          impressions,
          leadTime: inv.leadTime,
          profitRate,
          healthScore: listing.master.healthScore,
          adTier: listing.master.adTier,
        },
      );

      const factors: ExposureFactorScore[] = [
        { factor: 'sales', score: salesScore, weight: 0.25 },
        { factor: 'review', score: reviewScore, weight: 0.2 },
        { factor: 'ad', score: adScore, weight: 0.25 },
        { factor: 'fulfillment', score: fulfillmentScore, weight: 0.2 },
        { factor: 'info', score: infoScore, weight: 0.1 },
      ];

      scores.push({
        listing: toSummary(listing),
        grade,
        factors,
        totalScore,
        topIssue,
      } satisfies ExposureProductScore);

      // urgent 추출: 최저 점수 factor 가 30 미만이거나 60 미만 + topIssueFactor 일치
      for (const f of factors) {
        if (f.score < 30) {
          urgentActions.push({
            listing: toSummary(listing),
            grade,
            issue: `${f.factor} 점수 ${f.score}점`,
            suggestedAction:
              topIssueFactor === f.factor
                ? topIssue
                : `${f.factor} 개선 필요`,
          } satisfies ExposureUrgentAction);
          break;
        }
      }
    }

    scores.sort((a, b) => a.totalScore - b.totalScore);
    urgentActions.splice(30); // 상위 30 제한

    return { scores, urgentActions } satisfies ExposureAnalysisData;
  }

  async registerCampaign(
    dto: import('../dto/register-campaign.dto').RegisterCampaignDto,
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
      listings: dto.listings as unknown as import('@prisma/client').Prisma.InputJsonValue,
      smartTargetingBid: dto.smartTargetingBid ?? null,
      keywords: (dto.keywords ?? []) as unknown as import('@prisma/client').Prisma.InputJsonValue,
      nonSearchBid: dto.nonSearchBid ?? null,
      targetRoas: dto.targetRoas ?? null,
      pageType: 'campaign_registration',
    } satisfies import('@prisma/client').Prisma.InputJsonObject;

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
  // PRIVATE CALC HELPERS (6)
  // ─────────────────────────────────────────────────────────────

  private getCurrentPeriod(): { year: number; month: number } {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }

  private getWeekRange(period: '7d' | '14d' | 'month'): { start: string; end: string } {
    const end = new Date();
    const start = new Date();
    const days = period === '7d' ? 7 : period === 'month' ? new Date().getDate() : 14;
    start.setDate(start.getDate() - days);
    return {
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    };
  }

  private async hydrateListings(
    companyId: string,
    listingIds: string[],
  ): Promise<ListingHydrated[]> {
    if (listingIds.length === 0) return [];
    const listings = await this.prisma.channelListing.findMany({
      where: { id: { in: listingIds }, companyId, isDeleted: false },
      select: {
        ...LISTING_SUMMARY_SELECT,
        master: {
          select: {
            id: true,
            code: true,
            name: true,
            abcGrade: true,
            adTier: true,
            healthScore: true,
          },
        },
        options: {
          where: { isActive: true },
          select: {
            option: {
              select: {
                id: true,
                sku: true,
                optionName: true,
                availableStock: true,
                costPrice: true,
                sellPrice: true,
                commissionRate: true,
                shippingCost: true,
              },
            },
          },
        },
      },
    });

    return listings.map((l) => ({
      id: l.id,
      externalId: l.externalId,
      channelName: l.channelName,
      master: l.master,
      options: l.options
        .map((clo) => clo.option)
        .filter((o): o is NonNullable<typeof o> => o != null),
    }));
  }

  private async getInventorySnapshot(
    companyId: string,
    listingIds: string[],
  ): Promise<Map<string, { stock: number; leadTime: number | null }>> {
    const result = new Map<string, { stock: number; leadTime: number | null }>();
    if (listingIds.length === 0) return result;

    const listings = await this.prisma.channelListing.findMany({
      where: { id: { in: listingIds }, companyId },
      select: {
        id: true,
        options: {
          where: { isActive: true },
          select: {
            option: {
              select: {
                availableStock: true,
                inventory: { select: { leadTimeDays: true } },
              },
            },
          },
        },
      },
    });

    for (const l of listings) {
      let stockSum = 0;
      let leadTime: number | null = null;
      for (const clo of l.options) {
        if (!clo.option) continue;
        stockSum += clo.option.availableStock ?? 0;
        const lt = clo.option.inventory?.leadTimeDays ?? null;
        if (lt != null && (leadTime == null || lt < leadTime)) leadTime = lt;
      }
      result.set(l.id, { stock: stockSum, leadTime });
    }
    return result;
  }

  private async calcSnapshotKeyMetrics(
    companyId: string,
    period: '7d' | '14d' | 'month' = '14d',
  ) {
    const days = period === '7d' ? 7 : period === 'month' ? Math.max(new Date().getDate(), 1) : 14;
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const snaps = await this.prisma.adSnapshot.findMany({
      where: {
        companyId,
        source: 'coupang_ads',
        pageType: 'dashboard_daily',
        date: { gte: since },
      },
      select: {
        adSpend: true,
        adRevenue: true,
        clicks: true,
        impressions: true,
        conversions: true,
      },
    });

    if (snaps.length === 0) return null;

    const totalAdSpend = snaps.reduce((s, r) => s + r.adSpend, 0);
    const totalAdRevenue = snaps.reduce((s, r) => s + r.adRevenue, 0);
    const totalImpressions = snaps.reduce((s, r) => s + r.impressions, 0);
    const totalClicks = snaps.reduce((s, r) => s + r.clicks, 0);
    const totalConversions = snaps.reduce((s, r) => s + r.conversions, 0);
    const overallRoas = totalAdSpend > 0 ? Math.round((totalAdRevenue / totalAdSpend) * 100) : 0;
    const ctr =
      totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 100 : 0;
    const cvr = totalClicks > 0 ? Math.round((totalConversions / totalClicks) * 10000) / 100 : 0;
    const adRatio =
      totalAdRevenue > 0 ? Math.round((totalAdSpend / totalAdRevenue) * 10000) / 100 : 0;

    return {
      totalAdSpend,
      totalAdRevenue,
      overallRoas,
      totalImpressions,
      totalClicks,
      totalConversions,
      ctr,
      cvr,
      adRatio,
    };
  }

  private async calcBudgetAllocation(
    companyId: string,
  ): Promise<Array<{ grade: string; currentPercent: number; targetPercent: number; gap: number }>> {
    const config = await this.adConfigService.getConfig(companyId);

    const adAgg = await this.prisma.ad.groupBy({
      by: ['listingId'],
      where: { companyId },
      _sum: { spend: true },
    });

    const listingIds = adAgg
      .map((a) => a.listingId)
      .filter((id): id is string => id != null);

    const listings = await this.prisma.channelListing.findMany({
      where: { id: { in: listingIds }, companyId, isDeleted: false },
      select: { id: true, master: { select: { abcGrade: true } } },
    });

    const gradeMap = new Map(listings.map((l) => [l.id, l.master.abcGrade ?? 'C']));
    const gradeSpend: Record<string, number> = { A: 0, B: 0, C: 0 };
    let totalSpend = 0;

    for (const a of adAgg) {
      if (!a.listingId) continue;
      const grade = gradeMap.get(a.listingId) ?? 'C';
      const spend = a._sum.spend ?? 0;
      gradeSpend[grade] = (gradeSpend[grade] ?? 0) + spend;
      totalSpend += spend;
    }

    const allocation = config.budget.allocation;
    return ['A', 'B', 'C'].map((g) => ({
      grade: g,
      currentPercent: totalSpend > 0 ? Math.round((gradeSpend[g] / totalSpend) * 100) : 0,
      targetPercent: allocation[g] ?? 0,
      gap:
        totalSpend > 0
          ? Math.round((gradeSpend[g] / totalSpend) * 100) - (allocation[g] ?? 0)
          : 0,
    }));
  }

  private async calcActions(
    companyId: string,
    year: number,
    month: number,
  ): Promise<AdStrategyAction[]> {
    const adAgg = await this.prisma.ad.groupBy({
      by: ['listingId'],
      where: { companyId },
      _sum: {
        spend: true,
        revenue: true,
        clicks: true,
        impressions: true,
        conversions: true,
      },
    });

    const listingIds = adAgg
      .map((a) => a.listingId)
      .filter((id): id is string => id != null);

    if (listingIds.length === 0) return [];

    const listings = await this.hydrateListings(companyId, listingIds);
    const adMap = new Map(adAgg.map((a) => [a.listingId, a._sum]));

    const profitLoss = await this.prisma.profitLoss.findMany({
      where: {
        companyId,
        year,
        month,
        listingId: { in: listings.map((l) => l.id) },
      },
      select: { listingId: true, profitRate: true, revenue: true, adCost: true },
    });
    const plByListing = new Map(
      profitLoss.map((pl) => [
        pl.listingId,
        { profitRate: Number(pl.profitRate ?? 0) * 100, revenue: pl.revenue },
      ]),
    );

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const alertsToCreate: Array<{
      type: string;
      severity: string;
      title: string;
      message: string;
      companyId: string;
      targetType: string;
      targetId: string;
    }> = [];

    const actions: AdStrategyAction[] = [];

    for (const listing of listings) {
      const ad = adMap.get(listing.id);
      const spend = ad?.spend ?? 0;
      const revenue = ad?.revenue ?? 0;
      const clicks = ad?.clicks ?? 0;
      const impressions = ad?.impressions ?? 0;
      const conversions = ad?.conversions ?? 0;
      const roas = spend > 0 ? Math.round((revenue / spend) * 100) : 0;
      const ctr = impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0;
      if (spend === 0) continue;

      const grade = normalizeGrade(listing.master.abcGrade);
      const primary = listing.options[0];
      const margin = calcOptionMargin(primary);
      const adBudgetLimit = margin > 0 ? margin * 0.35 : 0;
      const stock = primary?.availableStock ?? 0;
      const profitRate = plByListing.get(listing.id)?.profitRate ?? 0;
      const summary = toSummary(listing);
      const name = listing.master.name;

      const recs: Array<{ rule: string; reason: string; priority: Priority }> = [];

      // ═══ 공통 긴급 규칙 ═══
      if (stock === 0 && listing.master.adTier && spend > 0) {
        recs.push({
          rule: '긴급: 재고0 광고ON',
          reason: '재고 없음 — 광고 즉시 중단. 재입고 확인 후 재개',
          priority: 'urgent',
        });
        alertsToCreate.push({
          type: 'strategy_change',
          severity: 'critical',
          targetType: 'listing',
          targetId: listing.id,
          companyId,
          title: '재고 0 광고 ON',
          message: `[긴급] ${name} — 재고 0인데 광고 ON, 즉시 중단 필요`,
        });
      }

      if (clicks >= 50 && conversions === 0 && spend > 0) {
        recs.push({
          rule: 'C-5 전환0 조기손절',
          reason: `클릭 ${clicks}회, 전환 0 — 키워드 OFF 또는 캠페인 중단 (광고비 ${Math.round(spend).toLocaleString()}원 낭비)`,
          priority: 'urgent',
        });
        if (spend >= 3000) {
          alertsToCreate.push({
            type: 'strategy_change',
            severity: 'critical',
            targetType: 'listing',
            targetId: listing.id,
            companyId,
            title: '전환0 조기손절',
            message: `[조기손절] ${name} — 클릭 ${clicks}회 전환 0, 광고비 ${Math.round(spend).toLocaleString()}원 낭비`,
          });
        }
      }

      if (ctr >= 0.5 && roas < 100 && spend > 1000 && clicks >= 20) {
        recs.push({
          rule: 'B-7 CTR높음 전환낮음',
          reason: `CTR ${ctr}% (양호) but ROAS ${roas}% (저조) — 썸네일 OK, 상세페이지·가격·리뷰 재검토`,
          priority: 'high',
        });
        alertsToCreate.push({
          type: 'strategy_change',
          severity: 'warning',
          targetType: 'listing',
          targetId: listing.id,
          companyId,
          title: 'CTR 높음 전환 낮음',
          message: `[상세페이지] ${name} — CTR ${ctr}% 양호하나 전환 저조(ROAS ${roas}%), 상세페이지/가격 점검`,
        });
      }

      if (adBudgetLimit > 0 && spend > adBudgetLimit * 14 && roas < 300) {
        recs.push({
          rule: '순이익 한도 초과',
          reason: `광고비 ${Math.round(spend).toLocaleString()}원 > 순이익 한도 ${Math.round(adBudgetLimit * 14).toLocaleString()}원 — 예산 축소 또는 ROAS 목표 상향`,
          priority: 'high',
        });
      }

      // ═══ 등급별 규칙 ═══
      if (grade === 'A') {
        if (roas >= 480 && spend > 0) {
          recs.push({
            rule: 'A-1 매출 확대',
            reason: `ROAS ${roas}% — 일예산 20% 증액 추천. 입찰가 10% 인상 검토`,
            priority: 'high',
          });
        } else if (roas >= 300 && ctr >= 0.3) {
          recs.push({
            rule: 'A-2 키워드 확장',
            reason: `ROAS ${roas}% + CTR ${ctr}% — ${listing.master.adTier ?? '없음'}→1차 승격. 매출최적화 키워드를 수동 캠페인에 추가`,
            priority: 'high',
          });
        } else if (roas < 200 && spend > 3000) {
          recs.push({
            rule: 'A-3 위험 감지',
            reason: `A등급 ROAS ${roas}%로 하락 — 입찰가 15% 하향 + 전환 0 키워드 제외 + 아이템위너 상태 확인`,
            priority: 'urgent',
          });
          alertsToCreate.push({
            type: 'strategy_change',
            severity: 'critical',
            targetType: 'listing',
            targetId: listing.id,
            companyId,
            title: 'A등급 ROAS 하락',
            message: `[전략수정] ${name} — A등급 ROAS ${roas}%로 하락, 아이템위너 확인 및 입찰가 조정 필요`,
          });
        }
      } else if (grade === 'B') {
        if (roas >= 480) {
          recs.push({
            rule: 'B-5 A승격',
            reason: `ROAS ${roas}% — A등급 캠페인으로 이동. 예산 비중 확대 (60~70% 목표)`,
            priority: 'high',
          });
          alertsToCreate.push({
            type: 'strategy_change',
            severity: 'info',
            targetType: 'listing',
            targetId: listing.id,
            companyId,
            title: 'A등급 승격 추천',
            message: `[A승격] ${name} — ROAS ${roas}% 달성, A등급 캠페인 이동 추천`,
          });
        } else if (roas >= 300) {
          recs.push({
            rule: 'B-3 예산 유지',
            reason: `ROAS ${roas}% 안정 — 현재 예산 유지, 주간 모니터링. 제외 키워드 정리 추천`,
            priority: 'low',
          });
        } else if (roas >= 100 && ctr < 0.15) {
          recs.push({
            rule: 'B-2 소재 테스트',
            reason: `CTR ${ctr}% 미달 — 썸네일 교체 추천. 경쟁사 상위 3개 썸네일 벤치마킹 후 A/B 테스트`,
            priority: 'medium',
          });
        } else if (roas >= 100 && roas < 200) {
          recs.push({
            rule: 'B-4 입찰가 하향',
            reason: `ROAS ${roas}% — 입찰가 15% 하향. 메인 키워드 경쟁 과열이면 롱테일 키워드(100~300원)로 전환`,
            priority: 'medium',
          });
        } else if (roas >= 200) {
          recs.push({
            rule: 'B-6 롱테일 키워드',
            reason: `ROAS ${roas}% 보통 — 핵심 키워드 20~30개에 집중 + 롱테일 키워드로 저비용 전환 확보`,
            priority: 'medium',
          });
        }
      } else if (grade === 'C' || spend > 0) {
        if (spend > 0 && revenue === 0) {
          recs.push({
            rule: 'C-1 광고 중단',
            reason: `광고비 ${Math.round(spend).toLocaleString()}원 지출, 전환 0원 — 즉시 OFF. 아이템위너 여부 확인 필수`,
            priority: 'urgent',
          });
          if (spend >= 5000) {
            alertsToCreate.push({
              type: 'strategy_change',
              severity: 'critical',
              targetType: 'listing',
              targetId: listing.id,
              companyId,
              title: '광고 중단 권장',
              message: `[광고중단] ${name} — 광고비 ${Math.round(spend).toLocaleString()}원 지출, 전환매출 0원`,
            });
          }
        } else if (roas > 0 && roas < 50) {
          recs.push({
            rule: 'C-2 최소 예산',
            reason: `ROAS ${roas}% — 일예산 3,000원 축소. 2주 후에도 개선 없으면 OFF`,
            priority: 'high',
          });
        } else if (roas >= 50 && roas < 100) {
          recs.push({
            rule: 'C-2 최소 예산',
            reason: `ROAS ${roas}% — 일예산 3,000원 축소 + 롱테일 키워드만 유지`,
            priority: 'high',
          });
        }
      }

      if (recs.length === 0) continue;

      recs.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
      const main = recs[0];

      const actionType = this.ruleToActionType(main.rule);
      const currentValue = roas;
      const proposedValue = profitRate > 0 ? Math.round(profitRate) : null;

      actions.push({
        listing: summary,
        grade,
        actionType,
        priority: main.priority,
        reason: main.reason,
        currentValue,
        proposedValue,
      } satisfies AdStrategyAction);
    }

    // 중복 Alert 방지
    if (alertsToCreate.length > 0) {
      const existing = await this.prisma.alert.findMany({
        where: {
          companyId,
          type: 'strategy_change',
          createdAt: { gte: todayStart },
          targetType: 'listing',
        },
        select: { targetId: true },
      });
      const existSet = new Set(existing.map((a) => a.targetId));
      const newAlerts = alertsToCreate.filter((a) => !existSet.has(a.targetId));
      if (newAlerts.length > 0) {
        await this.prisma.alert.createMany({ data: newAlerts });
      }
    }

    actions.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

    return actions;
  }

  private ruleToActionType(rule: string): string {
    if (rule.startsWith('A-1') || rule.startsWith('A-5')) return 'increase';
    if (rule.startsWith('A-3') || rule.startsWith('C-1') || rule.includes('재고0'))
      return 'stop';
    if (
      rule.startsWith('C-2') ||
      rule.startsWith('B-4') ||
      rule.includes('순이익') ||
      rule.includes('전환0')
    )
      return 'decrease';
    return 'maintain';
  }

  private async calcAdIssues(companyId: string) {
    const since = new Date();
    since.setDate(since.getDate() - 14);

    const adAgg = await this.prisma.ad.groupBy({
      by: ['listingId'],
      where: { companyId, date: { gte: since } },
      _sum: { spend: true, revenue: true, clicks: true, conversions: true },
    });

    const listingIds = adAgg
      .map((a) => a.listingId)
      .filter((id): id is string => id != null);

    const listings = await this.hydrateListings(companyId, listingIds);
    const listingById = new Map(listings.map((l) => [l.id, l]));

    const zeroConversion: AdStrategyAction[] = [];
    const lowRoas: AdStrategyAction[] = [];
    const highSpend: AdStrategyAction[] = [];

    for (const row of adAgg) {
      if (!row.listingId) continue;
      const listing = listingById.get(row.listingId);
      if (!listing) continue;
      const spend = row._sum.spend ?? 0;
      const adRevenue = row._sum.revenue ?? 0;
      const conversions = row._sum.conversions ?? 0;
      const roas = spend > 0 ? Math.round((adRevenue / spend) * 100) : 0;

      const grade = normalizeGrade(listing.master.abcGrade);
      const summary = toSummary(listing);

      if (spend > 0 && conversions === 0) {
        zeroConversion.push({
          listing: summary,
          grade,
          actionType: 'stop',
          priority: 'urgent',
          reason: `전환 0 — 광고 중단 검토 (광고비 ${Math.round(spend).toLocaleString()}원)`,
          currentValue: conversions,
          proposedValue: 0,
        } satisfies AdStrategyAction);
      }

      if (spend > 0 && adRevenue > 0 && roas < 100) {
        lowRoas.push({
          listing: summary,
          grade,
          actionType: 'decrease',
          priority: 'high',
          reason: `ROAS ${roas}% — 예산 축소 권장`,
          currentValue: roas,
          proposedValue: null,
        } satisfies AdStrategyAction);
      }

      if (spend >= 10000) {
        highSpend.push({
          listing: summary,
          grade,
          actionType: 'maintain',
          priority: 'medium',
          reason: `고비용 ${Math.round(spend).toLocaleString()}원 — 효율 점검`,
          currentValue: spend,
          proposedValue: null,
        } satisfies AdStrategyAction);
      }
    }

    return { zeroConversion, lowRoas, highSpend };
  }

  private async calcTierAnalysis(companyId: string): Promise<AdTierAnalysis[]> {
    const masters = await this.prisma.masterProduct.findMany({
      where: { companyId, isDeleted: false, adTier: { not: null } },
      select: { id: true, adTier: true, listings: { select: { id: true } } },
    });

    const tierMap = new Map<string, { masterIds: string[]; listingIds: string[] }>();
    for (const m of masters) {
      if (!m.adTier) continue;
      const existing = tierMap.get(m.adTier) ?? { masterIds: [], listingIds: [] };
      existing.masterIds.push(m.id);
      existing.listingIds.push(...m.listings.map((l) => l.id));
      tierMap.set(m.adTier, existing);
    }

    const results: AdTierAnalysis[] = [];
    for (const [tier, { masterIds, listingIds }] of tierMap) {
      if (listingIds.length === 0) {
        results.push({ tier, count: masterIds.length, spend: 0, revenue: 0, roas: null });
        continue;
      }
      const agg = await this.prisma.ad.aggregate({
        where: { companyId, listingId: { in: listingIds } },
        _sum: { spend: true, revenue: true },
      });
      const spend = agg._sum.spend ?? 0;
      const revenue = agg._sum.revenue ?? 0;
      const roas = spend > 0 ? Math.round((revenue / spend) * 10000) / 100 : null;
      results.push({
        tier,
        count: masterIds.length,
        spend,
        revenue,
        roas,
      } satisfies AdTierAnalysis);
    }
    return results;
  }

  private async calcTop20(
    companyId: string,
    year: number,
    month: number,
  ): Promise<AdTop20Item[]> {
    const topPl = await this.prisma.profitLoss.findMany({
      where: { companyId, year, month },
      orderBy: { revenue: 'desc' },
      take: 20,
      select: {
        listingId: true,
        revenue: true,
      },
    });

    const listingIds = topPl.map((pl) => pl.listingId);
    if (listingIds.length === 0) return [];

    const listings = await this.prisma.channelListing.findMany({
      where: { id: { in: listingIds }, companyId, isDeleted: false },
      select: {
        ...LISTING_SUMMARY_SELECT,
        master: {
          select: {
            id: true,
            code: true,
            name: true,
            abcGrade: true,
          },
        },
      },
    });

    const listingById = new Map(listings.map((l) => [l.id, l]));

    const adAgg = await this.prisma.ad.groupBy({
      by: ['listingId'],
      where: { companyId, listingId: { in: listingIds } },
      _sum: { spend: true, revenue: true, clicks: true, impressions: true, conversions: true },
    });
    const adByListing = new Map(adAgg.map((a) => [a.listingId, a._sum]));

    const items: AdTop20Item[] = [];
    let rank = 0;
    for (const pl of topPl) {
      const listing = listingById.get(pl.listingId);
      if (!listing) continue;
      const ad = adByListing.get(listing.id);
      const spend = ad?.spend ?? 0;
      const impressions = ad?.impressions ?? 0;
      const clicks = ad?.clicks ?? 0;
      const conversions = ad?.conversions ?? 0;
      const revenue = ad?.revenue ?? 0;
      const ctr =
        impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : null;
      const roas = spend > 0 ? Math.round((revenue / spend) * 10000) / 100 : null;
      const cvr = clicks > 0 ? Math.round((conversions / clicks) * 10000) / 100 : null;

      rank += 1;
      items.push({
        listing: {
          listingId: listing.id,
          externalId: listing.externalId,
          channelName: listing.channelName,
          masterProduct: {
            id: listing.master.id,
            code: listing.master.code,
            name: listing.master.name,
          },
          option: null,
        },
        grade: normalizeGrade(listing.master.abcGrade),
        rank,
        metrics: { spend, impressions, clicks, conversions, revenue, ctr, roas, cvr },
      } satisfies AdTop20Item);
    }
    return items;
  }

  // ─────────────────────────────────────────────────────────────
  // AI ENHANCEMENT (optional external LLM call)
  // ─────────────────────────────────────────────────────────────

  private async enhanceActionsWithAi(
    actions: AdStrategyAction[],
  ): Promise<Map<string, { weeklyAction: string }>> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || actions.length === 0) return new Map();

    const model = 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const batch = actions.slice(0, 30).map((a) => ({
      listingId: a.listing.listingId,
      name: a.listing.masterProduct.name,
      grade: a.grade,
      actionType: a.actionType,
      priority: a.priority,
      reason: a.reason,
      currentValue: a.currentValue,
    }));

    const prompt = `당신은 쿠팡 셀러 광고 최적화 전문가입니다. 아래 listing 들의 주간 실행 요약을 JSON 으로 반환하세요.

[출력 JSON 형식]
{ "results": [{ "listingId": "...", "weeklyAction": "이번 주 최우선 실행 사항 (수치 포함)" }] }

데이터: ${JSON.stringify(batch)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
        }),
      });

      if (!res.ok) return new Map();

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const parsed = JSON.parse(text) as {
        results?: Array<{ listingId: string; weeklyAction: string }>;
      };

      const resultMap = new Map<string, { weeklyAction: string }>();
      for (const item of parsed.results ?? []) {
        if (item.listingId) {
          resultMap.set(item.listingId, { weeklyAction: item.weeklyAction ?? '' });
        }
      }
      return resultMap;
    } catch {
      return new Map();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // SCORE CALCULATORS (5) — 시그니처 유지
  // ─────────────────────────────────────────────────────────────

  private calculateSalesScore(params: {
    maxT14: number;
    t14Rev: number;
    t14PrevRev: number;
    t14Orders: number;
  }): number {
    const { maxT14, t14Rev, t14PrevRev, t14Orders } = params;
    const t14Pct = maxT14 > 0 ? (t14Rev / maxT14) * 60 : 0;
    const growthScore =
      t14PrevRev > 0
        ? t14Rev / t14PrevRev > 1.1
          ? 20
          : t14Rev / t14PrevRev >= 1.0
            ? 10
            : 0
        : t14Rev > 0
          ? 10
          : 0;
    const orderScore = t14Orders > 0 ? 20 : 0;
    return Math.min(100, Math.round(t14Pct + growthScore + orderScore));
  }

  private calculateReviewScore(params: {
    totalReviews: number;
    recentReviews: number;
    avgRating: number;
  }): number {
    const { totalReviews, recentReviews, avgRating } = params;
    const totalRevScore =
      totalReviews >= 50
        ? 40
        : totalReviews >= 20
          ? 30
          : totalReviews >= 10
            ? 20
            : totalReviews >= 1
              ? 10
              : 0;
    const recentRevScore =
      recentReviews >= 10 ? 40 : recentReviews >= 5 ? 25 : recentReviews >= 1 ? 10 : 0;
    const ratingScore = avgRating > 0 ? Math.round((avgRating / 5) * 20) : 0;
    return Math.min(100, totalRevScore + recentRevScore + ratingScore);
  }

  private calculateAdScore(params: {
    spend: number;
    roas: number;
    ctr: number;
    cvr: number;
  }): number {
    const { spend, roas, ctr, cvr } = params;
    if (spend === 0) return 50;
    const roasScore =
      roas >= 650 ? 40 : roas >= 400 ? 30 : roas >= 200 ? 20 : roas >= 100 ? 10 : 0;
    const ctrScore = ctr >= 0.5 ? 30 : ctr >= 0.3 ? 20 : ctr >= 0.1 ? 10 : 0;
    const cvrScore = cvr >= 5 ? 30 : cvr >= 3 ? 20 : cvr >= 1 ? 10 : 0;
    return Math.min(100, roasScore + ctrScore + cvrScore);
  }

  private calculateFulfillmentScore(params: {
    leadTime: number | null;
    stock: number;
    profitRate: number;
  }): number {
    const { leadTime, stock, profitRate } = params;
    const leadScore =
      leadTime === 0
        ? 40
        : leadTime === 1
          ? 35
          : leadTime === 2
            ? 25
            : leadTime != null
              ? 10
              : 20;
    const stockScore = stock > 50 ? 30 : stock >= 10 ? 20 : stock >= 1 ? 10 : 0;
    const profitScore = profitRate > 10 ? 30 : profitRate >= 5 ? 20 : profitRate >= 0 ? 10 : 0;
    return Math.min(100, leadScore + stockScore + profitScore);
  }

  private calculateInfoScore(params: {
    healthScore: number | null;
    adTier: string | null;
  }): number {
    const { healthScore, adTier } = params;
    const hs = Math.min(80, healthScore ?? 0);
    const adTierBonus = adTier ? 20 : 0;
    return Math.min(100, hs + adTierBonus);
  }

  private determineTopIssue(
    scores: {
      salesScore: number;
      reviewScore: number;
      adScore: number;
      fulfillmentScore: number;
      infoScore: number;
    },
    context: {
      t14Orders: number;
      t14Rev: number;
      maxT14: number;
      recentReviews: number;
      totalReviews: number;
      stock: number;
      spend: number;
      roas: number;
      ctr: number;
      impressions: number;
      leadTime: number | null;
      profitRate: number;
      healthScore: number | null;
      adTier: string | null;
    },
  ): { topIssue: string; topIssueFactor: string } {
    const { salesScore, reviewScore, adScore, fulfillmentScore, infoScore } = scores;
    const {
      t14Orders,
      t14Rev,
      maxT14,
      recentReviews,
      totalReviews,
      stock,
      spend,
      roas,
      ctr,
      impressions,
      leadTime,
      profitRate,
      healthScore,
      adTier,
    } = context;
    const factors = [
      {
        key: 'sales',
        score: salesScore,
        label: '판매실적',
        actions: [
          t14Orders === 0 ? '판매 실적 없음 — 광고 시작 또는 가격 인하 검토' : '',
          t14Rev < maxT14 * 0.1 ? '매출 하위권 — 핵심 키워드 집중 필요' : '',
        ].filter(Boolean),
      },
      {
        key: 'review',
        score: reviewScore,
        label: '리뷰활성도',
        actions: [
          recentReviews === 0 ? '최근 30일 리뷰 0 — 구매자 리뷰 요청 필요' : '',
          recentReviews < 10 && recentReviews > 0
            ? `최근 리뷰 ${recentReviews}개 — 월 10개 목표 미달`
            : '',
          totalReviews === 0 ? '리뷰 없음 — 초기 리뷰 확보 필요' : '',
        ].filter(Boolean),
      },
      {
        key: 'ad',
        score: adScore,
        label: '광고효율',
        actions: [
          stock === 0 && spend > 0 ? '재고 0 광고 ON — 즉시 중단' : '',
          roas < 200 && spend > 0 ? `ROAS ${roas}% — 입찰가 또는 키워드 조정 필요` : '',
          ctr < 0.1 && impressions > 100 ? `CTR ${ctr}% — 썸네일/제목 개선 필요` : '',
        ].filter(Boolean),
      },
      {
        key: 'fulfillment',
        score: fulfillmentScore,
        label: '가격·출고',
        actions: [
          stock === 0 ? '재고 0 — 즉시 재입고 필요' : '',
          (leadTime ?? 3) >= 3 ? `출고 ${leadTime ?? '?'}일 — 리드타임 단축 검토` : '',
          profitRate < 0 ? '이익률 마이너스 — 가격 또는 원가 재검토' : '',
        ].filter(Boolean),
      },
      {
        key: 'info',
        score: infoScore,
        label: '상품정보',
        actions: [
          !adTier ? '광고 등급 미설정 — adTier 배정 필요' : '',
          (healthScore ?? 0) < 50
            ? `헬스점수 ${healthScore ?? 0}점 — 상품 정보 보완 필요`
            : '',
        ].filter(Boolean),
      },
    ].sort((a, b) => a.score - b.score);
    const worst = factors[0];
    return {
      topIssue: worst.actions[0] || `${worst.label} 점수 낮음 (${worst.score}점)`,
      topIssueFactor: worst.key,
    };
  }
}
