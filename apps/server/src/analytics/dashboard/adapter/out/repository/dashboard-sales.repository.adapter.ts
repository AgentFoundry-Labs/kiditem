import { Injectable } from '@nestjs/common';
import { ProductAbcEvaluationSchema } from '@kiditem/shared/product-abc';
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
  abcEvaluation: unknown;
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
      WITH scoped_orders AS (
        SELECT *
        FROM orders
        WHERE organization_id = ${organizationId}::uuid
      )
      SELECT
        cl.id::text AS id,
        COALESCE(mp.name, cl.display_name, cl.channel_name, cl.external_id) AS name,
        cl.channel_name AS organization,
        CASE WHEN abce.id IS NULL THEN NULL ELSE jsonb_build_object(
          'abcGrade', abce.abc_grade,
          'weightedRevenue', abce.weighted_revenue,
          'weightedOrderTimeSupplyCost', abce.weighted_order_time_supply_cost,
          'weightedAdvertisingSpend', abce.weighted_advertising_spend,
          'weightedOperatingProfit', abce.weighted_operating_profit,
          'operatingProfitVelocity30', abce.operating_profit_velocity_30,
          'operatingMargin', abce.operating_margin,
          'lossPersistence', abce.loss_persistence,
          'profitScore', abce.profit_score,
          'marginScore', abce.margin_score,
          'consistencyScore', abce.consistency_score,
          'economicScore', abce.economic_score,
          'validObservationDays', abce.valid_observation_days,
          'formula', abcf.formula_json,
          'formulaRevision', abce.formula_revision,
          'publicationRevision', abce.publication_revision,
          'gradeBasisCutoffDate', abce.grade_basis_cutoff_date,
          'saleStartDate', abce.sale_start_date,
          'sellpiaSourceImportRunId', abce.sellpia_source_import_run_id,
          'advertisingSourceImportRunId', abce.advertising_source_import_run_id,
          'sellpiaGeneration', abce.sellpia_generation::text,
          'advertisingGeneration', abce.advertising_generation::text,
          'mappingGeneration', abce.mapping_generation::text,
          'calculatedAt', abce.calculated_at
        ) END AS "abcEvaluation",
        SUM(oli.total_price)::int AS revenue,
        SUM(oli.quantity)::int AS quantity
      FROM scoped_orders o
      JOIN order_line_items oli ON oli.order_id = o.id
      JOIN channel_listing_options clo ON clo.id = oli.listing_option_id
      JOIN channel_listings cl ON cl.id = clo.listing_id
      LEFT JOIN master_products mp ON mp.id = cl.master_product_id
        AND mp.organization_id = ${organizationId}::uuid
      LEFT JOIN master_product_abc_evaluations abce
        ON abce.master_product_id = mp.id
        AND abce.organization_id = ${organizationId}::uuid
      LEFT JOIN master_product_abc_formula_versions abcf
        ON abcf.id = abce.formula_version_id
        AND abcf.organization_id = ${organizationId}::uuid
      WHERE o.organization_id = ${organizationId}::uuid
        AND oli.organization_id = ${organizationId}::uuid
        AND clo.organization_id = ${organizationId}::uuid
        AND cl.organization_id = ${organizationId}::uuid
        AND o.ordered_at >= ${monthStart}
        AND o.ordered_at < ${monthEnd}
        AND o.status NOT IN ('cancelled', 'returned', 'refunded')
      GROUP BY cl.id, mp.name, abce.id, abcf.id
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
      const parsedEvaluation = ProductAbcEvaluationSchema.safeParse(r.abcEvaluation);
      const abcEvaluation = parsedEvaluation.success ? parsedEvaluation.data : null;
      return {
        id: r.id,
        name: r.name,
        organization: r.organization ?? '미지정',
        grade: abcEvaluation?.abcGrade ?? null,
        abcEvaluation,
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
