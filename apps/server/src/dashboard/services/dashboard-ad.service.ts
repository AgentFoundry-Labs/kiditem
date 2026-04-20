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
import { pct1, pct2 } from '../helpers/percent';

@Injectable()
export class DashboardAdService {
  private readonly logger = new Logger(DashboardAdService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSummary(ctx: DashboardContext, companyId: string): Promise<DashboardAdSummary> {
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
        rangeProfitCur,
        rangeProfitPrev,
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
        // Current month profit (Order-based, v2 I3 lineItem canonical)
        calculateProfitForRange(this.prisma, companyId, monthStart, monthEnd),
        // Previous month profit (Order-based)
        calculateProfitForRange(this.prisma, companyId, prevMonthDate, monthStart),
        // Range profit current period (legacy L326: rangeProfitCur.adCost for rangeKpi)
        calculateProfitForRange(this.prisma, companyId, dateRange.start, dateRange.end),
        // Range profit previous period (legacy L344: rangeProfitPrev.adCost for prevAdCost)
        calculateProfitForRange(this.prisma, companyId, dateRange.prevStart, dateRange.prevEnd),
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
        rangeKpi: this.buildRangeKpi(rangeAdCur, rangeAdPrev, rangeProfitCur, rangeProfitPrev),
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
    const curRoas = pct2(curRevenue, curSpend);
    const curCtr = pct2(curClicks, curImpressions);

    // Prev ROAS/CTR from ads table (prev month)
    const prevRoas = pct2(prevRevenue, prevSpend);
    const prevCtr = pct2(prevClicks, prevImpressions);

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
    rangeProfitCur: RangeProfitMetrics,
    rangeProfitPrev: RangeProfitMetrics,
  ): NonNullable<DashboardAdSummary['rangeKpi']> {
    const curAdSpend = Number(rangeAdCur.spend);
    const prevAdSpend = Number(rangeAdPrev.spend);
    const curAdConvRevenue = Number(rangeAdCur.revenue);
    const prevAdConvRevenue = Number(rangeAdPrev.revenue);

    const curAdRoas = pct2(curAdConvRevenue, curAdSpend);
    const prevAdRoas = pct2(prevAdConvRevenue, prevAdSpend);

    const curAdCtr = pct2(Number(rangeAdCur.clicks), Number(rangeAdCur.impressions));
    const prevAdCtr = pct2(Number(rangeAdPrev.clicks), Number(rangeAdPrev.impressions));

    // Legacy L326: const rangeAdCostVal = rangeProfitCur.adCost
    const rangeAdCostVal = rangeProfitCur.adCost;
    const rangeRevenue = rangeProfitCur.revenue;
    const prevRangeRevenue = rangeProfitPrev.revenue;

    const adRate = pct1(rangeAdCostVal, rangeRevenue);
    const prevAdRate = pct1(rangeProfitPrev.adCost, prevRangeRevenue);
    // Legacy L346: adRateChange computed from range-period revenue (not hardcoded 0).
    // Inline difference — the two terms are 2-decimal percents internally, so we
    // round the final delta to 1dp rather than chaining pct1 helpers.
    const adRateChange = Math.round(
      (
        (rangeRevenue > 0 ? (rangeAdCostVal / rangeRevenue) * 100 : 0) -
        (prevRangeRevenue > 0 ? (rangeProfitPrev.adCost / prevRangeRevenue) * 100 : 0)
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
      prevAdCost: rangeProfitPrev.adCost,
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
    const curRoas = pct2(adConvRevenueVal, adSpendVal);
    const curCtr = pct2(adClicksVal, adImpVal);
    const prevRoas = pct2(prevAdConvRevenueVal, prevAdSpendVal);
    const prevCtr = pct2(prevAdClicksVal, prevAdImpVal);

    // A11 + legacy parity quirk: CVR numerator is from the selected *range*
    // (rangeAdCur.conversions, L509), but denominator uses *monthly* clicks
    // (adClicksVal). When a non-month range is selected this under-reports CVR
    // because few-range-conversions / many-month-clicks. Legacy does exactly
    // this; we preserve it for parity rather than "fix" silently. If dashboard
    // consumers complain about CVR accuracy for sub-month ranges, swap the
    // denominator to rangeAdCur.clicks here.
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
    const myAdRateVal = pct1(curMonthProfit.adCost, curMonthProfit.revenue);

    const adSpendVal = Number(curMonthAd.spend);
    const adRevVal = Number(curMonthAd.revenue);
    const adImpVal = Number(curMonthAd.impressions);
    const adClicksVal = Number(curMonthAd.clicks);

    const myRoasVal = pct2(adRevVal, adSpendVal);
    const myCtrVal = pct2(adClicksVal, adImpVal);

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
