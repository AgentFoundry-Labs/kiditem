import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  addDays,
  businessDateKey,
  datesInclusive,
  evidenceCutoffDate,
  kstBusinessDate,
  kstDayStart,
  parseBusinessDate,
} from '../../../../common/kst';
import {
  AD_TRAFFIC_READ_PORT,
  type AdTrafficReadPort,
} from '../../../../advertising/application/port/in/ad-traffic-source.port';
import type {
  AdTrafficSourceAccountDaily,
  AdTrafficSourceDailyPublished,
  AdTrafficSourceReconciliation,
  AdTrafficSourcePublished,
} from '@kiditem/shared/advertising';
import { adTrafficReconciliationStatus } from '@kiditem/shared/advertising';

interface DateRange {
  from: string;
  to: string;
}

export interface TrafficCoverage {
  from: string;
  to: string;
  targetDays: number;
  completedDays: number;
  missingDates: string[];
}

type TrafficAdditiveMetric = keyof AdTrafficSourceReconciliation;

interface AccountDailyRead {
  rows: AccountDailyRow[];
  coverage: TrafficCoverage;
  reconciliation: AdTrafficSourceReconciliation | null;
}

type AccountDailyRow = AdTrafficSourceAccountDaily;

interface DayRevenue {
  date: string;
  revenue: number;
  orders: number;
  salesQty: number;
  visitors: number;
  views: number;
  cartAdds: number;
}

/**
 * `TrafficService` reads the Advertising owner's published `accountDaily`
 * projection. Legacy listing rows and period-as-day values are never a read
 * fallback for Wing metrics. It writes nothing: the traffic CSV upload lane is
 * retired (KID-110), so Advertising's Wing collection is the only listing-day
 * traffic publisher.
 */
@Injectable()
export class TrafficService {
  constructor(
    @Inject(AD_TRAFFIC_READ_PORT)
    private readonly trafficRead: AdTrafficReadPort,
  ) {}

  /** Period summary over owner-published account daily facts. */
  async getTrafficSummary(days: number, organizationId: string) {
    const todayStart = kstDayStart(new Date());
    const todayEnd = addDays(todayStart, 1);

    let start: Date;
    let end: Date;
    if (days <= 1) {
      start = todayStart;
      end = todayEnd;
    } else {
      start = addDays(todayStart, -(days - 1));
      end = todayEnd;
    }

    const duration = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - duration);
    const prevEnd = start;
    const [current, previous] = await Promise.all([
      this.readAccountDaily(organizationId, dateRange(start, end)),
      this.readAccountDaily(organizationId, dateRange(prevStart, prevEnd)),
    ]);
    const currentTotals = sumAccountDaily(
      current.rows,
      current.coverage,
      current.reconciliation,
    );
    const previousTotals = sumAccountDaily(
      previous.rows,
      previous.coverage,
      previous.reconciliation,
    );

    return {
      days,
      revenue: currentTotals.revenue,
      orders: currentTotals.orders,
      salesQty: currentTotals.salesQty,
      // Account UV is an average over complete account daily coverage, never
      // a sum of listing/option visitor values.
      visitors: currentTotals.averageDailyVisitors,
      averageDailyVisitors: currentTotals.averageDailyVisitors,
      views: currentTotals.views,
      cartAdds: currentTotals.cartAdds,
      prevRevenue: previousTotals.revenue,
      prevOrders: previousTotals.orders,
      revenueChange:
        percentageChange(currentTotals.revenue, previousTotals.revenue),
      ordersChange:
        percentageChange(currentTotals.orders, previousTotals.orders),
      coverage: current.coverage,
      reconciliation: current.reconciliation,
    };
  }

  async getMonthlyRevenue(year: number, month: number, organizationId: string) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const endExclusive = new Date(Date.UTC(year, month, 1));
    // Wing's current business date is still in flight. Only yesterday is an
    // explicit monthly cutoff; today's partial collection must not make a
    // month appear complete.
    const yesterday = evidenceCutoffDate();
    const monthEnd = addDays(endExclusive, -1);
    const effectiveEnd = monthEnd < yesterday ? monthEnd : yesterday;
    if (start > effectiveEnd) {
      const coverage = emptyCoverage(calendarDate(start), calendarDate(monthEnd));
      return {
        year,
        month,
        days: [],
        total: { revenue: null, orders: null, salesQty: null, visitors: null, views: null, cartAdds: null },
        averageDailyVisitors: null,
        coverage,
        reconciliation: null,
      };
    }

    const result = await this.readAccountDaily(
      organizationId,
      { from: calendarDate(start), to: calendarDate(effectiveEnd) },
    );
    const totals = sumAccountDaily(
      result.rows,
      result.coverage,
      result.reconciliation,
    );
    const days: DayRevenue[] = result.rows.map((row) => ({
      date: row.businessDate,
      revenue: row.revenue,
      orders: row.orders,
      salesQty: row.salesQty,
      visitors: row.visitors,
      views: row.views,
      cartAdds: row.cartAdds,
    }));

    return {
      year,
      month,
      days,
      total: {
        revenue: totals.revenue,
        orders: totals.orders,
        salesQty: totals.salesQty,
        // This is intentionally nullable: it is not a period UV sum.
        visitors: totals.averageDailyVisitors,
        views: totals.views,
        cartAdds: totals.cartAdds,
      },
      averageDailyVisitors: totals.averageDailyVisitors,
      coverage: result.coverage,
      reconciliation: result.reconciliation,
    };
  }

  private async readAccountDaily(
    organizationId: string,
    range: DateRange,
  ): Promise<AccountDailyRead> {
    const coverage = buildCoverage(range, []);

    let published: AdTrafficSourcePublished;
    try {
      published = await this.trafficRead.readPublished({
        organizationId,
        from: range.from,
        to: range.to,
      });
    } catch (error) {
      if (
        error instanceof NotFoundException
        && ['COUPANG_ACCOUNT_NOT_FOUND', 'AD_TRAFFIC_SOURCE_MISSING'].includes(error.message)
      ) {
        return { rows: [], coverage, reconciliation: null };
      }
      throw error;
    }

    const daily = dailyPublication(published);
    if (!daily) return { rows: [], coverage, reconciliation: null };
    const rows = selectAccountDailyRows(daily.accountDaily, range);
    return {
      rows,
      coverage: buildCoverage(range, rows),
      reconciliation: daily.reconciliation,
    };
  }
}

function dailyPublication(
  published: AdTrafficSourcePublished,
): AdTrafficSourceDailyPublished | null {
  // Only daily publications exist since the v1 lane was retired (KID-232).
  return 'accountDaily' in published ? published : null;
}

function dateRange(start: Date, endExclusive: Date): DateRange {
  return {
    from: calendarDate(kstBusinessDate(start)),
    to: calendarDate(kstBusinessDate(new Date(endExclusive.getTime() - 1))),
  };
}

function selectAccountDailyRows(
  rows: ReadonlyArray<AccountDailyRow>,
  range: DateRange,
): AccountDailyRow[] {
  const byDate = new Map<string, AccountDailyRow>();
  for (const row of rows) {
    if (row.businessDate < range.from || row.businessDate > range.to) continue;
    const current = byDate.get(row.businessDate);
    if (!current || Date.parse(row.observedAt) >= Date.parse(current.observedAt)) {
      byDate.set(row.businessDate, row);
    }
  }
  return [...byDate.values()].sort((left, right) =>
    left.businessDate.localeCompare(right.businessDate));
}

function sumAccountDaily(
  rows: ReadonlyArray<AccountDailyRow>,
  coverage: TrafficCoverage,
  reconciliation: AdTrafficSourceReconciliation | null = null,
) {
  const rawTotals = rows.reduce(
    (sum, row) => ({
      visitors: sum.visitors + row.visitors,
      views: sum.views + row.views,
      cartAdds: sum.cartAdds + row.cartAdds,
      orders: sum.orders + row.orders,
      salesQty: sum.salesQty + row.salesQty,
      revenue: sum.revenue + row.revenue,
    }),
    { visitors: 0, views: 0, cartAdds: 0, orders: 0, salesQty: 0, revenue: 0 },
  );
  const complete = coverage.targetDays > 0
    && coverage.completedDays === coverage.targetDays;
  const metricValue = (metric: TrafficAdditiveMetric): number | null => {
    const reconciled = reconciliation?.[metric];
    if (!complete || (reconciled && adTrafficReconciliationStatus(reconciled) === 'MISMATCH')) {
      return null;
    }
    return rawTotals[metric];
  };
  const averageDailyVisitors = complete
    ? rawTotals.visitors / coverage.targetDays
    : null;
  return {
    visitors: rawTotals.visitors,
    views: metricValue('views'),
    cartAdds: metricValue('cartAdds'),
    orders: metricValue('orders'),
    salesQty: metricValue('salesQty'),
    revenue: metricValue('revenue'),
    averageDailyVisitors,
  };
}

function percentageChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function buildCoverage(
  range: DateRange,
  rows: ReadonlyArray<AccountDailyRow>,
): TrafficCoverage {
  const targetDates = enumerateDates(range.from, range.to);
  const completedDates = new Set(rows.map((row) => row.businessDate));
  return {
    from: range.from,
    to: range.to,
    targetDays: targetDates.length,
    completedDays: targetDates.filter((date) => completedDates.has(date)).length,
    missingDates: targetDates.filter((date) => !completedDates.has(date)),
  };
}

function emptyCoverage(from: string, to: string): TrafficCoverage {
  return buildCoverage({ from, to }, []);
}

function enumerateDates(from: string, to: string): string[] {
  const start = parseBusinessDate(from);
  const end = parseBusinessDate(to);
  return start && end ? datesInclusive(start, end).map(businessDateKey) : [];
}

function calendarDate(value: Date): string {
  return businessDateKey(value);
}
