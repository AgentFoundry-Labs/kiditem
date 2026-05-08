import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import type {
  DashboardAdSummary,
  AdMetricsDetail,
  IndustryBenchmark,
  DailyAdItem,
  WingAdSummary,
} from '@kiditem/shared/dashboard';
import type { DashboardContext } from './context';
import {
  calculateProfitForRange,
  type RangeProfitMetrics,
} from '../../adapter/out/repository/profit-calculation.repository.adapter';
import {
  aggregateAdForRange,
  type RangeAdMetrics,
} from '../../adapter/out/repository/ad-aggregation.repository.adapter';
import {
  fetchWingAdSummary,
  type WingAdSummaryResult,
} from '../../adapter/out/repository/wing-ad-summary.repository.adapter';
import { DashboardAdRepositoryAdapter } from '../../adapter/out/repository/dashboard-ad.repository.adapter';
import {
  WingTrafficAggregationRepositoryAdapter,
  type CoupangAdsMetrics,
  type WingTrafficMetrics,
} from '../../adapter/out/repository/wing-traffic-aggregation.repository.adapter';
import { buildEffectivePeriod } from '../../helpers/effective-period';
import { pct1, pct2 } from '../../helpers/percent';
import { kstDayStart } from '../../../../common/kst';

@Injectable()
export class DashboardAdService {
  private readonly logger = new Logger(DashboardAdService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adRepository: DashboardAdRepositoryAdapter,
    private readonly wingTrafficRepository: WingTrafficAggregationRepositoryAdapter,
  ) {}

  async getSummary(ctx: DashboardContext, organizationId: string): Promise<DashboardAdSummary> {
    try {
      const { year, month, monthStart, monthEnd, prevMonthDate, dateRange, anchor } = ctx;

      // 30-day daily ad cost window — KST-anchored cutoff so the day grouping
      // matches `ChannelListingDailySnapshot.businessDate` (KST date column).
      const thirtyDaysAgo = new Date(
        kstDayStart(anchor).getTime() - 30 * 24 * 60 * 60 * 1000,
      );

      const [
        adAggCurrentMonth,
        adAggPrevMonth,
        rangeAdCur,
        rangeAdPrev,
        dailyAdRows,
        curMonthProfit,
        prevMonthProfit,
        rangeProfitCur,
        rangeProfitPrev,
        wingAdSummary,
        coupangAdsCurMonth,
        coupangAdsPrevMonth,
        coupangAdsCurRange,
        coupangAdsPrevRange,
        coupangAdsDaily,
        wingTrafficCurMonth,
        latestDataDate,
      ] = await Promise.all([
        aggregateAdForRange(this.prisma, organizationId, monthStart, monthEnd),
        aggregateAdForRange(this.prisma, organizationId, prevMonthDate, monthStart),
        aggregateAdForRange(this.prisma, organizationId, dateRange.start, dateRange.end),
        aggregateAdForRange(this.prisma, organizationId, dateRange.prevStart, dateRange.prevEnd),
        this.adRepository.fetchDailyAdCost(organizationId, thirtyDaysAgo),
        calculateProfitForRange(this.prisma, organizationId, monthStart, monthEnd),
        calculateProfitForRange(this.prisma, organizationId, prevMonthDate, monthStart),
        calculateProfitForRange(this.prisma, organizationId, dateRange.start, dateRange.end),
        calculateProfitForRange(this.prisma, organizationId, dateRange.prevStart, dateRange.prevEnd),
        fetchWingAdSummary(this.prisma, organizationId, year, month, monthStart),
        this.wingTrafficRepository.aggregateCoupangAds(organizationId, monthStart, monthEnd),
        this.wingTrafficRepository.aggregateCoupangAds(organizationId, prevMonthDate, monthStart),
        this.wingTrafficRepository.aggregateCoupangAds(organizationId, dateRange.start, dateRange.end),
        this.wingTrafficRepository.aggregateCoupangAds(organizationId, dateRange.prevStart, dateRange.prevEnd),
        this.wingTrafficRepository.fetchDailyAds(organizationId, thirtyDaysAgo),
        this.wingTrafficRepository.aggregateTraffic(organizationId, monthStart, monthEnd),
        this.wingTrafficRepository.findLatestDataDate(organizationId),
      ]);

      // Coupang ads daily KPI snapshots are the canonical Drive replay
      // ad source. Use them whenever they carry more spend than the
      // listing-daily-fact aggregate (which is zero on Drive replay).
      const useCoupangAdsForMonth =
        coupangAdsCurMonth.hasData && coupangAdsCurMonth.spend > Number(adAggCurrentMonth.spend);
      const useCoupangAdsForRange =
        coupangAdsCurRange.hasData && coupangAdsCurRange.spend > Number(rangeAdCur.spend);

      const monthlyMetrics = mergeAdMetrics(adAggCurrentMonth, coupangAdsCurMonth, useCoupangAdsForMonth);
      const monthlyPrev = mergeAdMetrics(adAggPrevMonth, coupangAdsPrevMonth, useCoupangAdsForMonth);
      const rangeMetrics = mergeAdMetrics(rangeAdCur, coupangAdsCurRange, useCoupangAdsForRange);
      const rangePrev = mergeAdMetrics(rangeAdPrev, coupangAdsPrevRange, useCoupangAdsForRange);

      this.logger.debug({
        msg: 'dashboard-ad.getSummary',
        organizationId,
        anchorShifted: ctx.anchorShifted,
        useCoupangAdsForMonth,
        useCoupangAdsForRange,
        coupangAdsCurMonthSpend: coupangAdsCurMonth.spend,
      });

      const [wingTrafficCurRange, wingTrafficPrevRange] = await Promise.all([
        this.wingTrafficRepository.aggregateTraffic(organizationId, dateRange.start, dateRange.end),
        this.wingTrafficRepository.aggregateTraffic(organizationId, dateRange.prevStart, dateRange.prevEnd),
      ]);

      return {
        monthly: this.buildMonthly(
          monthlyMetrics,
          monthlyPrev,
          curMonthProfit,
          wingAdSummary,
        ),
        rangeKpi: this.buildRangeKpi(
          rangeMetrics,
          rangePrev,
          rangeProfitCur,
          rangeProfitPrev,
          useCoupangAdsForRange ? coupangAdsCurRange.spend : null,
          useCoupangAdsForRange ? coupangAdsPrevRange.spend : null,
          wingTrafficCurRange,
          wingTrafficPrevRange,
        ),
        adKpi: this.buildAdKpi(monthlyMetrics, monthlyPrev, rangeMetrics, curMonthProfit),
        dailyAd: this.buildDailyAd(dailyAdRows, coupangAdsDaily),
        industryBenchmark: this.buildBenchmark(monthlyMetrics, curMonthProfit),
        saving: this.buildSaving(curMonthProfit, prevMonthProfit, monthlyMetrics, monthlyPrev, useCoupangAdsForMonth),
        wingAdData: wingAdSummary !== null ? this.buildWingAdData(wingAdSummary) : null,
        effectivePeriod: buildEffectivePeriod(
          ctx,
          latestDataDate,
          curMonthProfit,
          wingTrafficCurMonth,
          coupangAdsCurMonth,
        ),
      } satisfies DashboardAdSummary;
    } catch (error) {
      this.logger.error('Failed to get ad summary', error);
      throw new InternalServerErrorException('Failed to get ad summary');
    }
  }

  // ── Private builders ───────────────────────────────────────────────────────

  private buildMonthly(
    cur: RangeAdMetrics,
    prev: RangeAdMetrics,
    curMonthProfit: RangeProfitMetrics,
    wingAdSummary: WingAdSummaryResult | null,
  ): DashboardAdSummary['monthly'] {
    const curSpend = Number(cur.spend);
    const curImpressions = Number(cur.impressions);
    const curClicks = Number(cur.clicks);
    const curRevenue = Number(cur.revenue);

    const prevSpend = Number(prev.spend);
    const prevImpressions = Number(prev.impressions);
    const prevClicks = Number(prev.clicks);
    const prevRevenue = Number(prev.revenue);

    const curRoas = pct2(curRevenue, curSpend);
    const curCtr = pct2(curClicks, curImpressions);

    const prevRoas = pct2(prevRevenue, prevSpend);
    const prevCtr = pct2(prevClicks, prevImpressions);

    let adRevenue = curMonthProfit.adRevenue || curRevenue;
    let totalAdSpend = curMonthProfit.adCost || curSpend;

    // Wing override (legacy) — month-level adRevenue/adSpend pulled from
    // the Wing dashboard adSummary snapshot. Only kicks in when the
    // snapshot shows non-zero adRevenue.
    if (wingAdSummary !== null && wingAdSummary.adRevenue > 0) {
      adRevenue = wingAdSummary.adRevenue;
      totalAdSpend = wingAdSummary.adSpend;
    }

    return {
      roas: curRoas,
      ctr: curCtr,
      adRevenue,
      totalAdSpend,
      prevRoas,
      prevCtr,
      prevAdRevenue: prevRevenue,
      prevTotalAdSpend: prevSpend,
    };
  }

  private buildRangeKpi(
    rangeAdCur: RangeAdMetrics,
    rangeAdPrev: RangeAdMetrics,
    rangeProfitCur: RangeProfitMetrics,
    rangeProfitPrev: RangeProfitMetrics,
    coupangAdSpendCur: number | null,
    coupangAdSpendPrev: number | null,
    wingTrafficCur: WingTrafficMetrics,
    wingTrafficPrev: WingTrafficMetrics,
  ): NonNullable<DashboardAdSummary['rangeKpi']> {
    const curAdSpend = Number(rangeAdCur.spend);
    const prevAdSpend = Number(rangeAdPrev.spend);
    const curAdConvRevenue = Number(rangeAdCur.revenue);
    const prevAdConvRevenue = Number(rangeAdPrev.revenue);

    const curAdRoas = pct2(curAdConvRevenue, curAdSpend);
    const prevAdRoas = pct2(prevAdConvRevenue, prevAdSpend);

    const curAdCtr = pct2(Number(rangeAdCur.clicks), Number(rangeAdCur.impressions));
    const prevAdCtr = pct2(Number(rangeAdPrev.clicks), Number(rangeAdPrev.impressions));

    // adCost: prefer Coupang ads daily KPIs (Drive replay) when supplied,
    // otherwise the Order-side adCost from profit calc.
    const rangeAdCostVal = coupangAdSpendCur ?? rangeProfitCur.adCost;
    const prevAdCostVal = coupangAdSpendPrev ?? rangeProfitPrev.adCost;
    // Revenue denominator: prefer Order revenue, fall back to Wing daily
    // facts on Drive replay so adRate reflects "광고비 / 매출" instead of
    // dividing by zero. Without this, ad-fed dashboards show adRate=0%
    // even when meaningful ad spend exists.
    const rangeRevenue = rangeProfitCur.revenue > 0
      ? rangeProfitCur.revenue
      : (wingTrafficCur.hasData ? wingTrafficCur.revenue : 0);
    const prevRangeRevenue = rangeProfitPrev.revenue > 0
      ? rangeProfitPrev.revenue
      : (wingTrafficPrev.hasData ? wingTrafficPrev.revenue : 0);

    const adRate = pct1(rangeAdCostVal, rangeRevenue);
    const prevAdRate = pct1(prevAdCostVal, prevRangeRevenue);
    const adRateChange = Math.round(
      (
        (rangeRevenue > 0 ? (rangeAdCostVal / rangeRevenue) * 100 : 0) -
        (prevRangeRevenue > 0 ? (prevAdCostVal / prevRangeRevenue) * 100 : 0)
      ) * 10,
    ) / 10;

    return {
      adSpend: curAdSpend,
      adConvRevenue: curAdConvRevenue,
      adRoas: curAdRoas,
      adCtr: curAdCtr,
      adCost: rangeAdCostVal,
      adRate,
      prevAdSpend: prevAdSpend,
      prevAdConvRevenue: prevAdConvRevenue,
      prevAdRoas: prevAdRoas,
      prevAdCtr: prevAdCtr,
      prevAdCost: prevAdCostVal,
      prevAdRate,
      adSpendChange: pct1(curAdSpend - prevAdSpend, prevAdSpend),
      adConvRevenueChange: pct1(curAdConvRevenue - prevAdConvRevenue, prevAdConvRevenue),
      adRoasChange: Math.round((curAdRoas - prevAdRoas) * 100) / 100,
      adCtrChange: Math.round((curAdCtr - prevAdCtr) * 100) / 100,
      adRateChange,
    };
  }

  private buildAdKpi(
    curMonthAd: RangeAdMetrics,
    prevMonthAd: RangeAdMetrics,
    rangeAdCur: RangeAdMetrics,
    curMonthProfit: RangeProfitMetrics,
  ): AdMetricsDetail {
    const adSpendVal = Number(curMonthAd.spend);
    const adImpVal = Number(curMonthAd.impressions);
    const adClicksVal = Number(curMonthAd.clicks);
    const adConvRevenueVal = Number(curMonthAd.revenue);

    const prevAdSpendVal = Number(prevMonthAd.spend);
    const prevAdImpVal = Number(prevMonthAd.impressions);
    const prevAdClicksVal = Number(prevMonthAd.clicks);
    const prevAdConvRevenueVal = Number(prevMonthAd.revenue);

    const curRoas = pct2(adConvRevenueVal, adSpendVal);
    const curCtr = pct2(adClicksVal, adImpVal);
    const prevRoas = pct2(prevAdConvRevenueVal, prevAdSpendVal);
    const prevCtr = pct2(prevAdClicksVal, prevAdImpVal);

    const adConversionsVal = Number(rangeAdCur.conversions ?? 0);
    const adCvrVal = pct2(adConversionsVal, adClicksVal);

    return {
      totalSpend: adSpendVal,
      impressions: adImpVal,
      clicks: adClicksVal,
      convRevenue: adConvRevenueVal,
      ctr: curCtr,
      roas: curRoas,
      conversions: adConversionsVal,
      cvr: adCvrVal,
      prevSpend: prevAdSpendVal,
      prevConvRevenue: prevAdConvRevenueVal,
      prevCtr: prevCtr,
      prevRoas: prevRoas,
      spendChange: pct1(adSpendVal - prevAdSpendVal, prevAdSpendVal),
      convRevenueChange: pct1(adConvRevenueVal - prevAdConvRevenueVal, prevAdConvRevenueVal),
      roasChange: Math.round((curRoas - prevRoas) * 100) / 100,
      ctrChange: Math.round((curCtr - prevCtr) * 100) / 100,
      totalRevenue: curMonthProfit.revenue,
    } satisfies AdMetricsDetail;
  }

  private buildDailyAd(
    listingRows: { date: string; ad_cost: number }[],
    coupangRows: { date: string; ad_cost: number }[],
  ): DailyAdItem[] | undefined {
    // Merge by date — prefer the higher of the two values for each calendar
    // day (Drive replay only writes ads to the account-level snapshot, while
    // live workspaces write to the listing-level snapshot). The dashboard
    // only renders a single line so we surface the larger source.
    const byDate = new Map<string, number>();
    for (const r of listingRows) {
      byDate.set(r.date, Number(r.ad_cost));
    }
    for (const r of coupangRows) {
      const existing = byDate.get(r.date) ?? 0;
      const next = Number(r.ad_cost);
      if (next > existing) byDate.set(r.date, next);
    }
    if (byDate.size === 0) return undefined;
    const sorted = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
    return sorted.map(([date, adCost]) => ({ date, adCost } satisfies DailyAdItem));
  }

  private buildBenchmark(
    curMonthAd: RangeAdMetrics,
    curMonthProfit: RangeProfitMetrics,
  ): IndustryBenchmark {
    const myAdRateVal = pct1(
      curMonthProfit.adCost || Number(curMonthAd.spend),
      curMonthProfit.revenue || Number(curMonthAd.revenue),
    );

    const adSpendVal = Number(curMonthAd.spend);
    const adRevVal = Number(curMonthAd.revenue);
    const adImpVal = Number(curMonthAd.impressions);
    const adClicksVal = Number(curMonthAd.clicks);

    const myRoasVal = pct2(adRevVal, adSpendVal);
    const myCtrVal = pct2(adClicksVal, adImpVal);

    return {
      avgAdRate: 10,
      avgProfitRate: 8,
      avgRoas: 350,
      avgCtr: 0.3,
      avgCvr: 8,
      myAdRate: myAdRateVal,
      myRoas: myRoasVal,
      myCtr: myCtrVal,
      adRateVsIndustry: myAdRateVal > 0
        ? (myAdRateVal > 10 ? 'above' : myAdRateVal < 5 ? 'below' : 'normal')
        : 'none',
      roasVsIndustry: myRoasVal > 0
        ? (myRoasVal > 400 ? 'above' : myRoasVal < 200 ? 'below' : 'normal')
        : 'none',
    } satisfies IndustryBenchmark;
  }

  private buildSaving(
    curMonthProfit: RangeProfitMetrics,
    prevMonthProfit: RangeProfitMetrics,
    curAd: RangeAdMetrics,
    prevAd: RangeAdMetrics,
    useCoupang: boolean,
  ): NonNullable<DashboardAdSummary['saving']> {
    const curSpend = useCoupang ? Number(curAd.spend) : curMonthProfit.adCost;
    const prevSpend = useCoupang ? Number(prevAd.spend) : prevMonthProfit.adCost;
    const adSaving =
      prevSpend > 0 && curSpend < prevSpend ? Math.round(prevSpend - curSpend) : 0;
    return {
      adSaving,
      prevAdCost: prevSpend,
    };
  }

  private buildWingAdData(wingAdSummary: WingAdSummaryResult): WingAdSummary {
    return {
      adRevenue: wingAdSummary.adRevenue,
      adSpend: wingAdSummary.adSpend,
      adRoas: wingAdSummary.adRoas,
      rawAdSummary: wingAdSummary.rawAdSummary ?? null,
    } satisfies WingAdSummary;
  }

}

function mergeAdMetrics(
  baseline: RangeAdMetrics,
  coupang: CoupangAdsMetrics,
  useCoupang: boolean,
): RangeAdMetrics {
  if (!useCoupang) return baseline;
  return {
    spend: coupang.spend,
    revenue: coupang.revenue,
    impressions: coupang.impressions,
    clicks: coupang.clicks,
    conversions: coupang.conversions,
  } satisfies RangeAdMetrics;
}
