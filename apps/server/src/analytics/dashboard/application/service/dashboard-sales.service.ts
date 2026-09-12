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
  DASHBOARD_SALES_REPOSITORY_PORT,
  type DashboardSalesRepositoryPort,
} from '../port/out/repository/dashboard-sales.repository.port';
import {
  WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT,
  type WingTrafficAggregationRepositoryPort,
  type WingTrafficMetrics,
  type TrafficAdditiveMetric,
} from '../port/out/repository/wing-traffic-aggregation.repository.port';
import {
  buildEffectivePeriod,
  canUseWingRevenue,
  hasOrderEvidence,
} from '../../domain/util/effective-period';
import { reconcileCollectedAdSpend } from '../../domain/util/collected-ad-profit';
import {
  measuredPercent1,
  oneDecimalDifference,
  percentChange,
} from '../../domain/util/percent';
import {
  resolveDashboardPeriod,
  resolveExactPeriod,
  resolveWingMonthlyTrendPeriod,
  type ResolvedDashboardPeriod,
} from '../../domain/period/dashboard-period';
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
} from '../../domain/evidence';
import type { DashboardContext } from '../../domain/context';
import type {
  DashboardPeriodBasis,
  DashboardProfitInputs,
  DashboardSalesSummary,
  ProfitBreakdown,
  TrafficKpi,
} from '@kiditem/shared/dashboard';

/**
 * Dashboard sales summary.
 *
 * Drive replay support (Plan F2):
 *  - When the calendar window has zero Order rows but the same window has
 *    Wing daily-fact rows in `channel_listing_daily_snapshots.traffic_*`, the
 *    Wing aggregate is what we surface on `monthly.revenue`,
 *    `rangeKpi.revenue`, and `trafficKpi.{visitors,views,orders,salesQty,
 *    revenue,cartAdds,conversionRate}`. This avoids the all-zero dashboard
 *    on operator workspaces that only loaded Drive replay data.
 *  - The Order-based path is still preferred when orders exist (live
 *    workspaces). The fallback only activates when the order-based revenue
 *    is zero for the requested period.
 *  - `effectivePeriod` reports which period and which source fed the
 *    monthly numbers so the dashboard UI can label "주문 기준" /
 *    "Wing 매출 기준" without guessing.
 *
 * Tenant-scope rule: every Prisma call binds organizationId.
 */
@Injectable()
export class DashboardSalesService {
  private readonly logger = new Logger(DashboardSalesService.name);

  constructor(
    @Inject(PROFIT_CALCULATION_REPOSITORY_PORT)
    private readonly profitCalculation: ProfitCalculationRepositoryPort,
    @Inject(WING_AD_SUMMARY_REPOSITORY_PORT)
    private readonly wingAdSummary: WingAdSummaryRepositoryPort,
    @Inject(DASHBOARD_SALES_REPOSITORY_PORT)
    private readonly salesRepository: DashboardSalesRepositoryPort,
    @Inject(WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT)
    private readonly wingTrafficRepository: WingTrafficAggregationRepositoryPort,
  ) {}

  async getSummary(
    ctx: DashboardContext,
    organizationId: string,
  ): Promise<DashboardSalesSummary> {
    try {
      const startedAt = Date.now();
      const { year, month, monthStart, todayStart, todayEnd } = ctx;
      // Two closure rules, one resolver: order aggregates read the selected
      // calendar verbatim, Wing/Coupang read only closed KST days. Both take
      // the month from the anchor, so the advertising shown under a month
      // heading is always that month's.
      const orderPeriods = resolveDashboardPeriod(ctx, ctx.anchor, 'order_timestamps');
      const closedDayPeriods = resolveDashboardPeriod(ctx, ctx.anchor, 'closed_day_clipped');

      const [
        curMonth,
        prevMonth,
        rangeCur,
        rangePrev,
        todayRows,
        topProductRows,
        wing,
        wingTrafficMonth,
        wingTrafficPrevMonth,
        wingTrafficRange,
        wingTrafficPrevRange,
        coupangAdsMonth,
        coupangAdsPrevMonth,
        latestWingDataDate,
      ] = await Promise.all([
        this.profitCalculation.calculateForRange(organizationId, orderPeriods.month),
        this.profitCalculation.calculateForRange(organizationId, orderPeriods.previousMonth),
        this.profitCalculation.calculateForRange(organizationId, orderPeriods.selected),
        this.profitCalculation.calculateForRange(organizationId, orderPeriods.previousSelected),
        this.salesRepository.fetchTodayKpis(organizationId, todayStart, todayEnd),
        // Top products sits inside the period section, under the period
        // filter. Reading the anchor month there meant a July selection
        // listed September — which, September being empty, read as "July had
        // no product revenue".
        this.salesRepository.fetchTopProducts(
          organizationId,
          orderPeriods.selected.queryWindow.from,
          orderPeriods.selected.queryWindow.to,
        ),
        this.wingAdSummary.fetchCurrentMonthSummary(organizationId, year, month, monthStart),
        this.wingTrafficRepository.aggregateTraffic(organizationId, closedDayPeriods.month),
        this.wingTrafficRepository.aggregateTraffic(organizationId, closedDayPeriods.previousMonth),
        this.wingTrafficRepository.aggregateTraffic(organizationId, closedDayPeriods.selected),
        this.wingTrafficRepository.aggregateTraffic(organizationId, closedDayPeriods.previousSelected),
        this.wingTrafficRepository.aggregateCoupangAds(organizationId, closedDayPeriods.month),
        this.wingTrafficRepository.aggregateCoupangAds(organizationId, closedDayPeriods.previousMonth),
        this.wingTrafficRepository.findLatestDataDate(organizationId),
      ]);

      const useWingMonthly = !hasOrderEvidence(curMonth) && canUseWingRevenue(wingTrafficMonth);
      const useWingRange = !hasOrderEvidence(rangeCur) && canUseWingRevenue(wingTrafficRange);
      // The Today card is order-backed. Never substitute yesterday's closed
      // Wing source range into a widget labelled as today.
      const today = todayRows;

      const wingLastSync = pickLatest(
        wing?.lastSyncAt ?? null,
        wingTrafficMonth.lastObservedAt,
      );
      const latestDataDate = latestWingDataDate;
      const lastSyncAt = pickLatest(wingLastSync, coupangAdsMonth.lastObservedAt);

      this.logger.debug({
        msg: 'dashboard-sales.getSummary',
        organizationId,
        range: ctx.effectiveRange,
        anchorShifted: ctx.anchorShifted,
        latencyMs: Date.now() - startedAt,
        topProductsCount: topProductRows.length,
        hasWingOverride: wing !== null,
        useWingMonthly,
        useWingRange,
      });

      const [coupangAdsForRange, coupangAdsForPrevRange] = await Promise.all([
        this.wingTrafficRepository.aggregateCoupangAds(organizationId, closedDayPeriods.selected),
        this.wingTrafficRepository.aggregateCoupangAds(organizationId, closedDayPeriods.previousSelected),
      ]);
      const curMonthProfit = reconcileCollectedAdSpend(curMonth, coupangAdsMonth);
      const prevMonthProfit = reconcileCollectedAdSpend(prevMonth, coupangAdsPrevMonth);
      const rangeCurProfit = reconcileCollectedAdSpend(rangeCur, coupangAdsForRange);
      const rangePrevProfit = reconcileCollectedAdSpend(rangePrev, coupangAdsForPrevRange);

      // Every published number carries the dates it was actually calculated
      // from. Each metric uses the maximal valid dates of its own required
      // sources, and a multi-source metric uses their exact intersection.
      const monthEvidence = salesEvidence({
        orderPeriod: orderPeriods.month,
        wingPeriod: closedDayPeriods.month,
        profit: curMonthProfit,
        wing: wingTrafficMonth,
        observedAt: coupangAdsMonth.lastObservedAt,
      });
      const rangeEvidence = salesEvidence({
        orderPeriod: orderPeriods.selected,
        wingPeriod: closedDayPeriods.selected,
        profit: rangeCurProfit,
        wing: wingTrafficRange,
        observedAt: coupangAdsForRange.lastObservedAt,
      });

      const trafficKpi = this.buildTrafficKpi(
        rangeCurProfit,
        wingTrafficRange,
        wing,
        useWingRange,
      );
      const conversionRateBasis = periodEvidence({
        selectedDates: closedDayPeriods.selected.selectedDates,
        includedDates: trafficKpi.conversionRate === null
          ? []
          : windowCoverageDates(
            closedDayPeriods.selected.selectedDates,
            wingTrafficRange.coverage,
            wingTrafficRange.isCollected,
          ),
        // A reconciliation mismatch is evidence that was read and refused,
        // which is not the same as a date the owner never collected.
        invalidDates: mismatchedTrafficMetrics(wingTrafficRange, ['views', 'orders'])
          ? closedDayPeriods.selected.selectedDates
          : [],
        sources: [WING_TRAFFIC_SOURCE],
        observedAt: wingTrafficRange.lastObservedAt,
      });
      // Revenue is ranked from orders alone, so orders decide its basis.
      const topProductsBasis = periodEvidence({
        selectedDates: orderPeriods.selected.selectedDates,
        includedDates: rangeCurProfit.sourceCoverage.orderDates,
        sources: [ORDERS_SOURCE],
      });

      return {
        today,
        monthly: this.buildMonthly(
          curMonthProfit,
          prevMonthProfit,
          wingTrafficMonth,
          wingTrafficPrevMonth,
        ),
        topProducts: topProductRows,
        profitDetail: this.buildProfitDetail(curMonthProfit),
        rangeKpi: this.buildRangeKpi(
          ctx.effectiveRange,
          rangeCurProfit,
          rangePrevProfit,
          wingTrafficRange,
          wingTrafficPrevRange,
        ),
        planAchievement: null,
        trafficKpi,
        lastSyncAt: lastSyncAt?.toISOString() ?? null,
        effectivePeriod: buildEffectivePeriod(
          ctx,
          latestDataDate,
          curMonth,
          wingTrafficMonth,
          coupangAdsMonth,
        ),
        profitInputs: buildOrderProfitInputs(rangeCurProfit, rangeEvidence.profit),
        metricBasis: metricBasisMap({
          'monthly.revenue': monthEvidence.revenue,
          'monthly.profit': monthEvidence.profit,
          'rangeKpi.revenue': rangeEvidence.revenue,
          'rangeKpi.profit': rangeEvidence.profit,
          'rangeKpi.profitRate': rangeEvidence.profitRate,
          'trafficKpi.conversionRate': conversionRateBasis,
          'topProducts.revenue': topProductsBasis,
          // The profit column is no longer a margin assumption over the revenue
          // basis (ADR-0004): it is settled per listing, from orders *and* ad
          // evidence, and withheld when either is short. Describing it with the
          // orders-only revenue basis claimed a coverage the column never had —
          // July read `sources: [orders] · partial` while every value was
          // withheld for want of ad evidence. The selected range's profit
          // evidence is the same one `profitInputs` publishes.
          'topProducts.netProfit': rangeEvidence.profit,
          profitInputs: rangeEvidence.profit,
        }),
      } satisfies DashboardSalesSummary;
    } catch (error) {
      this.logger.error('Failed to get sales summary', error);
      throw new InternalServerErrorException('Failed to get sales summary');
    }
  }

  // ── monthly mapping ─────────────────────────────────────────────────────
  //
  // Drive replay only carries Wing revenue + Coupang ad spend; settlement
  // metrics (commission, shipping, COGS) are absent. Net profit therefore
  // cannot be derived from Wing alone — synthesizing `revenue - adSpend`
  // would be misleading because it ignores cost-of-goods and platform fees.
  // We surface revenue + adRate (both well-defined when their inputs are
  // real), and leave `profit`/`profitChange`/`prevProfit` null when settlement
  // evidence is unavailable. The UI reads `effectivePeriod.revenueSource` to
  // hide the profit card when the value isn't trustworthy.
  private buildMonthly(
    cur: RangeProfitMetrics,
    prev: RangeProfitMetrics,
    wingCur: WingTrafficMetrics,
    wingPrev: WingTrafficMetrics,
  ): DashboardSalesSummary['monthly'] {
    const current = resolveSalesPeriod(cur, wingCur);
    const previous = resolveSalesPeriod(prev, wingPrev);

    // 광고비율은 광고가 붙는 윙 매출 기준으로 계산(로켓 합산 total 로 희석 방지).
    const adRate = measuredPercent1(cur.adCost, current.revenue);
    const prevAdRate = measuredPercent1(prev.adCost, previous.revenue);
    const revenueChange = percentChange(current.revenue, previous.revenue);
    const profitChange = percentChange(current.profit, previous.profit, true);

    return {
      revenue: current.revenue,
      wingRevenue: current.wingRevenue,
      profit: current.profit,
      adRate,
      prevRevenue: previous.revenue,
      prevProfit: previous.profit,
      revenueChange,
      profitChange,
      prevAdRate,
      available: current.available,
      previousAvailable: previous.available,
    } satisfies DashboardSalesSummary['monthly'];
  }

  // ── profitDetail ────────────────────────────────────────────────────────
  //
  // For the Wing fallback path we don't have settlement data, so the profit
  // breakdown isn't trustworthy. Returning the Order-based zero is *less*
  // misleading than half-filling it with synthesized numbers. The UI hides
  // the breakdown on Wing-source periods.
  private buildProfitDetail(
    cur: RangeProfitMetrics,
  ): ProfitBreakdown {
    return {
      revenue: cur.revenue,
      costOfGoods: cur.costOfGoods,
      commission: cur.commission,
      shippingCost: cur.shippingCost,
      adCost: cur.adCost,
      otherCost: cur.otherCost,
      netProfit: cur.netProfit,
      orderCount: cur.orderCount,
    } satisfies ProfitBreakdown;
  }

  // ── rangeKpi ────────────────────────────────────────────────────────────
  //
  // When `useWing` is true the order-based profit math is unreliable
  // (no settlement data on Drive replay), so we report Wing revenue but
  // leave profit / profitRate null. The UI is responsible for hiding those
  // metric tiles when `effectivePeriod.revenueSource` is not backed by
  // order-settlement revenue.
  private buildRangeKpi(
    range: string,
    cur: RangeProfitMetrics,
    prev: RangeProfitMetrics,
    wingCur: WingTrafficMetrics,
    wingPrev: WingTrafficMetrics,
  ): NonNullable<DashboardSalesSummary['rangeKpi']> {
    const current = resolveSalesPeriod(cur, wingCur);
    const previous = resolveSalesPeriod(prev, wingPrev);

    // Wing-only revenue has no settlement costs, so do not synthesize a zero
    // profit/profitRate that looks like a measured result.
    const profitRate = measuredPercent1(current.profit, current.revenue);
    const prevProfitRate = measuredPercent1(previous.profit, previous.revenue);
    const revenueChange = percentChange(current.revenue, previous.revenue);
    const profitChange = percentChange(current.profit, previous.profit, true);
    return {
      range,
      revenue: current.revenue,
      profit: current.profit,
      prevRevenue: previous.revenue,
      prevProfit: previous.profit,
      revenueChange,
      profitChange,
      profitRate,
      prevProfitRate,
      profitRateChange: oneDecimalDifference(profitRate, prevProfitRate),
      available: current.available,
      previousAvailable: previous.available,
    } satisfies NonNullable<DashboardSalesSummary['rangeKpi']>;
  }

  // ── trafficKpi ──────────────────────────────────────────────────────────
  //
  // Wing path: surface clean Wing/Drive metrics (visitors, views, orders,
  // salesQty, revenue, cartAdds, conversionRate). `netProfit`/`profitRate`
  // are left at null — Drive replay does not carry the settlement data
  // needed to derive net profit. Synthesizing "revenue minus ad spend"
  // would mislead users into thinking the dashboard knows COGS/commission/
  // shipping. The UI hides profit-rate metrics when `revenueSource ===
  // 'wing'`.
  private buildTrafficKpi(
    cur: RangeProfitMetrics,
    wingCur: WingTrafficMetrics,
    wing: WingAdSummaryResult | null,
    useWing: boolean,
  ): TrafficKpi {
    const wingValues = trafficKpiValues(wingCur);
    if (useWing) {
      return {
        ...wingValues,
        adSummary: wing?.rawAdSummary ?? null,
        source: wing ? 'wing' : 'drive_replay',
        // Wing GMV has no settlement/COGS evidence; null is intentional.
        netProfit: null,
        profitRate: null,
        needsScrape: false,
        trafficAvailable: wingCur.isCollected,
        trafficObservedAt: wingCur.lastObservedAt?.toISOString() ?? null,
      } satisfies TrafficKpi;
    }
    const orderDataAvailable = cur.revenue !== 0 || cur.orderCount > 0;
    if (!orderDataAvailable) {
      return {
        ...wingValues,
        adSummary: wing?.rawAdSummary ?? null,
        source: wing ? 'wing' : 'drive_replay',
        netProfit: null,
        profitRate: null,
        needsScrape: false,
        trafficAvailable: wingCur.isCollected,
        trafficObservedAt: wingCur.lastObservedAt?.toISOString() ?? null,
      } satisfies TrafficKpi;
    }
    return {
      visitors: wingValues.visitors,
      views: wingValues.views,
      orders: cur.orderCount,
      salesQty: wingValues.salesQty,
      revenue: cur.revenue,
      cartAdds: wingValues.cartAdds,
      conversionRate: wingValues.conversionRate,
      dailyAverageVisitors: wingValues.dailyAverageVisitors,
      providerConversionRate: wingValues.providerConversionRate,
      coverage: wingValues.coverage,
      reconciliation: wingValues.reconciliation,
      exactPeriodEvidence: wingValues.exactPeriodEvidence,
      adSummary: wing?.rawAdSummary ?? null,
      source: wing ? 'wing' : undefined,
      netProfit: cur.netProfit,
      // A ratio whose numerator is unavailable is itself unavailable.
      profitRate: measuredPercent1(cur.netProfit, cur.revenue),
      trafficAvailable: wingCur.isCollected,
      trafficObservedAt: wingCur.lastObservedAt?.toISOString() ?? null,
    } satisfies TrafficKpi;
  }
}

type TrafficKpiValues = Pick<
  TrafficKpi,
  | 'visitors'
  | 'views'
  | 'salesQty'
  | 'cartAdds'
  | 'conversionRate'
  | 'dailyAverageVisitors'
  | 'providerConversionRate'
  | 'coverage'
  | 'reconciliation'
  | 'exactPeriodEvidence'
> & { orders: number | null; revenue: number | null };

/**
 * A window publishes what it measured once at least one day is confirmed.
 *
 * This used to require every day in the window, and that is the mirror of
 * inventing a zero: ten measured days were withheld because the eleventh was
 * one Coupang had not published yet — the ordinary case, since Wing's traffic
 * runs a day behind its sales. Nothing published here is a total for the
 * requested window and nothing claims to be: `coverage` travels on the payload
 * with the day count and the missing dates, and the dashboard reads it as
 * `부분 N/M일`. Zero confirmed days stays unavailable, because there is nothing
 * measured to show.
 *
 * Standing in for a period's revenue is a different question and keeps its own
 * gate: see `canUseWingRevenue`, which still requires the whole window.
 */
function hasConfirmedDays(metrics: WingTrafficMetrics): boolean {
  if (!metrics.isCollected) return false;
  return !metrics.coverage || metrics.coverage.completedDays > 0;
}

function canUseWingMetric(
  metrics: WingTrafficMetrics,
  metric: TrafficAdditiveMetric,
): boolean {
  if (!hasConfirmedDays(metrics)) return false;
  return metrics.reconciliation?.[metric]?.status !== 'MISMATCH';
}

function trafficKpiValues(metrics: WingTrafficMetrics): TrafficKpiValues {
  const visitorsAvailable = hasConfirmedDays(metrics);
  const viewsAvailable = canUseWingMetric(metrics, 'views');
  const ordersAvailable = canUseWingMetric(metrics, 'orders');
  const salesQtyAvailable = canUseWingMetric(metrics, 'salesQty');
  const revenueAvailable = canUseWingMetric(metrics, 'revenue');
  const cartAddsAvailable = canUseWingMetric(metrics, 'cartAdds');
  const visitors = visitorsAvailable
    ? (metrics.dailyAverageVisitors ?? metrics.visitors)
    : null;
  const views = viewsAvailable ? metrics.views : null;
  const orders = ordersAvailable ? metrics.orders : null;

  return {
    visitors,
    views,
    orders,
    revenue: revenueAvailable ? metrics.revenue : null,
    salesQty: salesQtyAvailable ? metrics.salesQty : null,
    cartAdds: cartAddsAvailable ? metrics.cartAdds : null,
    // The ratio is unavailable when views are unavailable or zero. The
    // adapter computes orders/views, never orders/visitors.
    conversionRate: views !== null && views > 0 && orders !== null
      ? (orders / views) * 100
      : null,
    dailyAverageVisitors: visitors,
    providerConversionRate: metrics.providerConversionRate ?? null,
    coverage: metrics.coverage ?? null,
    reconciliation: metrics.reconciliation ?? null,
    exactPeriodEvidence: metrics.exactPeriodEvidence ?? null,
  };
}

interface ResolvedSalesPeriod {
  revenue: number | null;
  wingRevenue: number | null;
  profit: number | null;
  available: boolean;
}

function resolveSalesPeriod(
  orderMetrics: RangeProfitMetrics,
  wingMetrics: WingTrafficMetrics,
): ResolvedSalesPeriod {
  if (hasOrderEvidence(orderMetrics)) {
    return {
      revenue: orderMetrics.revenue,
      wingRevenue: null,
      profit: orderMetrics.netProfit,
      available: true,
    };
  }
  if (canUseWingRevenue(wingMetrics)) {
    return {
      revenue: wingMetrics.revenue,
      wingRevenue: wingMetrics.revenue,
      // Wing GMV is not a settlement/profit fact.
      profit: null,
      available: true,
    };
  }
  return {
    revenue: null,
    wingRevenue: null,
    profit: null,
    available: false,
  };
}

function pickLatest(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

/** The three period bases a sales window publishes, plus the ad-cost basis. */
interface SalesEvidence {
  revenue: DashboardPeriodBasis | null;
  profit: DashboardPeriodBasis | null;
  profitRate: DashboardPeriodBasis | null;
  adCost: DashboardPeriodBasis | null;
}

function mismatchedTrafficMetrics(
  wing: WingTrafficMetrics,
  metrics: readonly TrafficAdditiveMetric[],
): boolean {
  return metrics.some((metric) => wing.reconciliation?.[metric]?.status === 'MISMATCH');
}

/**
 * Calculation bases for one sales window.
 *
 * The basis describes the value this service actually publishes, so it follows
 * the same order-vs-Wing decision `resolveSalesPeriod` makes. A source the
 * service refused to use contributes no included date; why it was refused
 * stays visible as missing (never collected) or invalid (read and rejected).
 */
function salesEvidence(args: {
  orderPeriod: ResolvedDashboardPeriod;
  wingPeriod: ResolvedDashboardPeriod;
  profit: RangeProfitMetrics;
  wing: WingTrafficMetrics;
  observedAt?: Date | null;
}): SalesEvidence {
  const { orderPeriod, wingPeriod, profit, wing } = args;
  const coverage = profit.sourceCoverage;
  // A failed owner ad read is not an empty ad month. It is named explicitly so
  // a metric that has no usable date because of it reads as unverified.
  const queryFailedSources: DashboardSourceName[] = profit.adEvidenceError
    ? [COUPANG_ADS_SOURCE]
    : [];
  const orderBacked = hasOrderEvidence(profit);
  const wingBacked = !orderBacked && canUseWingRevenue(wing);

  const ordersBasis = periodEvidence({
    selectedDates: orderPeriod.selectedDates,
    includedDates: coverage.orderDates,
    sources: [ORDERS_SOURCE],
  });
  const wingBasis = periodEvidence({
    selectedDates: wingPeriod.selectedDates,
    includedDates: wingBacked
      ? windowCoverageDates(wingPeriod.selectedDates, wing.coverage, wing.isCollected)
      : [],
    invalidDates: mismatchedTrafficMetrics(wing, ['revenue'])
      ? wingPeriod.selectedDates
      : [],
    sources: [WING_TRAFFIC_SOURCE],
    observedAt: wing.lastObservedAt,
  });
  const revenue = orderBacked
    ? ordersBasis
    : wingBacked
      ? wingBasis
      : periodEvidence({
        selectedDates: orderPeriod.selectedDates,
        includedDates: [],
        sources: [ORDERS_SOURCE, WING_TRAFFIC_SOURCE],
      });

  const adDates = new Set(adEvidenceDates(coverage));
  const adCost = periodEvidence({
    selectedDates: orderPeriod.selectedDates,
    includedDates: adDates,
    sources: [COUPANG_ADS_SOURCE],
    queryFailedSources,
    observedAt: args.observedAt ?? null,
  });
  // Revenue, cost and advertising entering profit use identical dates. The
  // range aggregate computes a profit only when every cost input is present
  // and advertising is satisfied for the whole window, so a non-computable
  // profit has no usable date rather than a partial one.
  const profitBasis = periodEvidence({
    selectedDates: orderPeriod.selectedDates,
    includedDates: profit.netProfit === null
      ? []
      : coverage.orderDates.filter((date) => adDates.has(date)),
    // Cost inputs were read and refused for this window; that is not an
    // uncollected date.
    invalidDates: profit.costComplete ? [] : orderPeriod.selectedDates,
    sources: adEvidenceApplies(coverage)
      ? [ORDERS_SOURCE, COUPANG_ADS_SOURCE]
      : [ORDERS_SOURCE],
    queryFailedSources,
    observedAt: args.observedAt ?? null,
  });

  return {
    revenue,
    profit: profitBasis,
    // A ratio uses the same dates for its numerator and its denominator.
    profitRate: intersectEvidence(profitBasis, revenue),
    adCost,
  };
}

/**
 * Order-backed profit inputs. Published only over evidence that supports a
 * number: an empty basis has nothing to explain, and the consumer would show
 * the card as unavailable anyway.
 */
function buildOrderProfitInputs(
  metrics: RangeProfitMetrics,
  basis: DashboardPeriodBasis | null,
): DashboardProfitInputs | null {
  if (!basis || basis.includedDays === 0) return null;
  const cost = metrics.costOfGoods + metrics.commission + metrics.shippingCost + metrics.otherCost;
  if (!Number.isFinite(metrics.revenue) || !Number.isFinite(cost) || !Number.isFinite(metrics.adCost)) {
    return null;
  }
  return {
    revenue: metrics.revenue,
    cost,
    adCost: metrics.adCost,
    // The range aggregate counts orders, not units; a unit count would be a
    // fabricated number here.
    qty: null,
    basis,
  } satisfies DashboardProfitInputs;
}
