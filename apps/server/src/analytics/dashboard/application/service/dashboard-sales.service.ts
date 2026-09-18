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
  DASHBOARD_SALES_REPOSITORY_PORT,
  type DashboardSalesRepositoryPort,
} from '../port/out/repository/dashboard-sales.repository.port';
import {
  WING_TRAFFIC_AGGREGATION_REPOSITORY_PORT,
  type WingTrafficAggregationRepositoryPort,
  type WingTrafficMetrics,
  type DashboardTrafficFunnelFacts,
  type TrafficAdditiveMetric,
} from '../port/out/repository/wing-traffic-aggregation.repository.port';
import { adTrafficReconciliationStatus } from '@kiditem/shared/advertising';
import {
  buildEffectivePeriod,
  canUseWingRevenue,
  hasOrderEvidence,
} from '../../domain/util/effective-period';
import {
  measuredPercent1,
  oneDecimalDifference,
  percentChange,
} from '../../domain/util/percent';
import {
  resolveDashboardPeriod,
  resolveExactPeriod,
  resolveWingMonthlyTrendPeriod,
  wholeCalendarMonth,
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
  SELLPIA_PRODUCT_SALES_SOURCE,
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
      const { todayStart, todayEnd } = ctx;
      // Three closure rules, one resolver: order aggregates read the selected
      // calendar verbatim, Wing/Coupang read only closed KST days, and a
      // profit reads a month over its closed days, the only dates orders and
      // the ad sweep can both have covered (ADR-0001). All take the month from
      // the anchor, so the advertising shown under a month heading is always
      // that month's.
      const orderPeriods = resolveDashboardPeriod(ctx, ctx.anchor, 'order_timestamps');
      const closedDayPeriods = resolveDashboardPeriod(ctx, ctx.anchor, 'closed_day_clipped');
      const profitPeriods = resolveDashboardPeriod(ctx, ctx.anchor, 'closed_day_month');
      // The rules often resolve the same window: a month selection's calendar
      // and profit windows are the month's own, and a day, week or custom
      // selection's profit window is its calendar window. Each distinct window
      // is read once.
      const readProfit = this.profitReader(organizationId);
      // Sellpia's product sales are monthly, so they answer only a selection
      // that is one whole calendar month; any other window ranks orders.
      const sellpiaTopMonth = wholeCalendarMonth(orderPeriods.selected);

      const [
        curMonth,
        prevMonth,
        rangeCur,
        rangePrev,
        curMonthProfit,
        rangeCurProfit,
        todayRows,
        topProductRows,
        sellpiaTopProducts,
        wingTrafficMonth,
        wingTrafficPrevMonth,
        wingTrafficRange,
        wingTrafficPrevRange,
        coupangAdsMonth,
        coupangAdsPrevMonth,
        latestWingDataDate,
        trafficFunnel,
      ] = await Promise.all([
        readProfit(orderPeriods.month),
        readProfit(orderPeriods.previousMonth),
        readProfit(orderPeriods.selected),
        readProfit(orderPeriods.previousSelected),
        readProfit(profitPeriods.month),
        readProfit(profitPeriods.selected),
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
        sellpiaTopMonth
          ? this.salesRepository.fetchSellpiaTopProducts(organizationId, sellpiaTopMonth)
          : Promise.resolve(null),
        this.wingTrafficRepository.aggregateTraffic(organizationId, closedDayPeriods.month),
        this.wingTrafficRepository.aggregateTraffic(organizationId, closedDayPeriods.previousMonth),
        this.wingTrafficRepository.aggregateTraffic(organizationId, closedDayPeriods.selected),
        this.wingTrafficRepository.aggregateTraffic(organizationId, closedDayPeriods.previousSelected),
        this.wingTrafficRepository.aggregateCoupangAds(organizationId, closedDayPeriods.month),
        this.wingTrafficRepository.aggregateCoupangAds(organizationId, closedDayPeriods.previousMonth),
        this.wingTrafficRepository.findLatestDataDate(organizationId),
        this.wingTrafficRepository.readTrafficFunnel(
          organizationId,
          closedDayPeriods.selected,
        ),
      ]);

      const useWingMonthly = !hasOrderEvidence(curMonth) && canUseWingRevenue(wingTrafficMonth);
      const useWingRange = !hasOrderEvidence(rangeCur) && canUseWingRevenue(wingTrafficRange);
      // The Today card is order-backed. Never substitute yesterday's closed
      // Wing source range into a widget labelled as today.
      const today = {
        revenue: todayRows.revenue,
        orders: todayRows.orders,
      };

      const wingLastSync = wingTrafficMonth.lastObservedAt;
      const latestDataDate = latestWingDataDate;
      const lastSyncAt = pickLatest(wingLastSync, coupangAdsMonth.lastObservedAt);

      this.logger.debug({
        msg: 'dashboard-sales.getSummary',
        organizationId,
        range: ctx.effectiveRange,
        anchorShifted: ctx.anchorShifted,
        latencyMs: Date.now() - startedAt,
        topProductsCount: topProductRows.length,
        sellpiaTopProductsCount: sellpiaTopProducts?.products.length ?? null,
        useWingMonthly,
        useWingRange,
      });

      const [coupangAdsForRange, coupangAdsForPrevRange] = await Promise.all([
        this.wingTrafficRepository.aggregateCoupangAds(organizationId, closedDayPeriods.selected),
        this.wingTrafficRepository.aggregateCoupangAds(organizationId, closedDayPeriods.previousSelected),
      ]);
      // Profit and the ad panel read the same ad ledger, so there is nothing
      // to reconcile between them. The order and profit rules resolve the same
      // previous windows, so one read serves both.
      const prevMonthProfit = prevMonth;
      const rangePrevProfit = rangePrev;

      // Every published number carries the dates it was actually calculated
      // from. Each metric uses the maximal valid dates of its own required
      // sources, and a multi-source metric uses their exact intersection.
      // Revenue keeps the calendar window; profit, the rates built on it and
      // its inputs keep the profit rule's window, so revenue, cost and
      // advertising enter a profit on identical dates.
      const monthEvidence = salesEvidence({
        orderPeriod: orderPeriods.month,
        wingPeriod: closedDayPeriods.month,
        profit: curMonth,
        wing: wingTrafficMonth,
      });
      const monthProfitEvidence = salesEvidence({
        orderPeriod: profitPeriods.month,
        wingPeriod: closedDayPeriods.month,
        profit: curMonthProfit,
        wing: wingTrafficMonth,
      });
      const rangeEvidence = salesEvidence({
        orderPeriod: orderPeriods.selected,
        wingPeriod: closedDayPeriods.selected,
        profit: rangeCur,
        wing: wingTrafficRange,
      });
      const rangeProfitEvidence = salesEvidence({
        orderPeriod: profitPeriods.selected,
        wingPeriod: closedDayPeriods.selected,
        profit: rangeCurProfit,
        wing: wingTrafficRange,
      });

      const trafficKpi = this.buildTrafficKpi(
        trafficFunnel,
      );
      const trafficOnlyBasis = (metric: 'visitors' | 'views' | 'cartAdds') => periodEvidence({
        selectedDates: closedDayPeriods.selected.selectedDates,
        includedDates: trafficFunnel.metricDates[metric],
        sources: [WING_TRAFFIC_SOURCE],
      });
      const trafficRateBasis = (metric: 'cartRate') => periodEvidence({
        selectedDates: closedDayPeriods.selected.selectedDates,
        includedDates: trafficFunnel.metricDates[metric],
        sources: [WING_TRAFFIC_SOURCE],
      });
      const intersectionBasis = (metric: 'orders' | 'salesQty' | 'revenue' | 'conversionRate') =>
        periodEvidence({
          selectedDates: closedDayPeriods.selected.selectedDates,
          includedDates: trafficFunnel.metricDates[metric],
          sources: [WING_TRAFFIC_SOURCE, ORDERS_SOURCE],
        });
      const intersectionRateBasis = (metric: 'orderCartRate') => periodEvidence({
        selectedDates: closedDayPeriods.selected.selectedDates,
        includedDates: trafficFunnel.metricDates[metric],
        sources: [WING_TRAFFIC_SOURCE, ORDERS_SOURCE],
      });
      const todayBasis = periodEvidence({
        selectedDates: todayRows.requestedDates,
        includedDates: todayRows.includedDates,
        sources: [ORDERS_SOURCE],
      });
      // A whole month ranks from Sellpia's product sales, which see every
      // channel; the collected orders see only the malls collected so far.
      // Whichever ranks the rows decides their basis.
      const sellpiaRanking = sellpiaTopProducts && sellpiaTopProducts.products.length > 0
        ? sellpiaTopProducts
        : null;
      const topProducts = sellpiaRanking?.products ?? topProductRows;
      const topProductsBasis = sellpiaRanking
        ? periodEvidence({
          selectedDates: orderPeriods.selected.selectedDates,
          includedDates: orderPeriods.selected.selectedDates.filter((date) =>
            date >= sellpiaRanking.coverage.startDate
            && date <= sellpiaRanking.coverage.endDate),
          sources: [SELLPIA_PRODUCT_SALES_SOURCE],
        })
        : periodEvidence({
          selectedDates: orderPeriods.selected.selectedDates,
          includedDates: rangeCur.sourceCoverage.orderDates,
          sources: [ORDERS_SOURCE],
        });
      // Sellpia publishes no settled profit, so its rows carry none, and the
      // column's basis says so rather than borrowing the orders' profit dates.
      const topProductsProfitBasis = sellpiaRanking
        ? periodEvidence({
          selectedDates: orderPeriods.selected.selectedDates,
          includedDates: [],
          sources: [SELLPIA_PRODUCT_SALES_SOURCE],
        })
        : rangeEvidence.profit;

      return {
        today,
        monthly: this.buildMonthly(
          curMonth,
          curMonthProfit,
          prevMonthProfit,
          wingTrafficMonth,
          wingTrafficPrevMonth,
        ),
        topProducts,
        profitDetail: this.buildProfitDetail(curMonthProfit),
        rangeKpi: this.buildRangeKpi(
          ctx.effectiveRange,
          rangeCur,
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
        profitInputs: buildOrderProfitInputs(rangeCurProfit, rangeProfitEvidence.profit),
        metricBasis: metricBasisMap({
          'today.revenue': todayBasis,
          'today.orders': todayBasis,
          'monthly.revenue': monthEvidence.revenue,
          'monthly.profit': monthProfitEvidence.profit,
          'rangeKpi.revenue': rangeEvidence.revenue,
          'rangeKpi.profit': rangeProfitEvidence.profit,
          'rangeKpi.profitRate': rangeProfitEvidence.profitRate,
          'trafficKpi.visitors': trafficOnlyBasis('visitors'),
          'trafficKpi.views': trafficOnlyBasis('views'),
          'trafficKpi.cartAdds': trafficOnlyBasis('cartAdds'),
          'trafficKpi.cartRate': trafficRateBasis('cartRate'),
          'trafficKpi.orders': intersectionBasis('orders'),
          'trafficKpi.orderCartRate': intersectionRateBasis('orderCartRate'),
          'trafficKpi.salesQty': intersectionBasis('salesQty'),
          'trafficKpi.revenue': intersectionBasis('revenue'),
          'trafficKpi.conversionRate': intersectionBasis('conversionRate'),
          'topProducts.revenue': topProductsBasis,
          // The profit column is no longer a margin assumption over the revenue
          // basis (ADR-0004): it is settled per listing, from orders *and* ad
          // evidence, and withheld when either is short. Describing it with the
          // orders-only revenue basis claimed a coverage the column never had —
          // July read `sources: [orders] · partial` while every value was
          // withheld for want of ad evidence. The ranking reads the selected
          // calendar window, so its profit evidence is that window's.
          'topProducts.netProfit': topProductsProfitBasis,
          profitInputs: rangeProfitEvidence.profit,
        }),
      } satisfies DashboardSalesSummary;
    } catch (error) {
      this.logger.error('Failed to get sales summary', error);
      throw new InternalServerErrorException('Failed to get sales summary');
    }
  }

  /**
   * A profit read that answers each distinct `[from, to)` window once per
   * summary. The port's result depends only on the organization and the
   * resolved window, so a period another closure rule resolved to the same
   * window shares that read, and its Repeatable Read transaction, instead of
   * opening another.
   */
  private profitReader(
    organizationId: string,
  ): (period: ResolvedDashboardPeriod) => Promise<RangeProfitMetrics> {
    const reads = new Map<string, Promise<RangeProfitMetrics>>();
    return (period) => {
      const { from, to } = period.queryWindow;
      const key = `${from.getTime()}/${to.getTime()}`;
      let read = reads.get(key);
      if (!read) {
        read = this.profitCalculation.calculateForRange(organizationId, period);
        reads.set(key, read);
      }
      return read;
    };
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
    curProfit: RangeProfitMetrics,
    prev: RangeProfitMetrics,
    wingCur: WingTrafficMetrics,
    wingPrev: WingTrafficMetrics,
  ): DashboardSalesSummary['monthly'] {
    const current = resolveSalesPeriod(cur, wingCur);
    // The month's profit and ad rate are read over its closed days, and so is
    // the revenue they are measured against.
    const currentProfit = resolveSalesPeriod(curProfit, wingCur);
    const previous = resolveSalesPeriod(prev, wingPrev);

    // 광고비율은 광고가 붙는 윙 매출 기준으로 계산(로켓 합산 total 로 희석 방지).
    // An ad cost summed over an incompletely measured window is not a
    // measurement, so neither is the ratio built on it.
    const adRate = curProfit.adEvidenceComplete
      ? measuredPercent1(curProfit.adCost, currentProfit.revenue)
      : null;
    const prevAdRate = prev.adEvidenceComplete ? measuredPercent1(prev.adCost, previous.revenue) : null;
    const revenueChange = percentChange(current.revenue, previous.revenue);
    const profitChange = percentChange(currentProfit.profit, previous.profit, true);

    return {
      revenue: current.revenue,
      wingRevenue: current.wingRevenue,
      profit: currentProfit.profit,
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
    curProfit: RangeProfitMetrics,
    prev: RangeProfitMetrics,
    wingCur: WingTrafficMetrics,
    wingPrev: WingTrafficMetrics,
  ): NonNullable<DashboardSalesSummary['rangeKpi']> {
    const current = resolveSalesPeriod(cur, wingCur);
    // A month selection's profit is read over its closed days; its rate
    // divides by that same window's revenue.
    const currentProfit = resolveSalesPeriod(curProfit, wingCur);
    const previous = resolveSalesPeriod(prev, wingPrev);

    // Wing-only revenue has no settlement costs, so do not synthesize a zero
    // profit/profitRate that looks like a measured result.
    const profitRate = measuredPercent1(currentProfit.profit, currentProfit.revenue);
    const prevProfitRate = measuredPercent1(previous.profit, previous.revenue);
    const revenueChange = percentChange(current.revenue, previous.revenue);
    const profitChange = percentChange(currentProfit.profit, previous.profit, true);
    return {
      range,
      revenue: current.revenue,
      profit: currentProfit.profit,
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
    funnel: DashboardTrafficFunnelFacts,
  ): TrafficKpi {
    return {
      visitors: funnel.visitors,
      views: funnel.views,
      orders: funnel.orders,
      salesQty: funnel.salesQty,
      revenue: funnel.revenue,
      cartAdds: funnel.cartAdds,
      cartRate: funnel.cartRate,
      conversionRate: funnel.conversionRate,
      orderCartRate: funnel.orderCartRate,
      dailyAverageVisitors: funnel.dailyAverageVisitors,
      providerConversionRate: null,
      coverage: funnel.trafficCoverage,
      reconciliation: null,
      exactPeriodEvidence: {
        listingCount: funnel.intersectionListingCount,
        listingDateCount: funnel.intersectionListingDateCount,
      },
      source: 'mixed',
      // Settlement profit is a different population from the listing/date
      // funnel. It remains available in the profit cards with its own basis.
      netProfit: null,
      profitRate: null,
      needsScrape: false,
      trafficAvailable: Object.values(funnel.metricDates).some((dates) => dates.length > 0),
      trafficObservedAt: funnel.trafficObservedAt?.toISOString() ?? null,
    } satisfies TrafficKpi;
  }
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
  return metrics.some((metric) => {
    const reconciled = wing.reconciliation?.[metric];
    return reconciled ? adTrafficReconciliationStatus(reconciled) === 'MISMATCH' : false;
  });
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
  if (!basis || basis.includedDates.length === 0
    || metrics.revenue === null
    || metrics.costOfGoods === null
    || metrics.commission === null
    || metrics.shippingCost === null
    || metrics.otherCost === null
    || metrics.adCost === null) return null;
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
