import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import {
  PROFIT_CALCULATION_REPOSITORY_PORT,
  type ProfitCalculationRepositoryPort,
  type RangeProfitMetrics,
} from '../port/out/repository/profit-calculation.repository.port';
import {
  WING_AD_SUMMARY_REPOSITORY_PORT,
  type WingAdSummaryRepositoryPort,
  type WingAdSummaryResult,
} from '../port/out/repository/wing-ad-summary.repository.port';
import {
  WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT,
  type WingTrafficAggregationRepositoryPort,
  type AdMetricSource,
  type CoupangAdsCoverage,
  type CoupangAdsMetrics,
  type WingTrafficMetrics,
} from '../port/out/repository/wing-traffic-aggregation.repository.port';
import { buildEffectivePeriod } from '../../domain/util/effective-period';
import { pct1, pct2 } from '../../domain/util/percent';
import { kstDayStart } from '../../../../common/kst';
import type { DashboardContext } from '../../domain/context';
import type {
  DashboardAdSummary,
  AdMetricsDetail,
  IndustryBenchmark,
  DailyAdItem,
  WingAdSummary,
} from '@kiditem/shared/dashboard';

@Injectable()
export class DashboardAdService {
  private readonly logger = new Logger(DashboardAdService.name);

  constructor(
    @Inject(PROFIT_CALCULATION_REPOSITORY_PORT)
    private readonly profitCalculation: ProfitCalculationRepositoryPort,
    @Inject(WING_AD_SUMMARY_REPOSITORY_PORT)
    private readonly wingAdSummary: WingAdSummaryRepositoryPort,
    @Inject(WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT)
    private readonly wingTrafficRepository: WingTrafficAggregationRepositoryPort,
  ) {}

  async getSummary(
    ctx: DashboardContext,
    organizationId: string,
  ): Promise<DashboardAdSummary> {
    try {
      const { year, month, monthStart, monthEnd, prevMonthDate, dateRange, anchor } = ctx;

      // 30-day daily ad cost window — KST-anchored cutoff for owner-published
      // Coupang account daily KPI rows.
      const thirtyDaysAgo = new Date(
        kstDayStart(anchor).getTime() - 30 * 24 * 60 * 60 * 1000,
      );

      // Preset current/month/day windows may be clipped to the latest known
      // source date. Custom ranges remain exact, including future dates, so
      // their missing coverage is visible to the caller.
      const currentMonthAdRange = presetAdRange(
        ctx,
        monthStart,
        monthEnd,
        'month',
      );
      const currentSelectedAdRange = presetAdRange(
        ctx,
        dateRange.start,
        dateRange.end,
        ctx.effectiveRange === 'day'
          ? 'day'
          : ctx.effectiveRange === 'month'
            ? 'month'
            : null,
      );
      const previousSelectedAdRange = previousPresetAdRange(
        ctx,
        dateRange.prevStart,
        dateRange.prevEnd,
        ctx.effectiveRange === 'day'
          ? 'day'
          : ctx.effectiveRange === 'month'
            ? 'month'
            : null,
      );

      const [
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
        this.profitCalculation.calculateForRange(organizationId, monthStart, monthEnd),
        this.profitCalculation.calculateForRange(organizationId, prevMonthDate, monthStart),
        this.profitCalculation.calculateForRange(organizationId, dateRange.start, dateRange.end),
        this.profitCalculation.calculateForRange(organizationId, dateRange.prevStart, dateRange.prevEnd),
        this.wingAdSummary.fetchCurrentMonthSummary(organizationId, year, month, monthStart),
        this.wingTrafficRepository.aggregateCoupangAds(
          organizationId,
          currentMonthAdRange.from,
          currentMonthAdRange.to,
        ),
        this.wingTrafficRepository.aggregateCoupangAds(organizationId, prevMonthDate, monthStart),
        this.wingTrafficRepository.aggregateCoupangAds(
          organizationId,
          currentSelectedAdRange.from,
          currentSelectedAdRange.to,
        ),
        this.wingTrafficRepository.aggregateCoupangAds(
          organizationId,
          previousSelectedAdRange.from,
          previousSelectedAdRange.to,
        ),
        this.wingTrafficRepository.fetchDailyAds(organizationId, thirtyDaysAgo),
        this.wingTrafficRepository.aggregateTraffic(organizationId, monthStart, monthEnd),
        this.wingTrafficRepository.findLatestDataDate(organizationId),
      ]);

      // The complete owner range wins, including explicit all-zero rows.
      // Partial/missing owner coverage is unavailable for every account KPI;
      // listing/order aggregates cannot prove complete account coverage.
      const monthlyMetrics = resolveAdMetrics(coupangAdsCurMonth);
      const monthlyPrev = resolveAdMetrics(coupangAdsPrevMonth);
      const rangeMetrics = resolveAdMetrics(coupangAdsCurRange);
      const rangePrev = resolveAdMetrics(coupangAdsPrevRange);
      this.logger.debug({
        msg: 'dashboard-ad.getSummary',
        organizationId,
        anchorShifted: ctx.anchorShifted,
        monthlySource: monthlyMetrics.source,
        rangeSource: rangeMetrics.source,
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
          prevMonthProfit,
        ),
        rangeKpi: this.buildRangeKpi(
          rangeMetrics,
          rangePrev,
          rangeProfitCur,
          rangeProfitPrev,
          wingTrafficCurRange,
          wingTrafficPrevRange,
        ),
        adKpi: this.buildAdKpi(monthlyMetrics, monthlyPrev, curMonthProfit),
        dailyAd: this.buildDailyAd(coupangAdsDaily),
        industryBenchmark: this.buildBenchmark(monthlyMetrics, curMonthProfit),
        saving: this.buildSaving(curMonthProfit, prevMonthProfit, monthlyMetrics, monthlyPrev),
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
    cur: ResolvedAdMetrics,
    prev: ResolvedAdMetrics,
    curMonthProfit: RangeProfitMetrics,
    prevMonthProfit: RangeProfitMetrics,
  ): DashboardAdSummary['monthly'] {
    const current = periodAdValues(cur, curMonthProfit);
    const previous = periodAdValues(prev, prevMonthProfit);

    return {
      roas: current.roas,
      ctr: safeRatio(current.clicks, current.impressions),
      adRevenue: current.revenue,
      totalAdSpend: current.spend,
      prevRoas: previous.roas,
      prevCtr: safeRatio(previous.clicks, previous.impressions),
      prevAdRevenue: previous.revenue,
      prevTotalAdSpend: previous.spend,
      source: current.source,
      coverage: current.coverage,
    };
  }

  private buildRangeKpi(
    rangeAdCur: ResolvedAdMetrics,
    rangeAdPrev: ResolvedAdMetrics,
    rangeProfitCur: RangeProfitMetrics,
    rangeProfitPrev: RangeProfitMetrics,
    wingTrafficCur: WingTrafficMetrics,
    wingTrafficPrev: WingTrafficMetrics,
  ): NonNullable<DashboardAdSummary['rangeKpi']> {
    const current = periodAdValues(rangeAdCur, rangeProfitCur);
    const previous = periodAdValues(rangeAdPrev, rangeProfitPrev);

    const rangeAdCostVal = current.spend;
    const prevAdCostVal = previous.spend;
    // Revenue denominator: prefer Order revenue, fall back to Wing daily
    // facts on Drive replay so adRate reflects "광고비 / 매출" instead of
    // dividing by zero. Without this, ad-fed dashboards show adRate=0%
    // even when meaningful ad spend exists.
    const rangeRevenue = rangeProfitCur.revenue > 0
      ? rangeProfitCur.revenue
      : (wingTrafficCur.hasData ? wingTrafficCur.revenue : null);
    const prevRangeRevenue = rangeProfitPrev.revenue > 0
      ? rangeProfitPrev.revenue
      : (wingTrafficPrev.hasData ? wingTrafficPrev.revenue : null);

    const adRate = safePercent(rangeAdCostVal, rangeRevenue);
    const prevAdRate = safePercent(prevAdCostVal, prevRangeRevenue);
    const adRateChange = oneDecimalDifference(adRate, prevAdRate);
    const curAdRoas = safeRatio(current.revenue, current.spend);
    const prevAdRoas = safeRatio(previous.revenue, previous.spend);
    const curAdCtr = safeRatio(current.clicks, current.impressions);
    const prevAdCtr = safeRatio(previous.clicks, previous.impressions);

    return {
      adSpend: current.spend,
      adConvRevenue: current.revenue,
      adRoas: curAdRoas,
      adCtr: curAdCtr,
      adCost: rangeAdCostVal,
      adRate,
      prevAdSpend: previous.spend,
      prevAdConvRevenue: previous.revenue,
      prevAdRoas: prevAdRoas,
      prevAdCtr: prevAdCtr,
      prevAdCost: prevAdCostVal,
      prevAdRate,
      adSpendChange: percentChange(current.spend, previous.spend),
      adConvRevenueChange: percentChange(current.revenue, previous.revenue),
      adRoasChange: pointChange(curAdRoas, prevAdRoas),
      adCtrChange: pointChange(curAdCtr, prevAdCtr),
      adRateChange: oneDecimalDifference(adRate, prevAdRate),
      source: current.source,
      coverage: current.coverage,
    };
  }

  private buildAdKpi(
    curMonthAd: ResolvedAdMetrics,
    prevMonthAd: ResolvedAdMetrics,
    curMonthProfit: RangeProfitMetrics,
  ): AdMetricsDetail {
    const current = accountAdValues(curMonthAd);
    const previous = accountAdValues(prevMonthAd);

    return {
      totalSpend: current.spend,
      impressions: current.impressions,
      clicks: current.clicks,
      convRevenue: current.revenue,
      ctr: current.ctr,
      roas: current.roas,
      conversions: current.orders,
      cvr: current.cvr,
      providerConversionRate: current.providerConversionRate,
      coverage: curMonthAd.coverage,
      source: curMonthAd.source,
      prevSpend: previous.spend,
      prevConvRevenue: previous.revenue,
      prevCtr: previous.ctr,
      prevRoas: previous.roas,
      spendChange: percentChange(current.spend, previous.spend),
      convRevenueChange: percentChange(current.revenue, previous.revenue),
      roasChange: pointChange(current.roas, previous.roas),
      ctrChange: pointChange(current.ctr, previous.ctr),
      totalRevenue: hasOrderEvidence(curMonthProfit) ? curMonthProfit.revenue : null,
    } satisfies AdMetricsDetail;
  }

  private buildDailyAd(
    coupangRows: { date: string; ad_cost: number }[],
  ): DailyAdItem[] | undefined {
    // The owner account row is the only daily source. Explicit zeroes are
    // retained; linked listing facts cannot prove account-level coverage.
    const byDate = new Map<string, DailyAdItem>();
    for (const r of coupangRows) {
      byDate.set(r.date, {
        date: r.date,
        adCost: Number(r.ad_cost),
        source: 'coupang_ads',
      });
    }
    if (byDate.size === 0) return undefined;
    return [...byDate.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((row) => row satisfies DailyAdItem);
  }

  private buildBenchmark(
    curMonthAd: ResolvedAdMetrics,
    curMonthProfit: RangeProfitMetrics,
  ): IndustryBenchmark {
    const current = periodAdValues(curMonthAd, curMonthProfit);
    const myAdRateVal = pct1(
      curMonthProfit.adCost || Number(curMonthAd.spend),
      curMonthProfit.revenue || Number(curMonthAd.revenue),
    );

    const adSpendVal = current.spend ?? 0;
    const adRevVal = current.revenue ?? 0;
    const adImpVal = current.impressions ?? 0;
    const adClicksVal = current.clicks ?? 0;

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
    curAd: ResolvedAdMetrics,
    prevAd: ResolvedAdMetrics,
  ): NonNullable<DashboardAdSummary['saving']> {
    const current = periodAdValues(curAd, curMonthProfit);
    const previous = periodAdValues(prevAd, prevMonthProfit);
    const adSaving = current.spend !== null && previous.spend !== null
      && previous.spend > 0 && current.spend < previous.spend
      ? Math.round(previous.spend - current.spend)
      : null;
    return {
      adSaving,
      prevAdCost: previous.spend,
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

interface ResolvedAdMetrics {
  spend: number | null;
  revenue: number | null;
  impressions: number | null;
  clicks: number | null;
  /** Provider attributed selling units; evidence only for display/debug. */
  conversions: number | null;
  /** Owner order count. Listing/order fallbacks do not invent this value. */
  orders: number | null;
  providerConversionRate: number | null;
  source: AdMetricSource;
  coverage: CoupangAdsCoverage | null;
  available: boolean;
  /** Account-level totals are trustworthy only from a complete owner range. */
  accountMetricsAvailable: boolean;
}

interface AdPeriodValues extends ResolvedAdMetrics {
  ctr: number | null;
  roas: number | null;
  cvr: number | null;
}

function resolveAdMetrics(
  coupang: CoupangAdsMetrics,
): ResolvedAdMetrics {
  // Owner coverage is authoritative even when every additive value is zero.
  if (coupang.hasData) {
    return {
      spend: coupang.spend,
      revenue: coupang.revenue,
      impressions: coupang.impressions,
      clicks: coupang.clicks,
      conversions: coupang.conversions,
      orders: coupang.orders,
      providerConversionRate: coupang.providerConversionRate ?? null,
      source: 'coupang_ads',
      coverage: coupang.coverage ?? null,
      available: true,
      accountMetricsAvailable: true,
    };
  }

  // Listing/order aggregates have no proof that they cover the complete
  // account range. Never present them as account KPIs: preserve the owner's
  // partial coverage so callers can show missing dates explicitly.
  return unavailableAdMetrics(coupang.coverage ?? null);
}

function periodAdValues(
  metrics: ResolvedAdMetrics,
  _orderMetrics: RangeProfitMetrics,
): AdPeriodValues {
  return {
    ...metrics,
    ctr: safeRatio(metrics.clicks, metrics.impressions),
    roas: safeRatio(metrics.revenue, metrics.spend),
    // Only owner-published order counts are valid for report CVR.
    cvr: safeRatio(metrics.orders, metrics.clicks),
  };
}

function accountAdValues(metrics: ResolvedAdMetrics): AdPeriodValues {
  if (!metrics.accountMetricsAvailable) {
    return {
      ...metrics,
      spend: null,
      revenue: null,
      impressions: null,
      clicks: null,
      conversions: null,
      orders: null,
      providerConversionRate: null,
      ctr: null,
      roas: null,
      cvr: null,
    };
  }
  return periodAdValues(metrics, EMPTY_PROFIT_METRICS);
}

function hasOrderEvidence(metrics: Pick<RangeProfitMetrics, 'revenue' | 'orderCount'>): boolean {
  return metrics.revenue !== 0 || metrics.orderCount > 0;
}

function unavailableAdMetrics(coverage: CoupangAdsCoverage | null = null): ResolvedAdMetrics {
  return {
    spend: null,
    revenue: null,
    impressions: null,
    clicks: null,
    conversions: null,
    orders: null,
    providerConversionRate: null,
    source: 'unavailable',
    coverage,
    available: false,
    accountMetricsAvailable: false,
  };
}

function safeRatio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return pct2(numerator, denominator);
}

function safePercent(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return pct1(numerator, denominator);
}

function percentChange(
  current: number | null,
  previous: number | null,
): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return pct1(current - previous, previous);
}

function pointChange(
  current: number | null,
  previous: number | null,
): number | null {
  if (current === null || previous === null) return null;
  return Math.round((current - previous) * 100) / 100;
}

function oneDecimalDifference(
  current: number | null,
  previous: number | null,
): number | null {
  if (current === null || previous === null) return null;
  return Math.round((current - previous) * 10) / 10;
}

interface AdQueryRange {
  from: Date;
  to: Date;
}

/**
 * Clip only the current preset windows. Custom and historical windows stay
 * exact so future/uncovered dates remain visible in `coverage`.
 */
function presetAdRange(
  ctx: DashboardContext,
  from: Date,
  to: Date,
  preset: 'month' | 'day' | null,
): AdQueryRange {
  if (!preset) return { from, to };
  if (preset === 'day') {
    const todayStart = kstDayStart(ctx.anchor);
    return {
      from: new Date(todayStart.getTime() - 24 * 60 * 60 * 1000),
      to: todayStart,
    };
  }
  // Current/month/day presets are allowed to query only through the last
  // completed KST business day. The explicit dashboard anchor is the cutoff;
  // provider latest-row dates must not shrink the requested range.
  const knownThroughExclusive = kstDayStart(ctx.anchor);
  return {
    from,
    // An all-current-day preset has no completed day yet. Keep the empty
    // half-open range so the owner adapter returns unavailable rather than
    // accidentally admitting a same-day row.
    to: knownThroughExclusive.getTime() <= from.getTime()
      ? from
      : knownThroughExclusive.getTime() < to.getTime()
        ? knownThroughExclusive
        : to,
  };
}

function previousPresetAdRange(
  ctx: DashboardContext,
  from: Date,
  to: Date,
  preset: 'month' | 'day' | null,
): AdQueryRange {
  if (preset !== 'day') return { from, to };
  const todayStart = kstDayStart(ctx.anchor);
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  return {
    from: new Date(yesterdayStart.getTime() - 24 * 60 * 60 * 1000),
    to: yesterdayStart,
  };
}

const EMPTY_PROFIT_METRICS: RangeProfitMetrics = {
  revenue: 0,
  costOfGoods: 0,
  commission: 0,
  shippingCost: 0,
  adCost: 0,
  otherCost: 0,
  netProfit: 0,
  profitRate: 0,
  orderCount: 0,
  adRevenue: 0,
  adImpressions: 0,
  adClicks: 0,
  adConversions: 0,
};
