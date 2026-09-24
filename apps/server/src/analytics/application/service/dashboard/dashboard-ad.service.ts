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
} from '../../port/out/repository/dashboard/profit-calculation.repository.port';
import {
  WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT,
  type WingTrafficAggregationRepositoryPort,
  type CoupangAdsMetrics,
  type WingTrafficMetrics,
  type DashboardAdRateFacts,
} from '../../port/out/repository/dashboard/wing-traffic-aggregation.repository.port';
import {
  buildEffectivePeriod,
  hasOrderEvidence,
} from '../../../domain/dashboard/util/effective-period';
import {
  measuredPercent1,
  measuredPercent2,
  oneDecimalDifference,
  percentChange,
} from '../../../domain/dashboard/util/percent';
import {
  resolveDashboardPeriod,
  type ResolvedDashboardPeriod,
} from '../../../domain/dashboard/period/dashboard-period';
import {
  adEvidenceApplies,
  adEvidenceDates,
  intersectEvidence,
  metricBasisMap,
  periodEvidence,
  windowCoverageDates,
  COUPANG_ADS_SOURCE,
  ORDERS_SOURCE,
  WING_TRAFFIC_SOURCE,
  type DashboardSourceName,
} from '../../../domain/dashboard/evidence';
import type { DashboardContext } from '../../../domain/dashboard/context';
import type {
  AdCoverage,
  AdMetricSource,
  DashboardAdSummary,
  DashboardPeriodBasis,
  AdMetricsDetail,
  IndustryBenchmark,
  DailyAdItem,
} from '@kiditem/shared/dashboard';

@Injectable()
export class DashboardAdService {
  private readonly logger = new Logger(DashboardAdService.name);

  constructor(
    @Inject(PROFIT_CALCULATION_REPOSITORY_PORT)
    private readonly profitCalculation: ProfitCalculationRepositoryPort,
    @Inject(WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT)
    private readonly wingTrafficRepository: WingTrafficAggregationRepositoryPort,
  ) {}

  async getSummary(
    ctx: DashboardContext,
    organizationId: string,
  ): Promise<DashboardAdSummary> {
    try {
      const { anchor } = ctx;

      // Order aggregates read the selected calendar verbatim; owner ad and Wing
      // reads follow the closed-day clipping rule, which keeps a custom range
      // exact and takes its month from the anchor.
      const orderPeriods = resolveDashboardPeriod(ctx, anchor, 'order_timestamps');
      const closedDayPeriods = resolveDashboardPeriod(ctx, anchor, 'closed_day_clipped');

      const [
        curMonthProfit,
        coupangAdsCurMonth,
        coupangAdsPrevMonth,
        coupangAdsCurRange,
        coupangAdsPrevRange,
        coupangAdsDaily,
        wingTrafficCurMonth,
        latestDataDate,
        adRateCur,
        adRatePrev,
      ] = await Promise.all([
        this.profitCalculation.calculateForRange(organizationId, orderPeriods.month),
        this.wingTrafficRepository.aggregateCoupangAds(organizationId, closedDayPeriods.month),
        this.wingTrafficRepository.aggregateCoupangAds(organizationId, closedDayPeriods.previousMonth),
        this.wingTrafficRepository.aggregateCoupangAds(organizationId, closedDayPeriods.selected),
        this.wingTrafficRepository.aggregateCoupangAds(organizationId, closedDayPeriods.previousSelected),
        this.wingTrafficRepository.fetchDailyAds(
          organizationId,
          closedDayPeriods.selected.queryWindow.from,
          closedDayPeriods.selected.queryWindow.to,
        ),
        // Wing evidence behind `effectivePeriod` reads the same month window
        // `/api/dashboard/sales` reads. Two endpoints labelling one month must
        // decide `revenueSource` from one period, not from two.
        this.wingTrafficRepository.aggregateTraffic(organizationId, closedDayPeriods.month),
        this.wingTrafficRepository.findLatestDataDate(organizationId),
        this.wingTrafficRepository.readAdRateFacts(
          organizationId,
          closedDayPeriods.selected,
        ),
        this.wingTrafficRepository.readAdRateFacts(
          organizationId,
          closedDayPeriods.previousSelected,
        ),
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

      // Account ad KPIs are calculated from owner-published account rows, so
      // their basis is the ad window's own coverage. Ratios that mix in order
      // or Wing revenue use the exact intersection of both sources' dates.
      const monthAdBasis = adEvidence(closedDayPeriods.month, monthlyMetrics, coupangAdsCurMonth);
      const rangeAdBasis = adEvidence(closedDayPeriods.selected, rangeMetrics, coupangAdsCurRange);
      // The conversion count and CVR read the owner's order count, which a
      // covered window can still withhold when its grid had no conversion
      // columns. Those values then carry their own refused basis.
      const monthConversionBasis = conversionEvidence(
        closedDayPeriods.month,
        monthlyMetrics,
        monthAdBasis,
      );
      const rangeConversionBasis = conversionEvidence(
        closedDayPeriods.selected,
        rangeMetrics,
        rangeAdBasis,
      );
      const adRateBasis = adRateEvidence(closedDayPeriods.selected, adRateCur);
      const benchmarkBases = benchmarkEvidence(
        orderPeriods.month,
        curMonthProfit,
        monthAdBasis,
        monthConversionBasis,
      );

      return {
        monthly: this.buildMonthly(monthlyMetrics, monthlyPrev),
        rangeKpi: this.buildRangeKpi(
          rangeMetrics,
          rangePrev,
          adRateCur,
          adRatePrev,
        ),
        adKpi: this.buildAdKpi(rangeMetrics, rangePrev, adRateCur.revenue),
        dailyAd: this.buildDailyAd(coupangAdsDaily),
        industryBenchmark: this.buildBenchmark(
          monthlyMetrics,
          curMonthProfit,
          benchmarkBases,
        ),
        effectivePeriod: buildEffectivePeriod(
          ctx,
          latestDataDate,
          curMonthProfit,
          wingTrafficCurMonth,
          coupangAdsCurMonth,
        ),
        metricBasis: metricBasisMap({
          'monthly.totalAdSpend': monthAdBasis,
          'monthly.adRevenue': monthAdBasis,
          'monthly.roas': monthAdBasis,
          'monthly.ctr': monthAdBasis,
          'rangeKpi.adCost': rangeAdBasis,
          'rangeKpi.adSpend': rangeAdBasis,
          'rangeKpi.adConvRevenue': rangeAdBasis,
          // ROAS and CTR divide two account values collected together, so the
          // numerator and denominator share one basis.
          'rangeKpi.adRoas': rangeAdBasis,
          'rangeKpi.adCtr': rangeAdBasis,
          'rangeKpi.adRate': adRateBasis,
          'adKpi.totalSpend': rangeAdBasis,
          'adKpi.impressions': rangeAdBasis,
          'adKpi.clicks': rangeAdBasis,
          'adKpi.convRevenue': rangeAdBasis,
          'adKpi.ctr': rangeAdBasis,
          'adKpi.roas': rangeAdBasis,
          'adKpi.conversions': rangeConversionBasis,
          'adKpi.cvr': rangeConversionBasis,
        }),
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
  ): DashboardAdSummary['monthly'] {
    const current = periodAdValues(cur);
    const previous = periodAdValues(prev);

    return {
      roas: current.roas,
      ctr: measuredPercent2(current.clicks, current.impressions),
      adRevenue: current.revenue,
      totalAdSpend: current.spend,
      prevRoas: previous.roas,
      prevCtr: measuredPercent2(previous.clicks, previous.impressions),
      prevAdRevenue: previous.revenue,
      prevTotalAdSpend: previous.spend,
      source: current.source,
      coverage: current.coverage,
    };
  }

  private buildRangeKpi(
    rangeAdCur: ResolvedAdMetrics,
    rangeAdPrev: ResolvedAdMetrics,
    adRateCur: DashboardAdRateFacts,
    adRatePrev: DashboardAdRateFacts,
  ): NonNullable<DashboardAdSummary['rangeKpi']> {
    const current = periodAdValues(rangeAdCur);
    const previous = periodAdValues(rangeAdPrev);

    const rangeAdCostVal = current.spend;
    const prevAdCostVal = previous.spend;
    // Revenue denominator: prefer Order revenue, fall back to Wing daily
    // facts on Drive replay so adRate reflects "광고비 / 매출" instead of
    // dividing by zero. Without this, ad-fed dashboards show adRate=0%
    // even when meaningful ad spend exists.
    const adRate = adRateCur.includedDates.length > 0
      ? measuredPercent1(adRateCur.adSpend, adRateCur.revenue)
      : null;
    const prevAdRate = adRatePrev.includedDates.length > 0
      ? measuredPercent1(adRatePrev.adSpend, adRatePrev.revenue)
      : null;
    const adRateChange = oneDecimalDifference(adRate, prevAdRate);
    const curAdRoas = measuredPercent2(current.revenue, current.spend);
    const prevAdRoas = measuredPercent2(previous.revenue, previous.spend);
    const curAdCtr = measuredPercent2(current.clicks, current.impressions);
    const prevAdCtr = measuredPercent2(previous.clicks, previous.impressions);

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
      adRateChange,
      source: current.source,
      coverage: current.coverage,
    };
  }

  private buildAdKpi(
    selectedAd: ResolvedAdMetrics,
    previousSelectedAd: ResolvedAdMetrics,
    selectedRevenue: number | null,
  ): AdMetricsDetail {
    const current = accountAdValues(selectedAd);
    const previous = accountAdValues(previousSelectedAd);

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
      coverage: selectedAd.coverage,
      source: selectedAd.source,
      prevSpend: previous.spend,
      prevConvRevenue: previous.revenue,
      prevCtr: previous.ctr,
      prevRoas: previous.roas,
      spendChange: percentChange(current.spend, previous.spend),
      convRevenueChange: percentChange(current.revenue, previous.revenue),
      roasChange: pointChange(current.roas, previous.roas),
      ctrChange: pointChange(current.ctr, previous.ctr),
      totalRevenue: selectedRevenue,
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
    bases: BenchmarkEvidence,
  ): IndustryBenchmark {
    const current = periodAdValues(curMonthAd);

    // Pick the ad-rate basis by evidence, not by truthiness. `||` discarded a
    // collected zero ad cost / zero revenue and silently swapped in the other
    // basis, mixing order-settlement and account-ad numbers in one ratio.
    const orderBacked = hasOrderEvidence(curMonthProfit);
    const myAdRateVal = measuredPercent1(
      orderBacked ? curMonthProfit.adCost : current.spend,
      orderBacked ? curMonthProfit.revenue : current.revenue,
    );

    // Unavailable account KPIs stay unavailable; `?? 0` would have made a
    // missing month look like a measured 0 spend / 0 impressions.
    const myRoasVal = measuredPercent2(current.revenue, current.spend);
    const myCtrVal = measuredPercent2(current.clicks, current.impressions);

    // No industry reference source is configured, so the card publishes our own
    // measured ratios and nothing to compare them against.
    return {
      // The shared contract carries these as optional numbers, so an
      // unavailable ratio is omitted rather than published as 0.
      myAdRate: myAdRateVal ?? undefined,
      myRoas: myRoasVal ?? undefined,
      myCtr: myCtrVal ?? undefined,
      // Our CVR is owner-published orders / clicks. It is declared nullable,
      // so an unmeasurable month stays explicitly unavailable instead of
      // being dropped and read as "not implemented".
      myCvr: current.cvr,
      metricBasis: metricBasisMap({
        myAdRate: bases.adRate,
        myRoas: bases.accountAds,
        myCtr: bases.accountAds,
        myCvr: bases.accountConversions,
      }),
    } satisfies IndustryBenchmark;
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
  coverage: AdCoverage | null;
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

function periodAdValues(metrics: ResolvedAdMetrics): AdPeriodValues {
  return {
    ...metrics,
    ctr: measuredPercent2(metrics.clicks, metrics.impressions),
    roas: measuredPercent2(metrics.revenue, metrics.spend),
    // Only owner-published order counts are valid for report CVR.
    cvr: measuredPercent2(metrics.orders, metrics.clicks),
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
  return periodAdValues(metrics);
}

function unavailableAdMetrics(coverage: AdCoverage | null = null): ResolvedAdMetrics {
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

function pointChange(
  current: number | null,
  previous: number | null,
): number | null {
  if (current === null || previous === null) return null;
  return Math.round((current - previous) * 100) / 100;
}

/**
 * Basis for one account-ad window. Account KPIs are published only from a
 * complete owner range, so a window the service refused contributes no
 * included date while its uncovered dates stay listed as missing.
 */
function adEvidence(
  period: ResolvedDashboardPeriod,
  metrics: ResolvedAdMetrics,
  owner: CoupangAdsMetrics,
): DashboardPeriodBasis | null {
  return periodEvidence({
    selectedDates: period.selectedDates,
    includedDates: metrics.available
      ? windowCoverageDates(period.selectedDates, metrics.coverage, true)
      : [],
    sources: [COUPANG_ADS_SOURCE],
  });
}

/**
 * Basis for a value read from the owner's conversion count: the count itself
 * and CVR. An available window whose provider grid lacked the conversion
 * columns publishes no count, so every date it covered was read and refused
 * for those values while the window's other account KPIs stay measured.
 */
function conversionEvidence(
  period: ResolvedDashboardPeriod,
  metrics: ResolvedAdMetrics,
  adBasis: DashboardPeriodBasis | null,
): DashboardPeriodBasis | null {
  if (!metrics.available || metrics.orders !== null) return adBasis;
  return periodEvidence({
    selectedDates: period.selectedDates,
    invalidDates: windowCoverageDates(period.selectedDates, metrics.coverage, true),
    sources: [COUPANG_ADS_SOURCE],
  });
}

/**
 * Basis for the revenue denominator behind `adRate`, following the same
 * order-first, Wing-fallback decision `buildRangeKpi` makes for the value.
 */
function adRateEvidence(
  period: ResolvedDashboardPeriod,
  facts: DashboardAdRateFacts,
): DashboardPeriodBasis | null {
  const revenueSources: DashboardSourceName[] = facts.revenueSource === 'orders'
    ? [ORDERS_SOURCE]
    : facts.revenueSource === 'wing'
      ? [WING_TRAFFIC_SOURCE]
      : [ORDERS_SOURCE, WING_TRAFFIC_SOURCE];
  return periodEvidence({
    selectedDates: period.selectedDates,
    includedDates: facts.includedDates,
    sources: [COUPANG_ADS_SOURCE, ...revenueSources],
  });
}

interface BenchmarkEvidence {
  /** Basis of `myAdRate`, whose two inputs may come from different sources. */
  adRate: DashboardPeriodBasis | null;
  /** Basis of the ratios computed purely from account ad rows. */
  accountAds: DashboardPeriodBasis | null;
  /** Basis of our CVR, which also needs the account's observed order count. */
  accountConversions: DashboardPeriodBasis | null;
}

function benchmarkEvidence(
  orderMonth: ResolvedDashboardPeriod,
  curMonthProfit: RangeProfitMetrics,
  monthAdBasis: DashboardPeriodBasis | null,
  monthConversionBasis: DashboardPeriodBasis | null,
): BenchmarkEvidence {
  if (!hasOrderEvidence(curMonthProfit)) {
    // Both inputs then come from the account ad month.
    return {
      adRate: monthAdBasis,
      accountAds: monthAdBasis,
      accountConversions: monthConversionBasis,
    };
  }
  const coverage = curMonthProfit.sourceCoverage;
  const queryFailedSources: DashboardSourceName[] = curMonthProfit.adEvidenceError
    ? [COUPANG_ADS_SOURCE]
    : [];
  const orderBasis = periodEvidence({
    selectedDates: orderMonth.selectedDates,
    includedDates: coverage.orderDates,
    sources: [ORDERS_SOURCE],
  });
  // With no advertising account there is nothing to intersect and nothing to
  // name: the ad rate is settlement ad cost over settlement revenue, and the
  // basis says orders alone rather than claiming Coupang ads covered it.
  if (!adEvidenceApplies(coverage)) {
    return {
      adRate: orderBasis,
      accountAds: monthAdBasis,
      accountConversions: monthConversionBasis,
    };
  }
  const settlementAdBasis = periodEvidence({
    selectedDates: orderMonth.selectedDates,
    includedDates: adEvidenceDates(coverage),
    sources: [COUPANG_ADS_SOURCE],
    queryFailedSources,
  });
  return {
    adRate: intersectEvidence(orderBasis, settlementAdBasis),
    accountAds: monthAdBasis,
    accountConversions: monthConversionBasis,
  };
}
