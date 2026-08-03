import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import type { TopProduct, DailyRevenueItem } from '@kiditem/shared/dashboard';
import {
  ProductAbcEvaluationSchema,
  ProductAbcFormulaSummarySchema,
  type ProductAbcEvaluation,
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
  abcCalculationStatus: string | null;
  abcRawScore: number | string | null;
  abcAdjustedScore: number | string | null;
  abcReliability: number | string | null;
  abcWeightedRevenue: number | string | null;
  abcWeightedOrderTimeCogs: number | string | null;
  abcWeightedAdSpend: number | string | null;
  abcWeightedContributionProfit: number | string | null;
  abcProfitVelocity30: number | string | null;
  abcWeightedContributionMargin: number | string | null;
  abcLossRecurrence: number | string | null;
  abcPaidOrderCount: number | null;
  abcObservationDays: number | null;
  abcFirstValidPaidSaleAt: Date | string | null;
  abcSourceCoverageStartDate: Date | string | null;
  abcSourceCoverageEndDate: Date | string | null;
  abcEvaluationCutoffDate: Date | string | null;
  abcSellpiaCoverageStartDate: Date | string | null;
  abcSellpiaCoverageEndDate: Date | string | null;
  abcSellpiaSourceStatus: string | null;
  abcSellpiaSourceCapturedAt: Date | string | null;
  abcAdvertisingCoverageStartDate: Date | string | null;
  abcAdvertisingCoverageEndDate: Date | string | null;
  abcAdvertisingSourceStatus: string | null;
  abcAdvertisingSourceCapturedAt: Date | string | null;
  abcOrdersSourceStatus: string | null;
  abcOrdersCoverageStartDate: Date | string | null;
  abcOrdersCoverageEndDate: Date | string | null;
  abcOrdersSourceCapturedAt: Date | string | null;
  abcMappingSourceStatus: string | null;
  abcMappingInventoryGeneration: bigint | string | null;
  abcMappingVerifiedAt: Date | string | null;
  abcCostComponents: unknown;
  abcStatusDetail: string | null;
  abcCalculatedAt: Date | string | null;
  abcFormulaJson: unknown;
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
        mp.abc_grade AS grade,
        abce.calculation_status AS "abcCalculationStatus",
        abce.raw_score AS "abcRawScore",
        abce.adjusted_score AS "abcAdjustedScore",
        abce.reliability AS "abcReliability",
        abce.weighted_revenue AS "abcWeightedRevenue",
        abce.weighted_order_time_cogs AS "abcWeightedOrderTimeCogs",
        abce.weighted_ad_spend AS "abcWeightedAdSpend",
        abce.weighted_contribution_profit AS "abcWeightedContributionProfit",
        abce.profit_velocity_30 AS "abcProfitVelocity30",
        abce.weighted_contribution_margin AS "abcWeightedContributionMargin",
        abce.loss_recurrence AS "abcLossRecurrence",
        abce.paid_order_count AS "abcPaidOrderCount",
        abce.observation_days AS "abcObservationDays",
        abce.first_valid_paid_sale_at AS "abcFirstValidPaidSaleAt",
        abce.source_coverage_start_date AS "abcSourceCoverageStartDate",
        abce.source_coverage_end_date AS "abcSourceCoverageEndDate",
        abce.evaluation_cutoff_date AS "abcEvaluationCutoffDate",
        abce.sellpia_coverage_start_date AS "abcSellpiaCoverageStartDate",
        abce.sellpia_coverage_end_date AS "abcSellpiaCoverageEndDate",
        abce.sellpia_source_status AS "abcSellpiaSourceStatus",
        abce.sellpia_source_captured_at AS "abcSellpiaSourceCapturedAt",
        abce.advertising_coverage_start_date AS "abcAdvertisingCoverageStartDate",
        abce.advertising_coverage_end_date AS "abcAdvertisingCoverageEndDate",
        abce.advertising_source_status AS "abcAdvertisingSourceStatus",
        abce.advertising_source_captured_at AS "abcAdvertisingSourceCapturedAt",
        abce.orders_source_status AS "abcOrdersSourceStatus",
        abce.orders_coverage_start_date AS "abcOrdersCoverageStartDate",
        abce.orders_coverage_end_date AS "abcOrdersCoverageEndDate",
        abce.orders_source_captured_at AS "abcOrdersSourceCapturedAt",
        abce.mapping_source_status AS "abcMappingSourceStatus",
        abce.mapping_inventory_generation AS "abcMappingInventoryGeneration",
        abce.mapping_verified_at AS "abcMappingVerifiedAt",
        abce.cost_components_json AS "abcCostComponents",
        abce.status_detail AS "abcStatusDetail",
        abce.calculated_at AS "abcCalculatedAt",
        abcf.formula_json AS "abcFormulaJson",
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
      GROUP BY cl.id, mp.name, mp.abc_grade,
        abce.calculation_status, abce.raw_score, abce.adjusted_score,
        abce.reliability, abce.weighted_revenue, abce.weighted_order_time_cogs,
        abce.weighted_ad_spend, abce.weighted_contribution_profit,
        abce.profit_velocity_30, abce.weighted_contribution_margin,
        abce.loss_recurrence, abce.paid_order_count, abce.observation_days,
        abce.first_valid_paid_sale_at, abce.source_coverage_start_date,
        abce.source_coverage_end_date, abce.evaluation_cutoff_date,
        abce.sellpia_coverage_start_date, abce.sellpia_coverage_end_date,
        abce.sellpia_source_status, abce.sellpia_source_captured_at,
        abce.advertising_coverage_start_date, abce.advertising_coverage_end_date,
        abce.advertising_source_status, abce.advertising_source_captured_at,
        abce.orders_source_status, abce.orders_coverage_start_date,
        abce.orders_coverage_end_date, abce.orders_source_captured_at,
        abce.mapping_source_status, abce.mapping_inventory_generation,
        abce.mapping_verified_at, abce.cost_components_json,
        abce.status_detail, abce.calculated_at, abcf.formula_json
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

function mapAbcEvaluation(row: TopProductRawRow): ProductAbcEvaluation | null {
  if (!row.abcCalculationStatus || !row.abcCostComponents) return null;
  const grade = row.grade === 'A' || row.grade === 'B' || row.grade === 'C'
    ? row.grade
    : null;
  const parseNumber = (value: number | string | null): number | null => {
    if (value === null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const cutoff = row.abcEvaluationCutoffDate
    ?? row.abcSourceCoverageEndDate
    ?? row.abcCalculatedAt;
  if (!cutoff) return null;
  const formula = row.abcFormulaJson
    ? ProductAbcFormulaSummarySchema.safeParse(row.abcFormulaJson)
    : null;
  const evaluation = ProductAbcEvaluationSchema.safeParse({
    abcGrade: grade,
    calculationStatus: row.abcCalculationStatus,
    rawScore: parseNumber(row.abcRawScore),
    adjustedScore: parseNumber(row.abcAdjustedScore),
    reliability: parseNumber(row.abcReliability),
    weightedRevenue: parseNumber(row.abcWeightedRevenue),
    weightedOrderTimeCogs: parseNumber(row.abcWeightedOrderTimeCogs),
    weightedAdSpend: parseNumber(row.abcWeightedAdSpend),
    weightedContributionProfit: parseNumber(row.abcWeightedContributionProfit),
    profitVelocity30: parseNumber(row.abcProfitVelocity30),
    weightedContributionMargin: parseNumber(row.abcWeightedContributionMargin),
    lossRecurrence: parseNumber(row.abcLossRecurrence),
    paidOrderCount: row.abcPaidOrderCount ?? 0,
    observationDays: row.abcObservationDays ?? 0,
    firstValidPaidSaleAt: row.abcFirstValidPaidSaleAt,
    formula: formula?.success ? formula.data : null,
    sourceFreshness: {
      evaluationCutoffDate: calendarDate(cutoff),
      sellpia: {
        status: row.abcSellpiaSourceStatus,
        coverageStartDate: row.abcSellpiaCoverageStartDate ?? row.abcSourceCoverageStartDate
          ? calendarDate((row.abcSellpiaCoverageStartDate ?? row.abcSourceCoverageStartDate)!)
          : null,
        coverageEndDate: row.abcSellpiaCoverageEndDate ?? row.abcSourceCoverageEndDate
          ? calendarDate((row.abcSellpiaCoverageEndDate ?? row.abcSourceCoverageEndDate)!)
          : null,
        capturedAt: row.abcSellpiaSourceCapturedAt,
      },
      advertising: {
        status: row.abcAdvertisingSourceStatus,
        coverageStartDate: row.abcAdvertisingCoverageStartDate
          ? calendarDate(row.abcAdvertisingCoverageStartDate)
          : null,
        coverageEndDate: row.abcAdvertisingCoverageEndDate
          ? calendarDate(row.abcAdvertisingCoverageEndDate)
          : null,
        capturedAt: row.abcAdvertisingSourceCapturedAt,
      },
      orders: {
        status: row.abcOrdersSourceStatus,
        coverageStartDate: row.abcOrdersCoverageStartDate
          ? calendarDate(row.abcOrdersCoverageStartDate)
          : null,
        coverageEndDate: row.abcOrdersCoverageEndDate
          ? calendarDate(row.abcOrdersCoverageEndDate)
          : null,
        capturedAt: row.abcOrdersSourceCapturedAt,
      },
      mapping: {
        status: row.abcMappingSourceStatus,
        inventoryGeneration: row.abcMappingInventoryGeneration === null
          ? null
          : String(row.abcMappingInventoryGeneration),
        verifiedAt: row.abcMappingVerifiedAt,
      },
    },
    costBreakdown: row.abcCostComponents,
    statusDetail: row.abcStatusDetail,
    calculatedAt: row.abcCalculatedAt,
  });
  return evaluation.success ? evaluation.data : null;
}

function calendarDate(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}
