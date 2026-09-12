import {
  BadRequestException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH } from '@kiditem/shared/product-abc';
import type { ProductAbcContributionMetricStatus } from '@kiditem/shared/product-abc';
import type {
  MasterProductContributionRepositoryPort,
  MasterProductContributionRepositoryReadInput,
} from '../../../application/port/out/repository/master-product-contribution.repository.port';
import type { MasterProductContributionAnalytics } from '../../../application/port/in/master-product-contribution-read.port';

type RawContributionRow = Readonly<{
  masterProductId: string | null;
  basisFromDate: Date | string;
  basisCutoffDate: Date | string;
  sourceCutoffDate: Date | string | null;
  sellpiaSourceImportRunId: string | null;
  advertisingSourceImportRunId: string | null;
  revenueTotal: unknown;
  positiveOperatingProfitTotal: unknown;
  lossMagnitudeTotal: unknown;
  netOperatingProfitTotal: unknown;
  salesMetricStatus: string;
  salesIncludedProductCount: unknown;
  salesExcludedProductCount: unknown;
  salesDenominator: unknown;
  positiveProfitMetricStatus: string;
  profitIncludedProductCount: unknown;
  profitExcludedProductCount: unknown;
  positiveProfitDenominator: unknown;
  lossMetricStatus: string;
  lossIncludedProductCount: unknown;
  lossExcludedProductCount: unknown;
  lossDenominator: unknown;
  revenue: unknown;
  operatingProfit: unknown;
  salesContribution: unknown;
  positiveOperatingProfitContribution: unknown;
  lossImpact: unknown;
  salesRank: unknown;
  positiveOperatingProfitRank: unknown;
  lossRank: unknown;
  cumulativeSalesContribution: unknown;
  cumulativePositiveOperatingProfitContribution: unknown;
  cumulativeLossImpact: unknown;
  salesComplete: boolean | null;
  operatingProfitComplete: boolean | null;
}>;

const CALENDAR_DATE = /^\d{4}-(0[1-9]|1[0-2])-([012]\d|3[01])$/;

@Injectable()
export class MasterProductContributionRepositoryAdapter
  implements MasterProductContributionRepositoryPort
{
  constructor(private readonly prisma: PrismaService) {}

  async readContribution(
    input: MasterProductContributionRepositoryReadInput,
  ): Promise<MasterProductContributionAnalytics> {
    assertBasis(input.basisFromDate, input.basisCutoffDate);
    const productFilter = finalProductFilter(input.masterProductIds);
    const rows = await this.prisma.$queryRaw<RawContributionRow[]>(Prisma.sql`
      WITH params AS (
        SELECT
          ${input.organizationId}::uuid AS organization_id,
          ${input.sellpiaSourceImportRunId}::uuid AS sellpia_source_import_run_id,
          ${input.advertisingSourceImportRunId}::uuid AS advertising_source_import_run_id,
          ${input.basisFromDate}::date AS basis_from_date,
          ${input.basisCutoffDate}::date AS basis_cutoff_date
      ),
      source_candidates AS (
        SELECT
          p.*,
          sellpia.id AS sellpia_id,
          sellpia.status AS sellpia_attempt_status,
          sellpia.publication_sequence AS sellpia_publication_sequence,
          sellpia.mapping_generation AS sellpia_mapping_generation,
          sellpia.coverage_start_date AS sellpia_coverage_start_date,
          sellpia.coverage_end_date AS sellpia_coverage_end_date,
          sellpia.covered_months AS sellpia_covered_months,
          advertising.id AS advertising_id,
          advertising.status AS advertising_attempt_status,
          advertising.publication_sequence AS advertising_publication_sequence,
          advertising.mapping_generation AS advertising_mapping_generation,
          advertising.coverage_start_date AS advertising_coverage_start_date,
          advertising.coverage_end_date AS advertising_coverage_end_date,
          advertising.covered_months AS advertising_covered_months,
          advertising.ad_source_policy_hash AS advertising_source_policy_hash
        FROM params p
        LEFT JOIN source_import_runs sellpia
          ON sellpia.id = p.sellpia_source_import_run_id
         AND sellpia.organization_id = p.organization_id
         AND sellpia.source_type = 'sellpia_product_profitability'
        LEFT JOIN source_import_runs advertising
          ON advertising.id = p.advertising_source_import_run_id
         AND advertising.organization_id = p.organization_id
         AND advertising.source_type = 'coupang_ad_profitability'
      ),
      validated_manifests AS (
        SELECT
          candidates.*,
          COALESCE(
            candidates.sellpia_attempt_status = 'completed'
            AND candidates.sellpia_publication_sequence IS NOT NULL
            AND candidates.sellpia_mapping_generation IS NOT NULL
            AND candidates.sellpia_coverage_start_date <= candidates.basis_from_date
            AND candidates.sellpia_coverage_end_date >= candidates.basis_cutoff_date
            AND NOT EXISTS (
              SELECT 1
              FROM generate_series(
                date_trunc('month', candidates.basis_from_date)::date,
                date_trunc('month', candidates.basis_cutoff_date)::date,
                interval '1 month'
              ) AS required_month(month_start)
              WHERE NOT (
                to_char(required_month.month_start, 'YYYY-MM')
                = ANY(candidates.sellpia_covered_months)
              )
            ),
            FALSE
          ) AS sellpia_ready,
          COALESCE(
            candidates.advertising_attempt_status = 'completed'
            AND candidates.advertising_publication_sequence IS NOT NULL
            AND candidates.advertising_mapping_generation IS NOT NULL
            AND candidates.advertising_source_policy_hash
              = ${PRODUCT_ABC_ABSOLUTE_V1_AD_SOURCE_POLICY_HASH}
            AND candidates.advertising_coverage_start_date <= candidates.basis_from_date
            AND candidates.advertising_coverage_end_date >= candidates.basis_cutoff_date
            AND NOT EXISTS (
              SELECT 1
              FROM generate_series(
                date_trunc('month', candidates.basis_from_date)::date,
                date_trunc('month', candidates.basis_cutoff_date)::date,
                interval '1 month'
              ) AS required_month(month_start)
              WHERE NOT (
                to_char(required_month.month_start, 'YYYY-MM')
                = ANY(candidates.advertising_covered_months)
              )
            ),
            FALSE
          ) AS advertising_ready
        FROM source_candidates candidates
      ),
      source_status AS (
        SELECT
          manifests.*,
          manifests.sellpia_ready
            AND manifests.advertising_ready
            AND manifests.sellpia_mapping_generation = manifests.advertising_mapping_generation
            AS mapping_ready,
          CASE
            WHEN manifests.sellpia_id IS NULL AND manifests.advertising_id IS NULL THEN NULL
            ELSE LEAST(
              manifests.basis_cutoff_date,
              manifests.sellpia_coverage_end_date,
              manifests.advertising_coverage_end_date
            )
          END AS source_cutoff_date
        FROM validated_manifests manifests
      ),
      sellpia_amounts AS (
        SELECT
          facts.master_product_id,
          SUM(facts.order_amount)::numeric AS revenue,
          SUM(facts.in_amount)::numeric AS order_time_supply_cost,
          BOOL_AND(
            facts.coverage_start_date IS NOT NULL
            AND facts.coverage_end_date IS NOT NULL
            AND facts.coverage_start_date <= facts.coverage_end_date
            AND facts.coverage_start_date >= status.basis_from_date
            AND facts.coverage_end_date <= status.basis_cutoff_date
            AND facts.order_amount >= 0
          ) AS fact_ready,
          BOOL_AND(
            facts.cost_basis = 'ORDER_TIME_SUPPLY_COST'
            AND facts.vat_included IS TRUE
            AND facts.in_amount >= 0
          ) AS cost_ready
        FROM source_status status
        JOIN sellpia_product_monthly_sales facts
          ON status.sellpia_ready
         AND facts.source_import_run_id = status.sellpia_id
         AND facts.organization_id = status.organization_id
        JOIN master_products products
          ON products.id = facts.master_product_id
         AND products.organization_id = facts.organization_id
        WHERE facts.year_month BETWEEN to_char(status.basis_from_date, 'YYYY-MM')
                                   AND to_char(status.basis_cutoff_date, 'YYYY-MM')
          AND facts.coverage_start_date <= status.basis_cutoff_date
          AND facts.coverage_end_date >= status.basis_from_date
        GROUP BY facts.master_product_id
      ),
      advertising_amounts AS (
        SELECT
          facts.master_product_id,
          SUM(facts.allocated_spend)::numeric AS advertising_spend,
          BOOL_AND(
            facts.allocated_spend >= 0
            AND facts.observed_target_day_count > 0
            AND facts.mapping_generation = status.advertising_mapping_generation
            AND facts.covered_start_date <= facts.covered_end_date
            AND facts.covered_start_date >= status.basis_from_date
            AND facts.covered_end_date <= status.basis_cutoff_date
          ) AS fact_ready
        FROM source_status status
        JOIN channel_ad_listing_product_monthly_facts facts
          ON status.advertising_ready
         AND facts.source_import_run_id = status.advertising_id
         AND facts.organization_id = status.organization_id
        JOIN master_products products
          ON products.id = facts.master_product_id
         AND products.organization_id = facts.organization_id
        WHERE facts.month BETWEEN date_trunc('month', status.basis_from_date)::date
                              AND status.basis_cutoff_date
          AND facts.covered_start_date <= status.basis_cutoff_date
          AND facts.covered_end_date >= status.basis_from_date
        GROUP BY facts.master_product_id
      ),
      product_population AS (
        SELECT master_product_id FROM sellpia_amounts
        UNION
        SELECT master_product_id FROM advertising_amounts
      ),
      product_amounts AS (
        SELECT
          population.master_product_id,
          status.sellpia_ready
            AND COALESCE(sellpia.fact_ready, TRUE) AS sales_complete,
          status.mapping_ready
            AND COALESCE(sellpia.fact_ready, TRUE)
            AND COALESCE(sellpia.cost_ready, TRUE)
            AND COALESCE(advertising.fact_ready, TRUE) AS operating_profit_complete,
          CASE
            WHEN status.sellpia_ready AND COALESCE(sellpia.fact_ready, TRUE)
              THEN COALESCE(sellpia.revenue, 0)
            ELSE NULL
          END AS revenue,
          CASE
            WHEN status.mapping_ready
             AND COALESCE(sellpia.fact_ready, TRUE)
             AND COALESCE(sellpia.cost_ready, TRUE)
             AND COALESCE(advertising.fact_ready, TRUE)
              THEN COALESCE(sellpia.revenue, 0)
                 - COALESCE(sellpia.order_time_supply_cost, 0)
                 - COALESCE(advertising.advertising_spend, 0)
            ELSE NULL
          END AS operating_profit
        FROM product_population population
        CROSS JOIN source_status status
        LEFT JOIN sellpia_amounts sellpia USING (master_product_id)
        LEFT JOIN advertising_amounts advertising USING (master_product_id)
      ),
      product_metrics AS (
        SELECT
          amounts.*,
          CASE
            WHEN amounts.operating_profit_complete
              THEN GREATEST(amounts.operating_profit, 0)
            ELSE NULL
          END AS positive_operating_profit,
          CASE
            WHEN amounts.operating_profit_complete
              THEN ABS(LEAST(amounts.operating_profit, 0))
            ELSE NULL
          END AS loss_magnitude
        FROM product_amounts amounts
      ),
      metric_aggregates AS (
        SELECT
          COUNT(*) FILTER (WHERE metrics.sales_complete)::integer AS sales_included_count,
          COUNT(*) FILTER (WHERE NOT COALESCE(metrics.sales_complete, FALSE))::integer
            AS sales_excluded_count,
          COUNT(*) FILTER (WHERE metrics.operating_profit_complete)::integer
            AS profit_included_count,
          COUNT(*) FILTER (WHERE NOT COALESCE(metrics.operating_profit_complete, FALSE))::integer
            AS profit_excluded_count,
          SUM(metrics.revenue) FILTER (WHERE metrics.sales_complete) AS revenue_total,
          SUM(metrics.positive_operating_profit)
            FILTER (WHERE metrics.operating_profit_complete) AS positive_profit_total,
          SUM(metrics.loss_magnitude)
            FILTER (WHERE metrics.operating_profit_complete) AS loss_total,
          SUM(metrics.operating_profit)
            FILTER (WHERE metrics.operating_profit_complete) AS net_profit_total
        FROM product_metrics metrics
      ),
      metric_summary AS (
        SELECT
          status.*,
          aggregates.sales_included_count,
          aggregates.sales_excluded_count,
          aggregates.profit_included_count,
          aggregates.profit_excluded_count,
          aggregates.revenue_total,
          aggregates.positive_profit_total,
          aggregates.loss_total,
          aggregates.net_profit_total,
          CASE
            WHEN NOT status.sellpia_ready OR aggregates.sales_excluded_count > 0
              THEN 'SOURCE_INCOMPLETE'
            WHEN COALESCE(aggregates.revenue_total, 0) > 0 THEN 'READY'
            ELSE 'NO_DENOMINATOR'
          END AS sales_metric_status,
          CASE
            WHEN aggregates.revenue_total > 0 THEN aggregates.revenue_total
            ELSE NULL
          END AS sales_denominator,
          CASE
            WHEN NOT status.mapping_ready OR aggregates.profit_excluded_count > 0
              THEN 'SOURCE_INCOMPLETE'
            WHEN COALESCE(aggregates.positive_profit_total, 0) > 0 THEN 'READY'
            ELSE 'NO_DENOMINATOR'
          END AS positive_profit_metric_status,
          CASE
            WHEN aggregates.positive_profit_total > 0 THEN aggregates.positive_profit_total
            ELSE NULL
          END AS positive_profit_denominator,
          CASE
            WHEN NOT status.mapping_ready OR aggregates.profit_excluded_count > 0
              THEN 'SOURCE_INCOMPLETE'
            WHEN COALESCE(aggregates.loss_total, 0) > 0 THEN 'READY'
            ELSE 'NO_DENOMINATOR'
          END AS loss_metric_status,
          CASE
            WHEN aggregates.loss_total > 0 THEN aggregates.loss_total
            ELSE NULL
          END AS loss_denominator
        FROM source_status status
        CROSS JOIN metric_aggregates aggregates
      ),
      sales_windows AS (
        SELECT
          metrics.master_product_id,
          DENSE_RANK() OVER (ORDER BY metrics.revenue DESC)::integer AS sales_rank,
          SUM(metrics.revenue) OVER (
            ORDER BY metrics.revenue DESC
            RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS cumulative_revenue
        FROM product_metrics metrics
        WHERE metrics.sales_complete
      ),
      profit_windows AS (
        SELECT
          metrics.master_product_id,
          DENSE_RANK() OVER (
            ORDER BY metrics.positive_operating_profit DESC
          )::integer AS positive_operating_profit_rank,
          SUM(metrics.positive_operating_profit) OVER (
            ORDER BY metrics.positive_operating_profit DESC
            RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS cumulative_positive_operating_profit
        FROM product_metrics metrics
        WHERE metrics.operating_profit_complete
          AND metrics.positive_operating_profit > 0
      ),
      loss_windows AS (
        SELECT
          metrics.master_product_id,
          DENSE_RANK() OVER (ORDER BY metrics.loss_magnitude DESC)::integer AS loss_rank,
          SUM(metrics.loss_magnitude) OVER (
            ORDER BY metrics.loss_magnitude DESC
            RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) AS cumulative_loss_magnitude
        FROM product_metrics metrics
        WHERE metrics.operating_profit_complete
          AND metrics.loss_magnitude > 0
      ),
      ranked_products AS (
        SELECT
          metrics.*,
          CASE
            WHEN summary.sales_denominator IS NOT NULL
              THEN (metrics.revenue / summary.sales_denominator)::double precision
            ELSE NULL
          END AS sales_contribution,
          CASE
            WHEN summary.sales_denominator IS NOT NULL
              THEN (sales.cumulative_revenue / summary.sales_denominator)::double precision
            ELSE NULL
          END AS cumulative_sales_contribution,
          CASE
            WHEN summary.positive_profit_denominator IS NOT NULL
              THEN (metrics.positive_operating_profit
                    / summary.positive_profit_denominator)::double precision
            ELSE NULL
          END AS positive_operating_profit_contribution,
          CASE
            WHEN summary.positive_profit_denominator IS NOT NULL
              THEN (profit.cumulative_positive_operating_profit
                    / summary.positive_profit_denominator)::double precision
            ELSE NULL
          END AS cumulative_positive_operating_profit_contribution,
          CASE
            WHEN summary.loss_denominator IS NOT NULL
              THEN (metrics.loss_magnitude / summary.loss_denominator)::double precision
            ELSE NULL
          END AS loss_impact,
          CASE
            WHEN summary.loss_denominator IS NOT NULL
              THEN (loss.cumulative_loss_magnitude
                    / summary.loss_denominator)::double precision
            ELSE NULL
          END AS cumulative_loss_impact,
          CASE WHEN summary.sales_denominator IS NOT NULL THEN sales.sales_rank ELSE NULL END
            AS sales_rank,
          CASE
            WHEN summary.positive_profit_denominator IS NOT NULL
              THEN profit.positive_operating_profit_rank
            ELSE NULL
          END AS positive_operating_profit_rank,
          CASE WHEN summary.loss_denominator IS NOT NULL THEN loss.loss_rank ELSE NULL END
            AS loss_rank
        FROM product_metrics metrics
        CROSS JOIN metric_summary summary
        LEFT JOIN sales_windows sales USING (master_product_id)
        LEFT JOIN profit_windows profit USING (master_product_id)
        LEFT JOIN loss_windows loss USING (master_product_id)
      ),
      filtered_products AS (
        SELECT *
        FROM ranked_products
        ${productFilter}
      )
      SELECT
        products.master_product_id AS "masterProductId",
        summary.basis_from_date AS "basisFromDate",
        summary.basis_cutoff_date AS "basisCutoffDate",
        summary.source_cutoff_date AS "sourceCutoffDate",
        summary.sellpia_id AS "sellpiaSourceImportRunId",
        summary.advertising_id AS "advertisingSourceImportRunId",
        CASE
          WHEN summary.sellpia_ready THEN COALESCE(summary.revenue_total, 0)::text
          ELSE NULL
        END AS "revenueTotal",
        CASE
          WHEN summary.mapping_ready THEN COALESCE(summary.positive_profit_total, 0)::text
          ELSE NULL
        END AS "positiveOperatingProfitTotal",
        CASE
          WHEN summary.mapping_ready THEN COALESCE(summary.loss_total, 0)::text
          ELSE NULL
        END AS "lossMagnitudeTotal",
        CASE
          WHEN summary.mapping_ready THEN COALESCE(summary.net_profit_total, 0)::text
          ELSE NULL
        END AS "netOperatingProfitTotal",
        summary.sales_metric_status AS "salesMetricStatus",
        summary.sales_included_count AS "salesIncludedProductCount",
        summary.sales_excluded_count AS "salesExcludedProductCount",
        summary.sales_denominator::text AS "salesDenominator",
        summary.positive_profit_metric_status AS "positiveProfitMetricStatus",
        summary.profit_included_count AS "profitIncludedProductCount",
        summary.profit_excluded_count AS "profitExcludedProductCount",
        summary.positive_profit_denominator::text AS "positiveProfitDenominator",
        summary.loss_metric_status AS "lossMetricStatus",
        summary.profit_included_count AS "lossIncludedProductCount",
        summary.profit_excluded_count AS "lossExcludedProductCount",
        summary.loss_denominator::text AS "lossDenominator",
        products.revenue::text AS revenue,
        products.operating_profit::text AS "operatingProfit",
        products.sales_contribution AS "salesContribution",
        products.positive_operating_profit_contribution
          AS "positiveOperatingProfitContribution",
        products.loss_impact AS "lossImpact",
        products.sales_rank AS "salesRank",
        products.positive_operating_profit_rank AS "positiveOperatingProfitRank",
        products.loss_rank AS "lossRank",
        products.cumulative_sales_contribution AS "cumulativeSalesContribution",
        products.cumulative_positive_operating_profit_contribution
          AS "cumulativePositiveOperatingProfitContribution",
        products.cumulative_loss_impact AS "cumulativeLossImpact",
        products.sales_complete AS "salesComplete",
        products.operating_profit_complete AS "operatingProfitComplete"
      FROM metric_summary summary
      LEFT JOIN filtered_products products ON TRUE
      ORDER BY products.master_product_id ASC
    `);

    const summary = rows[0];
    if (!summary) {
      throw new UnprocessableEntityException('CONTRIBUTION_PROJECTION_MISSING');
    }

    return {
      basis: {
        fromDate: calendarDate(summary.basisFromDate),
        cutoffDate: calendarDate(summary.basisCutoffDate),
        sourceCutoffDate: nullableCalendarDate(summary.sourceCutoffDate),
        sellpiaSourceImportRunId: summary.sellpiaSourceImportRunId,
        advertisingSourceImportRunId: summary.advertisingSourceImportRunId,
      },
      totals: {
        revenue: money(summary.revenueTotal),
        positiveOperatingProfit: money(summary.positiveOperatingProfitTotal),
        lossMagnitude: money(summary.lossMagnitudeTotal),
        netOperatingProfit: money(summary.netOperatingProfitTotal),
      },
      metrics: {
        sales: {
          status: metricStatus(summary.salesMetricStatus),
          includedProductCount: nonNegativeInteger(summary.salesIncludedProductCount),
          excludedProductCount: nonNegativeInteger(summary.salesExcludedProductCount),
          denominator: money(summary.salesDenominator),
        },
        positiveOperatingProfit: {
          status: metricStatus(summary.positiveProfitMetricStatus),
          includedProductCount: nonNegativeInteger(summary.profitIncludedProductCount),
          excludedProductCount: nonNegativeInteger(summary.profitExcludedProductCount),
          denominator: money(summary.positiveProfitDenominator),
        },
        loss: {
          status: metricStatus(summary.lossMetricStatus),
          includedProductCount: nonNegativeInteger(summary.lossIncludedProductCount),
          excludedProductCount: nonNegativeInteger(summary.lossExcludedProductCount),
          denominator: money(summary.lossDenominator),
        },
      },
      products: rows.flatMap((row) => row.masterProductId === null ? [] : [{
        masterProductId: row.masterProductId,
        revenue: money(row.revenue),
        operatingProfit: money(row.operatingProfit),
        salesContribution: ratio(row.salesContribution),
        positiveOperatingProfitContribution: ratio(row.positiveOperatingProfitContribution),
        lossImpact: ratio(row.lossImpact),
        salesRank: nullablePositiveInteger(row.salesRank),
        positiveOperatingProfitRank: nullablePositiveInteger(row.positiveOperatingProfitRank),
        lossRank: nullablePositiveInteger(row.lossRank),
        cumulativeSalesContribution: ratio(row.cumulativeSalesContribution),
        cumulativePositiveOperatingProfitContribution:
          ratio(row.cumulativePositiveOperatingProfitContribution),
        cumulativeLossImpact: ratio(row.cumulativeLossImpact),
        metricCompleteness: {
          sales: row.salesComplete === true,
          operatingProfit: row.operatingProfitComplete === true,
        },
      }]),
    } satisfies MasterProductContributionAnalytics;
  }
}

function finalProductFilter(masterProductIds: readonly string[] | undefined): Prisma.Sql {
  if (masterProductIds === undefined) return Prisma.empty;
  if (masterProductIds.length === 0) return Prisma.sql`WHERE FALSE`;
  return Prisma.sql`WHERE ranked_products.master_product_id IN (
    ${Prisma.join(masterProductIds.map((id) => Prisma.sql`${id}::uuid`))}
  )`;
}

function assertBasis(fromDate: string, cutoffDate: string): void {
  if (!validCalendarDate(fromDate) || !validCalendarDate(cutoffDate) || fromDate > cutoffDate) {
    throw new BadRequestException('CONTRIBUTION_DATE_BASIS_INVALID');
  }
}

function validCalendarDate(value: string): boolean {
  if (!CALENDAR_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function calendarDate(value: Date | string): string {
  const normalized = value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
  if (!validCalendarDate(normalized)) {
    throw new UnprocessableEntityException('CONTRIBUTION_DATE_INVALID');
  }
  return normalized;
}

function nullableCalendarDate(value: Date | string | null): string | null {
  return value === null ? null : calendarDate(value);
}

function money(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'bigint' ? Number(value) : Number(String(value));
  if (!Number.isSafeInteger(parsed)) {
    throw new UnprocessableEntityException('CONTRIBUTION_AMOUNT_OUT_OF_RANGE');
  }
  return parsed;
}

function ratio(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(String(value));
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new UnprocessableEntityException('CONTRIBUTION_RATIO_INVALID');
  }
  return parsed;
}

function nonNegativeInteger(value: unknown): number {
  const parsed = Number(String(value));
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new UnprocessableEntityException('CONTRIBUTION_COUNT_INVALID');
  }
  return parsed;
}

function nullablePositiveInteger(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = nonNegativeInteger(value);
  if (parsed === 0) {
    throw new UnprocessableEntityException('CONTRIBUTION_RANK_INVALID');
  }
  return parsed;
}

function metricStatus(value: string): ProductAbcContributionMetricStatus {
  if (value === 'READY' || value === 'NO_DENOMINATOR' || value === 'SOURCE_INCOMPLETE') {
    return value;
  }
  throw new UnprocessableEntityException('CONTRIBUTION_METRIC_STATUS_INVALID');
}

