import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import type { TopProduct, DailyRevenueItem } from '@kiditem/shared/dashboard';
import type {
  DashboardSalesRepositoryPort,
  TodayKpiRow,
} from '../../../application/port/out/repository/dashboard-sales.repository.port';

interface TopProductRawRow {
  id: string;
  name: string;
  organization: string | null;
  grade: string | null;
  revenue: number;
  quantity: number;
}

/**
 * Sales-side raw SQL for the dashboard read model. Owns the tagged-template
 * `$queryRaw` reads that hydrate today KPI, top-N product ranking, and the
 * current-month per-day revenue series.
 *
 * Tenant predicate: every read binds `${organizationId}::uuid` against the
 * appropriate tenant column (orders, channel listings, master products).
 * 2-hop joins assert the predicate on each tenant-owned table.
 */
@Injectable()
export class DashboardSalesRepositoryAdapter
  implements DashboardSalesRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  /**
   * KST today KPI — `SUM(oli.total_price)` is the I3 canonical revenue source
   * (per-line-item, not per-order) for the channel-agnostic order schema.
   */
  async fetchTodayKpis(
    organizationId: string,
    todayStart: Date,
    todayEnd: Date,
  ): Promise<TodayKpiRow> {
    const rows = await this.prisma.$queryRaw<TodayKpiRow[]>`
      SELECT
        COALESCE(SUM(oli.total_price), 0)::int AS revenue,
        COUNT(DISTINCT o.id)::int AS orders
      FROM orders o
      JOIN order_line_items oli ON oli.order_id = o.id
      WHERE o.organization_id = ${organizationId}::uuid
        AND o.ordered_at >= ${todayStart}
        AND o.ordered_at < ${todayEnd}
        AND o.status NOT IN ('cancelled', 'returned', 'refunded')
    `;
    const r = rows[0];
    return { revenue: Number(r?.revenue ?? 0), orders: Number(r?.orders ?? 0) };
  }

  /**
   * Top-N (10) listing revenue ranking for the calendar month. Revenue is
   * grouped by ChannelListing so a bundle line is counted once regardless of
   * how many Sellpia components its option consumes. Product labels and grade
   * come from the listing's direct operational-product link.
   *
   * Returns the raw shape; the application service applies the documented
   * 30%-margin approximation for `netProfit`/`profitRate`.
   */
  async fetchTopProducts(
    organizationId: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<TopProduct[]> {
    const rows = await this.prisma.$queryRaw<TopProductRawRow[]>`
      SELECT
        cl.id::text AS id,
        COALESCE(mp.name, cl.display_name, cl.channel_name, cl.external_id) AS name,
        cl.channel_name AS organization,
        mp.abc_grade AS grade,
        SUM(oli.total_price)::int AS revenue,
        SUM(oli.quantity)::int AS quantity
      FROM orders o
      JOIN order_line_items oli ON oli.order_id = o.id
      JOIN channel_listing_options clo ON clo.id = oli.listing_option_id
      JOIN channel_listings cl ON cl.id = clo.listing_id
      LEFT JOIN master_products mp ON mp.id = cl.master_product_id
        AND mp.organization_id = ${organizationId}::uuid
      WHERE o.organization_id = ${organizationId}::uuid
        AND oli.organization_id = ${organizationId}::uuid
        AND clo.organization_id = ${organizationId}::uuid
        AND cl.organization_id = ${organizationId}::uuid
        AND o.ordered_at >= ${monthStart}
        AND o.ordered_at < ${monthEnd}
        AND o.status NOT IN ('cancelled', 'returned', 'refunded')
      GROUP BY cl.id, mp.name, mp.abc_grade
      ORDER BY revenue DESC
      LIMIT 10
    `;

    // KNOWN APPROXIMATION (Plan F1 critic MAJOR #2 — documented in release note):
    // For the top-N ranking widget we approximate netProfit/profitRate using a flat
    // 30% margin assumption. Precise per-listing math lives in /api/profit-loss
    // (which uses buildPerListingMetrics). Top-N is a summary visual, not a financial
    // report — users who need exact margin per master must drill into /profit-loss.
    return rows.map((r) => {
      const revenue = Number(r.revenue ?? 0);
      const netProfit = Math.round(revenue * 0.3);
      const profitRate = revenue > 0 ? 30.0 : 0;
      return {
        id: r.id,
        name: r.name,
        organization: r.organization ?? '미지정',
        grade:
          r.grade === 'A' || r.grade === 'B' || r.grade === 'C'
            ? r.grade
            : null,
        revenue,
        netProfit,
        profitRate,
      } satisfies TopProduct;
    });
  }

  /**
   * Per-day revenue for the calendar month, KST-bucketed.
   * `SUM(oli.total_price)` per `o.ordered_at AT TIME ZONE 'Asia/Seoul'::date`.
   */
  async fetchDailyRevenue(
    organizationId: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<DailyRevenueItem[]> {
    const rows = await this.prisma.$queryRaw<Array<{ date: string; revenue: number }>>`
      SELECT
        TO_CHAR(o.ordered_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS date,
        COALESCE(SUM(oli.total_price), 0)::int AS revenue
      FROM orders o
      JOIN order_line_items oli ON oli.order_id = o.id
      WHERE o.organization_id = ${organizationId}::uuid
        AND o.ordered_at >= ${monthStart}
        AND o.ordered_at < ${monthEnd}
        AND o.status NOT IN ('cancelled', 'returned', 'refunded')
      GROUP BY 1
      ORDER BY 1
    `;
    return rows.map(
      (r) => ({ date: r.date, revenue: Number(r.revenue) } satisfies DailyRevenueItem),
    );
  }
}
