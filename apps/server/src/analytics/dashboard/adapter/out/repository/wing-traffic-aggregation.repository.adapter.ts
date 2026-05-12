import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../../prisma/prisma.service';
import type {
  WingTrafficAggregationRepositoryPort,
  WingTrafficMetrics,
  CoupangAdsMetrics,
  WingDailyTrendRow,
  CoupangAdsDailyRow,
} from '../../../application/port/out/wing-traffic-aggregation.repository.port';

/**
 * Drive replay aggregations — Wing daily traffic + Coupang ads daily KPIs.
 *
 * The dashboard's order-based read paths return zero numbers when the operator
 * is running on a Drive replay snapshot (no Order rows). The same period has
 * Wing daily-fact rows in `channel_listing_daily_snapshots.traffic_*` and
 * Coupang ad KPI rows in
 * `channel_account_daily_kpi_snapshots(kpi_type='coupang_ads_daily')`. This
 * adapter exposes those two sources so the application services can surface
 * Wing/Drive numbers when Order data is absent.
 *
 * Multi-tenant: every read binds `organizationId`. Date columns are
 * `@db.Date`; callers pass UTC-midnight `Date` instants which compare cleanly
 * against the calendar-date column.
 */
@Injectable()
export class WingTrafficAggregationRepositoryAdapter
  implements WingTrafficAggregationRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async aggregateTraffic(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<WingTrafficMetrics> {
    const agg = await this.prisma.channelListingDailySnapshot.aggregate({
      where: {
        organizationId,
        businessDate: { gte: from, lt: to },
      },
      _sum: {
        trafficRevenue: true,
        trafficOrders: true,
        trafficSalesQty: true,
        trafficVisitors: true,
        trafficViews: true,
        trafficCartAdds: true,
      },
      _max: {
        lastObservedAt: true,
      },
      _count: { _all: true },
    });

    const revenue = agg._sum.trafficRevenue ?? 0;
    const orders = agg._sum.trafficOrders ?? 0;
    const salesQty = agg._sum.trafficSalesQty ?? 0;
    const visitors = agg._sum.trafficVisitors ?? 0;
    const views = agg._sum.trafficViews ?? 0;
    const cartAdds = agg._sum.trafficCartAdds ?? 0;
    const conversionRate =
      visitors > 0 ? Math.round((orders / visitors) * 1000) / 10 : 0;

    const hasData =
      (agg._count._all ?? 0) > 0 &&
      (visitors > 0 || views > 0 || orders > 0 || salesQty > 0 || revenue !== 0);

    return {
      revenue,
      orders,
      salesQty,
      visitors,
      views,
      cartAdds,
      conversionRate,
      hasData,
      lastObservedAt: agg._max.lastObservedAt ?? null,
    } satisfies WingTrafficMetrics;
  }

  async aggregateCoupangAds(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<CoupangAdsMetrics> {
    const rows = await this.prisma.channelAccountDailyKpiSnapshot.findMany({
      where: {
        organizationId,
        kpiType: 'coupang_ads_daily',
        businessDate: { gte: from, lt: to },
      },
      select: { normalizedJson: true, lastObservedAt: true },
    });

    let spend = 0;
    let revenue = 0;
    let impressions = 0;
    let clicks = 0;
    let conversions = 0;
    let orders = 0;
    let lastObservedAt: Date | null = null;

    for (const row of rows) {
      const payload = (row.normalizedJson as Record<string, unknown> | null) ?? null;
      if (!payload) continue;
      spend += toInt(payload.adSpend);
      revenue += toInt(payload.adRevenue);
      impressions += toInt(payload.impressions);
      clicks += toInt(payload.clicks);
      conversions += toInt(payload.conversions);
      orders += toInt(payload.orders);
      if (!lastObservedAt || row.lastObservedAt > lastObservedAt) {
        lastObservedAt = row.lastObservedAt;
      }
    }

    const hasData =
      rows.length > 0 && (spend > 0 || revenue > 0 || impressions > 0 || clicks > 0);

    return {
      spend,
      revenue,
      impressions,
      clicks,
      conversions,
      orders,
      hasData,
      lastObservedAt,
    } satisfies CoupangAdsMetrics;
  }

  /**
   * Latest business date with Drive replay activity for this organization.
   * Returns the `MAX(business_date)` across the two daily-fact sources we
   * read from in the dashboard. Used to anchor the dashboard's effective
   * month onto the latest data window when the calendar month is empty.
   */
  async findLatestDataDate(
    organizationId: string,
  ): Promise<Date | null> {
    const [wing, ads] = await Promise.all([
      this.prisma.channelListingDailySnapshot.aggregate({
        where: {
          organizationId,
          OR: [
            { trafficVisitors: { gt: 0 } },
            { trafficOrders: { gt: 0 } },
            { trafficSalesQty: { gt: 0 } },
            { trafficRevenue: { not: 0 } },
          ],
        },
        _max: { businessDate: true },
      }),
      this.prisma.channelAccountDailyKpiSnapshot.aggregate({
        where: {
          organizationId,
          kpiType: 'coupang_ads_daily',
        },
        _max: { businessDate: true },
      }),
    ]);

    const dates = [wing._max.businessDate, ads._max.businessDate].filter(
      (d): d is Date => d instanceof Date,
    );
    if (dates.length === 0) return null;
    return dates.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b));
  }

  /**
   * Per-day Wing traffic over a half-open `[since, ...]` window. Aggregates
   * `business_date` directly; the dashboard chart already plots in KST and
   * the column is calendar-date typed so no zone conversion is needed.
   */
  async fetchDailyTrend(
    organizationId: string,
    since: Date,
    until?: Date,
  ): Promise<WingDailyTrendRow[]> {
    const upperBound = until ?? null;
    return this.prisma.$queryRaw<WingDailyTrendRow[]>(Prisma.sql`
      SELECT
        TO_CHAR(business_date, 'YYYY-MM-DD') AS date,
        COALESCE(SUM(traffic_revenue), 0)::int  AS revenue,
        COALESCE(SUM(traffic_orders), 0)::int   AS orders,
        COALESCE(SUM(traffic_sales_qty), 0)::int AS "salesQty",
        COALESCE(SUM(traffic_visitors), 0)::int AS visitors
      FROM channel_listing_daily_snapshots
      WHERE organization_id = ${organizationId}::uuid
        AND business_date >= ${since}::date
        ${upperBound ? Prisma.sql`AND business_date < ${upperBound}::date` : Prisma.empty}
      GROUP BY 1
      ORDER BY 1
    `);
  }

  /**
   * Per-day Coupang ads over `[since, until?]`. Pulls from the
   * `coupang_ads_daily` KPI snapshot rows and deserializes the additive
   * normalized payload columns. Used as a fallback for the trend/ad chart
   * series when the listing-level daily-fact ad columns are empty (Drive
   * replay only writes ads to the account-level snapshot).
   */
  async fetchDailyAds(
    organizationId: string,
    since: Date,
    until?: Date,
  ): Promise<CoupangAdsDailyRow[]> {
    const rows = await this.prisma.channelAccountDailyKpiSnapshot.findMany({
      where: {
        organizationId,
        kpiType: 'coupang_ads_daily',
        businessDate: until
          ? { gte: since, lt: until }
          : { gte: since },
      },
      select: { businessDate: true, normalizedJson: true },
      orderBy: { businessDate: 'asc' },
    });

    return rows.map((row) => {
      const payload =
        (row.normalizedJson as Record<string, unknown> | null) ?? {};
      return {
        date: row.businessDate.toISOString().slice(0, 10),
        ad_cost: toInt(payload.adSpend),
        ad_revenue: toInt(payload.adRevenue),
        clicks: toInt(payload.clicks),
        impressions: toInt(payload.impressions),
      } satisfies CoupangAdsDailyRow;
    });
  }
}

function toInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const cleaned = value.replace(/[,%]/g, '');
    const n = Number(cleaned);
    if (Number.isFinite(n)) return Math.max(0, Math.round(n));
  }
  return 0;
}
