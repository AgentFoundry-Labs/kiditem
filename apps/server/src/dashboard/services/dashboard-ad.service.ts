import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  DashboardAdSummary,
  AdMetricsDetail,
  IndustryBenchmark,
  DailyAdItem,
  WingAdSummary,
} from '@kiditem/shared';
import type { DashboardContext } from './context';
import { calculateProfitForRange, type RangeProfitMetrics } from '../helpers/profit-calculator';
import { aggregateAdForRange, type RangeAdMetrics } from '../helpers/ad-aggregator';
import { fetchWingAdSummary, type WingAdSummaryResult } from '../helpers/wing-ad-summary';

@Injectable()
export class DashboardAdService {
  private readonly logger = new Logger(DashboardAdService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSummary(ctx: DashboardContext): Promise<DashboardAdSummary> {
    try {
      const { year, month, monthStart, monthEnd, prevMonthDate, dateRange, now } = ctx;

      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [
        adAggCurrentMonth,
        adAggPrevMonth,
        rangeAdCur,
        rangeAdPrev,
        dailyAdRows,
        curMonthProfit,
        prevMonthProfit,
        wingAdSummary,
      ] = await Promise.all([
        // Current calendar-month ad aggregation (replaces inline L78-88 raw SQL)
        aggregateAdForRange(this.prisma, monthStart, monthEnd),
        // Previous calendar-month ad aggregation (replaces inline L89-99 raw SQL)
        aggregateAdForRange(this.prisma, prevMonthDate, monthStart),
        // Range KPI current period
        aggregateAdForRange(this.prisma, dateRange.start, dateRange.end),
        // Range KPI previous period
        aggregateAdForRange(this.prisma, dateRange.prevStart, dateRange.prevEnd),
        // 30-day daily ad cost (L224-232)
        this.prisma.$queryRaw<{ date: string; ad_cost: number }[]>`
          SELECT
            TO_CHAR(date, 'YYYY-MM-DD') AS date,
            COALESCE(SUM(spend), 0)::int AS ad_cost
          FROM ads
          WHERE date >= ${thirtyDaysAgo}::date
          GROUP BY 1
          ORDER BY 1
        `,
        // Current month profit (Order-based)
        calculateProfitForRange(this.prisma, monthStart, monthEnd),
        // Previous month profit (Order-based)
        calculateProfitForRange(this.prisma, prevMonthDate, monthStart),
        // Wing adSummary snapshot
        fetchWingAdSummary(this.prisma, year, month, monthStart),
      ]);

      return {
        monthly: this.buildMonthly(
          adAggCurrentMonth,
          adAggPrevMonth,
          curMonthProfit,
          wingAdSummary,
        ),
        rangeKpi: this.buildRangeKpi(rangeAdCur, rangeAdPrev, curMonthProfit),
        adKpi: this.buildAdKpi(
          adAggCurrentMonth,
          adAggPrevMonth,
          rangeAdCur,
          curMonthProfit,
        ),
        dailyAd: this.buildDailyAd(dailyAdRows),
        industryBenchmark: this.buildBenchmark(adAggCurrentMonth, curMonthProfit),
        saving: this.buildSaving(curMonthProfit, prevMonthProfit),
        wingAdData: wingAdSummary !== null ? this.buildWingAdData(wingAdSummary) : null,
      } satisfies DashboardAdSummary;
    } catch (error) {
      this.logger.error('Failed to get ad summary', error);
      throw new InternalServerErrorException('Failed to get ad summary');
    }
  }

  // ── Private builders ───────────────────────────────────────────────────────

  private buildMonthly(
    curAd: RangeAdMetrics,
    prevAd: RangeAdMetrics,
    curMonthProfit: RangeProfitMetrics,
    wingAdSummary: WingAdSummaryResult | null,
  ): DashboardAdSummary['monthly'] {
    const curSpend = Number(curAd.spend);
    const curImpressions = Number(curAd.impressions);
    const curClicks = Number(curAd.clicks);
    const curRevenue = Number(curAd.revenue);

    const prevSpend = Number(prevAd.spend);
    const prevImpressions = Number(prevAd.impressions);
    const prevClicks = Number(prevAd.clicks);
    const prevRevenue = Number(prevAd.revenue);

    // Base ROAS/CTR from ads table (current month)
    const curRoas = curSpend > 0 ? Math.round((curRevenue / curSpend) * 100 * 100) / 100 : 0;
    const curCtr = curImpressions > 0 ? Math.round((curClicks / curImpressions) * 100 * 100) / 100 : 0;

    // Prev ROAS/CTR from ads table (prev month)
    const prevRoas = prevSpend > 0 ? Math.round((prevRevenue / prevSpend) * 100 * 100) / 100 : 0;
    const prevCtr = prevImpressions > 0 ? Math.round((prevClicks / prevImpressions) * 100 * 100) / 100 : 0;

    // Base adRevenue and totalAdSpend from calculateProfitForRange (L297-299 pattern)
    let adRevenue = curMonthProfit.adRevenue;
    let totalAdSpend = curMonthProfit.adCost;

    // A11 / Wing override: when wingAdSummary.adRevenue > 0, override monthly metrics (L469-470)
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
    curMonthProfit: RangeProfitMetrics,
  ): NonNullable<DashboardAdSummary['rangeKpi']> {
    const curAdSpend = Number(rangeAdCur.spend);
    const prevAdSpend = Number(rangeAdPrev.spend);
    const curAdConvRevenue = Number(rangeAdCur.revenue);
    const prevAdConvRevenue = Number(rangeAdPrev.revenue);

    const curAdRoas = curAdSpend > 0
      ? Math.round((curAdConvRevenue / curAdSpend) * 100 * 100) / 100
      : 0;
    const prevAdRoas = prevAdSpend > 0
      ? Math.round((prevAdConvRevenue / prevAdSpend) * 100 * 100) / 100
      : 0;

    const curAdCtr = Number(rangeAdCur.impressions) > 0
      ? Math.round((Number(rangeAdCur.clicks) / Number(rangeAdCur.impressions)) * 100 * 100) / 100
      : 0;
    const prevAdCtr = Number(rangeAdPrev.impressions) > 0
      ? Math.round((Number(rangeAdPrev.clicks) / Number(rangeAdPrev.impressions)) * 100 * 100) / 100
      : 0;

    const rangeAdCostVal = curMonthProfit.adCost;
    const rangeRevenue = curMonthProfit.revenue;

    return {
      adSpend: curAdSpend,
      adConvRevenue: curAdConvRevenue,
      adRoas: curAdRoas,
      adCtr: curAdCtr,
      adCost: rangeAdCostVal,
      adRate: rangeRevenue > 0
        ? Math.round((rangeAdCostVal / rangeRevenue) * 1000) / 10
        : 0,
      prevAdSpend: prevAdSpend,
      prevAdConvRevenue: prevAdConvRevenue,
      prevAdRoas: prevAdRoas,
      prevAdCtr: prevAdCtr,
      adSpendChange: prevAdSpend > 0
        ? Math.round(((curAdSpend - prevAdSpend) / prevAdSpend) * 1000) / 10
        : 0,
      adConvRevenueChange: prevAdConvRevenue > 0
        ? Math.round(((curAdConvRevenue - prevAdConvRevenue) / prevAdConvRevenue) * 1000) / 10
        : 0,
      adRoasChange: Math.round((curAdRoas - prevAdRoas) * 100) / 100,
      adCtrChange: Math.round((curAdCtr - prevAdCtr) * 100) / 100,
      adRateChange: 0, // adRate change requires prevRangeRevenue — not owned by this service
    };
  }

  private buildAdKpi(
    curMonthAd: RangeAdMetrics,
    prevMonthAd: RangeAdMetrics,
    rangeAdCur: RangeAdMetrics,
    curMonthProfit: RangeProfitMetrics,
  ): AdMetricsDetail {
    // Base monthly metrics mirror legacy L504-531
    const adSpendVal = Number(curMonthAd.spend);
    const adImpVal = Number(curMonthAd.impressions);
    const adClicksVal = Number(curMonthAd.clicks);
    const adConvRevenueVal = Number(curMonthAd.revenue);

    const prevAdSpendVal = Number(prevMonthAd.spend);
    const prevAdImpVal = Number(prevMonthAd.impressions);
    const prevAdClicksVal = Number(prevMonthAd.clicks);
    const prevAdConvRevenueVal = Number(prevMonthAd.revenue);

    // ctr and roas from monthly data
    const curRoas = adSpendVal > 0
      ? Math.round((adConvRevenueVal / adSpendVal) * 100 * 100) / 100
      : 0;
    const curCtr = adImpVal > 0
      ? Math.round((adClicksVal / adImpVal) * 100 * 100) / 100
      : 0;
    const prevRoas = prevAdSpendVal > 0
      ? Math.round((prevAdConvRevenueVal / prevAdSpendVal) * 100 * 100) / 100
      : 0;
    const prevCtr = prevAdImpVal > 0
      ? Math.round((prevAdClicksVal / prevAdImpVal) * 100 * 100) / 100
      : 0;

    // A11: conversions from rangeAdCur (matching legacy L509: rangeAdCur.conversions)
    const adConversionsVal = Number(rangeAdCur.conversions ?? 0);
    // A11: cvr = conversions / clicks (guarded for 0 clicks)
    const adCvrVal = adClicksVal > 0
      ? Math.round((adConversionsVal / adClicksVal) * 10000) / 100
      : 0;

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
      spendChange: prevAdSpendVal > 0
        ? Math.round(((adSpendVal - prevAdSpendVal) / prevAdSpendVal) * 1000) / 10
        : 0,
      convRevenueChange: prevAdConvRevenueVal > 0
        ? Math.round(((adConvRevenueVal - prevAdConvRevenueVal) / prevAdConvRevenueVal) * 1000) / 10
        : 0,
      roasChange: Math.round((curRoas - prevRoas) * 100) / 100,
      ctrChange: Math.round((curCtr - prevCtr) * 100) / 100,
      totalRevenue: curMonthProfit.revenue,
    } satisfies AdMetricsDetail;
  }

  private buildDailyAd(
    rows: { date: string; ad_cost: number }[],
  ): DailyAdItem[] | undefined {
    if (rows.length === 0) return undefined;
    return rows.map((r) => ({
      date: r.date,
      adCost: Number(r.ad_cost),
      // adRate requires per-day revenue (sales domain concern) — omitted
    } satisfies DailyAdItem));
  }

  private buildBenchmark(
    curMonthAd: RangeAdMetrics,
    curMonthProfit: RangeProfitMetrics,
  ): IndustryBenchmark {
    const myAdRateVal = curMonthProfit.revenue > 0
      ? Math.round((curMonthProfit.adCost / curMonthProfit.revenue) * 1000) / 10
      : 0;

    const adSpendVal = Number(curMonthAd.spend);
    const adRevVal = Number(curMonthAd.revenue);
    const adImpVal = Number(curMonthAd.impressions);
    const adClicksVal = Number(curMonthAd.clicks);

    const myRoasVal = adSpendVal > 0
      ? Math.round((adRevVal / adSpendVal) * 100 * 100) / 100
      : 0;
    const myCtrVal = adImpVal > 0
      ? Math.round((adClicksVal / adImpVal) * 100 * 100) / 100
      : 0;

    return {
      // Industry reference averages from legacy L612-623 (copied as-is)
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
  ): NonNullable<DashboardAdSummary['saving']> {
    // Mirror legacy L553-555 (comparison.adSaving / prevAdCost)
    const adSaving =
      prevMonthProfit.adCost > 0 && curMonthProfit.adCost < prevMonthProfit.adCost
        ? Math.round(prevMonthProfit.adCost - curMonthProfit.adCost)
        : 0;
    return {
      adSaving,
      prevAdCost: prevMonthProfit.adCost,
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
