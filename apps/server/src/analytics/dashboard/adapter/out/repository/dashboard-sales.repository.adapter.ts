import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import type { TopProduct, DailyRevenueItem } from '@kiditem/shared/dashboard';
import {
  MasterProductAbcEvaluationSchema,
  type MasterProductAbcEvaluation,
} from '@kiditem/shared/product-abc';
import type {
  DashboardSalesRepositoryPort,
  TodayKpiRow,
} from '../../../application/port/out/repository/dashboard-sales.repository.port';

interface TopProductRawRow {
  id: string;
  name: string;
  organization: string | null;
  grade: string | null;
  abcProvisionalGrade: string | null;
  abcLifecycleStage: string | null;
  abcConfidence: string | null;
  abcEligibilityReason: string | null;
  abcRiskFlags: string[] | null;
  abcObservedCompleteMonths: number | null;
  abcObservationStartMonth: string | null;
  abcPeriodMetricValue: number | string | null;
  abcRankingValue: number | string | null;
  abcGrossRevenue: number | null;
  abcGrossCost: number | null;
  abcGrossProfit: number | null;
  abcGrossMarginRate: number | string | null;
  abcContributionRate: number | string | null;
  abcCumulativeContributionRate: number | string | null;
  abcCalculatedAt: Date | string | null;
  abcSourceCapturedAt: Date | string | null;
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
        abce.provisional_grade AS "abcProvisionalGrade",
        abce.lifecycle_stage AS "abcLifecycleStage",
        abce.confidence AS "abcConfidence",
        abce.eligibility_reason AS "abcEligibilityReason",
        abce.risk_flags AS "abcRiskFlags",
        abce.observed_complete_months AS "abcObservedCompleteMonths",
        abce.observation_start_month AS "abcObservationStartMonth",
        abce.period_metric_value AS "abcPeriodMetricValue",
        abce.ranking_value AS "abcRankingValue",
        abce.gross_revenue AS "abcGrossRevenue",
        abce.gross_cost AS "abcGrossCost",
        abce.gross_profit AS "abcGrossProfit",
        abce.gross_margin_rate AS "abcGrossMarginRate",
        abce.contribution_rate AS "abcContributionRate",
        abce.cumulative_contribution_rate AS "abcCumulativeContributionRate",
        abce.calculated_at AS "abcCalculatedAt",
        abce.source_captured_at AS "abcSourceCapturedAt",
        SUM(oli.total_price)::int AS revenue,
        SUM(oli.quantity)::int AS quantity
      FROM orders o
      JOIN order_line_items oli ON oli.order_id = o.id
      JOIN channel_listing_options clo ON clo.id = oli.listing_option_id
      JOIN channel_listings cl ON cl.id = clo.listing_id
      LEFT JOIN master_products mp ON mp.id = cl.master_product_id
        AND mp.organization_id = ${organizationId}::uuid
      LEFT JOIN master_product_abc_evaluations abce
        ON abce.master_product_id = mp.id
        AND abce.organization_id = ${organizationId}::uuid
      WHERE o.organization_id = ${organizationId}::uuid
        AND oli.organization_id = ${organizationId}::uuid
        AND clo.organization_id = ${organizationId}::uuid
        AND cl.organization_id = ${organizationId}::uuid
        AND o.ordered_at >= ${monthStart}
        AND o.ordered_at < ${monthEnd}
        AND o.status NOT IN ('cancelled', 'returned', 'refunded')
      GROUP BY cl.id, mp.name, mp.abc_grade,
        abce.provisional_grade, abce.lifecycle_stage, abce.confidence,
        abce.eligibility_reason, abce.risk_flags,
        abce.observed_complete_months, abce.observation_start_month,
        abce.period_metric_value, abce.ranking_value,
        abce.gross_revenue, abce.gross_cost, abce.gross_profit,
        abce.gross_margin_rate, abce.contribution_rate,
        abce.cumulative_contribution_rate, abce.calculated_at,
        abce.source_captured_at
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
        abcEvaluation: mapAbcEvaluation(r),
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

function mapAbcEvaluation(row: TopProductRawRow): MasterProductAbcEvaluation | null {
  if (!row.abcLifecycleStage) return null;
  const grade = row.grade === 'A' || row.grade === 'B' || row.grade === 'C'
    ? row.grade
    : null;
  const parseNumber = (value: number | string | null): number | null => {
    if (value === null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const evaluation = MasterProductAbcEvaluationSchema.safeParse({
    abcGrade: grade,
    provisionalGrade: row.abcProvisionalGrade,
    lifecycleStage: row.abcLifecycleStage,
    confidence: row.abcConfidence,
    eligibilityReason: row.abcEligibilityReason,
    riskFlags: Array.isArray(row.abcRiskFlags) ? row.abcRiskFlags : [],
    observedCompleteMonths: row.abcObservedCompleteMonths ?? 0,
    observationStartMonth: row.abcObservationStartMonth,
    periodMetricValue: parseNumber(row.abcPeriodMetricValue),
    rankingValue: parseNumber(row.abcRankingValue),
    grossRevenue: row.abcGrossRevenue,
    grossCost: row.abcGrossCost,
    grossProfit: row.abcGrossProfit,
    grossMarginRate: parseNumber(row.abcGrossMarginRate),
    contributionRate: parseNumber(row.abcContributionRate),
    cumulativeContributionRate: parseNumber(row.abcCumulativeContributionRate),
    calculatedAt: row.abcCalculatedAt,
    sourceCapturedAt: row.abcSourceCapturedAt,
  });
  return evaluation.success ? evaluation.data : null;
}
