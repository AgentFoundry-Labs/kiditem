import {
  BadRequestException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { shiftBusinessDateKey } from '@kiditem/shared/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ownerTransaction } from '../../../../prisma/owner-transaction';
import { businessDateKey, parseBusinessDate } from '../../../../common/kst';
import {
  ADVERTISING_LEDGER_READ_PORT,
  type AdvertisingLedgerReadPort,
} from '../../../../advertising/application/port/in/capability/advertising-ledger-read.port';
import { profitAdCost } from '../../../../advertising/domain/ad-spend-rule';
import { readExactSellpiaProductMonthlyFacts } from '../../../../analytics/sellpia-product-sales/read/sellpia-product-monthly-facts';
import {
  PRODUCT_TRANSACTIONAL_READ_PORT,
} from '../../../../products/application/port/in/product-transactional-read.port';
import type { ProductTransactionalReadPort } from '../../../../products/application/port/in/product-transactional-read.port';
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
  sellpiaOperationId: string | null;
  revenueTotal: unknown;
  positiveOperatingProfitTotal: unknown;
  lossMagnitudeTotal: unknown;
  netOperatingProfitTotal: unknown;
  salesSourceComplete: boolean | null;
  salesIncludedProductCount: unknown;
  salesExcludedProductCount: unknown;
  salesDenominator: unknown;
  profitSourceComplete: boolean | null;
  profitIncludedProductCount: unknown;
  profitExcludedProductCount: unknown;
  positiveProfitDenominator: unknown;
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
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT)
    private readonly products: ProductTransactionalReadPort,
    @Inject(ADVERTISING_LEDGER_READ_PORT)
    private readonly adLedger: Pick<AdvertisingLedgerReadPort, 'advertisingApplies' | 'readAdCoverage' | 'readMonthlyAdAllocation'>,
  ) {}

  async readContribution(
    input: MasterProductContributionRepositoryReadInput,
  ): Promise<MasterProductContributionAnalytics> {
    assertBasis(input.basisFromDate, input.basisCutoffDate);
    const productFilter = finalProductFilter(input.masterProductIds);
    const rows = await this.prisma.$transaction(async (tx) => {
      const sellpia = input.sellpiaOperationId
        ? await readExactSellpiaProductMonthlyFacts(tx, {
            organizationId: input.organizationId,
            operationId: input.sellpiaOperationId,
            scope: { yearMonths: yearMonths(input.basisFromDate, input.basisCutoffDate) },
          })
        : { generation: null, facts: [] };
      const sellpiaFactsJson = JSON.stringify(sellpia.facts.map((fact) => ({
        master_product_id: fact.masterProductId,
        year_month: fact.yearMonth,
        order_amount: fact.orderAmount,
        in_amount: fact.inAmount,
        cost_basis: fact.costBasis,
        vat_included: fact.vatIncluded,
        coverage_start_date: fact.coverageStartDate?.toISOString().slice(0, 10) ?? null,
        coverage_end_date: fact.coverageEndDate?.toISOString().slice(0, 10) ?? null,
      })));
      const advertising = await readAdvertisingCosts(this.adLedger, tx, input);
      const advertisingAllocations = JSON.stringify(advertising.costs.map((fact) => ({
        master_product_id: fact.masterProductId,
        advertising_cost: fact.advertisingCost,
      })));
      const productIdentities = await this.products.readSourceIdentities(
        { client: tx },
        {
          organizationId: input.organizationId,
          selector: { kind: 'all' },
        },
      );
      const currentMasterProductIds = [
        ...new Set(productIdentities.map((product) => product.masterProductId)),
      ];
      const currentMasterProductIdsSql = currentMasterProductIds.length === 0
        ? Prisma.sql`ARRAY[]::uuid[]`
        : Prisma.sql`ARRAY[
          ${Prisma.join(currentMasterProductIds.map((id) => Prisma.sql`${id}::uuid`))}
        ]::uuid[]`;
      return tx.$queryRaw<RawContributionRow[]>(Prisma.sql`
      WITH params AS (
        SELECT
          ${input.organizationId}::uuid AS organization_id,
          ${input.basisFromDate}::date AS basis_from_date,
          ${input.basisCutoffDate}::date AS basis_cutoff_date,
          ${sellpia.generation?.id ?? null}::uuid AS sellpia_id,
          ${sellpia.generation?.mappingGeneration?.toString() ?? null}::bigint
            AS sellpia_mapping_generation,
          ${sellpia.generation?.coverageStartDate ?? null}::date AS sellpia_coverage_start_date,
          ${sellpia.generation?.coverageEndDate ?? null}::date AS sellpia_coverage_end_date,
          ${sellpia.generation?.coveredMonths ?? []}::text[] AS sellpia_covered_months,
          ${advertising.ready}::boolean AS advertising_ready,
          ${advertisingAllocations}::jsonb AS advertising_allocations,
          ${currentMasterProductIdsSql} AS current_master_product_ids
      ),
      validated_manifests AS (
        SELECT
          candidates.*,
          COALESCE(
            candidates.sellpia_id IS NOT NULL
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
          ) AS sellpia_ready
        FROM params candidates
      ),
      source_status AS (
        SELECT
          manifests.*,
          manifests.sellpia_ready AND manifests.advertising_ready AS mapping_ready,
          CASE
            WHEN manifests.sellpia_id IS NULL THEN NULL
            ELSE LEAST(manifests.basis_cutoff_date, manifests.sellpia_coverage_end_date)
          END AS source_cutoff_date
        FROM validated_manifests manifests
      ),
      sellpia_facts AS (
        SELECT *
        FROM jsonb_to_recordset(${sellpiaFactsJson}::jsonb) AS facts(
          master_product_id uuid,
          year_month text,
          order_amount integer,
          in_amount integer,
          cost_basis text,
          vat_included boolean,
          coverage_start_date date,
          coverage_end_date date
        )
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
        JOIN sellpia_facts facts
          ON status.sellpia_ready
        WHERE facts.year_month BETWEEN to_char(status.basis_from_date, 'YYYY-MM')
                                   AND to_char(status.basis_cutoff_date, 'YYYY-MM')
          AND facts.master_product_id = ANY(status.current_master_product_ids)
          AND facts.coverage_start_date <= status.basis_cutoff_date
          AND facts.coverage_end_date >= status.basis_from_date
        GROUP BY facts.master_product_id
      ),
      advertising_amounts AS (
        SELECT
          facts.master_product_id,
          facts.advertising_cost::numeric AS advertising_spend,
          TRUE AS fact_ready
        FROM source_status status
        JOIN LATERAL jsonb_to_recordset(status.advertising_allocations) AS facts(
          master_product_id uuid,
          advertising_cost bigint
        ) ON status.advertising_ready
        WHERE facts.master_product_id = ANY(status.current_master_product_ids)
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
            WHEN aggregates.revenue_total > 0 THEN aggregates.revenue_total
            ELSE NULL
          END AS sales_denominator,
          CASE
            WHEN aggregates.positive_profit_total > 0 THEN aggregates.positive_profit_total
            ELSE NULL
          END AS positive_profit_denominator,
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
        summary.sellpia_id AS "sellpiaOperationId",
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
        summary.sellpia_ready AS "salesSourceComplete",
        summary.sales_included_count AS "salesIncludedProductCount",
        summary.sales_excluded_count AS "salesExcludedProductCount",
        summary.sales_denominator::text AS "salesDenominator",
        summary.mapping_ready AS "profitSourceComplete",
        summary.profit_included_count AS "profitIncludedProductCount",
        summary.profit_excluded_count AS "profitExcludedProductCount",
        summary.positive_profit_denominator::text AS "positiveProfitDenominator",
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
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });

    const summary = rows[0];
    if (!summary) {
      throw new UnprocessableEntityException('CONTRIBUTION_PROJECTION_MISSING');
    }

    return {
      basis: {
        fromDate: calendarDate(summary.basisFromDate),
        cutoffDate: calendarDate(summary.basisCutoffDate),
        sourceCutoffDate: nullableCalendarDate(summary.sourceCutoffDate),
        sellpiaOperationId: summary.sellpiaOperationId,
      },
      totals: {
        revenue: contributionMoney(summary.revenueTotal),
        positiveOperatingProfit: contributionMoney(summary.positiveOperatingProfitTotal),
        lossMagnitude: contributionMoney(summary.lossMagnitudeTotal),
        netOperatingProfit: contributionMoney(summary.netOperatingProfitTotal),
      },
      metrics: {
        sales: {
          sourceComplete: summary.salesSourceComplete === true,
          includedProductCount: nonNegativeInteger(summary.salesIncludedProductCount),
          excludedProductCount: nonNegativeInteger(summary.salesExcludedProductCount),
          denominator: contributionMoney(summary.salesDenominator),
        },
        positiveOperatingProfit: {
          sourceComplete: summary.profitSourceComplete === true,
          includedProductCount: nonNegativeInteger(summary.profitIncludedProductCount),
          excludedProductCount: nonNegativeInteger(summary.profitExcludedProductCount),
          denominator: contributionMoney(summary.positiveProfitDenominator),
        },
        loss: {
          sourceComplete: summary.profitSourceComplete === true,
          includedProductCount: nonNegativeInteger(summary.lossIncludedProductCount),
          excludedProductCount: nonNegativeInteger(summary.lossExcludedProductCount),
          denominator: contributionMoney(summary.lossDenominator),
        },
      },
      products: rows.flatMap((row) => row.masterProductId === null ? [] : [{
        masterProductId: row.masterProductId,
        revenue: contributionMoney(row.revenue),
        operatingProfit: contributionMoney(row.operatingProfit),
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

/**
 * Advertising's side of operating profit (KID-372): with no active Coupang
 * account it is Not applied (ready, no cost); otherwise every day of the basis
 * must be a measured ad-report day, and each source product's cost is its
 * monthly allocation of billed spend over those days, VAT included and rounded
 * once per product (`profitAdCost`). The account adjustment belongs to no
 * product and stays out of contribution.
 */
async function readAdvertisingCosts(
  adLedger: Pick<AdvertisingLedgerReadPort, 'advertisingApplies' | 'readAdCoverage' | 'readMonthlyAdAllocation'>,
  tx: Prisma.TransactionClient,
  input: MasterProductContributionRepositoryReadInput,
): Promise<{ ready: boolean; costs: Array<{ masterProductId: string; advertisingCost: number }> }> {
  const transaction = ownerTransaction(tx);
  if (!(await adLedger.advertisingApplies(transaction, input.organizationId))) {
    return { ready: true, costs: [] };
  }
  const to = shiftBusinessDateKey(input.basisCutoffDate, 1);
  const coverage = await adLedger.readAdCoverage(transaction, {
    organizationId: input.organizationId,
    from: input.basisFromDate,
    to,
  });
  const basisDays = daysBetween(input.basisFromDate, input.basisCutoffDate);
  if (coverage.measuredDates.length !== basisDays) return { ready: false, costs: [] };
  const allocations = await adLedger.readMonthlyAdAllocation(transaction, {
    organizationId: input.organizationId,
    months: yearMonths(input.basisFromDate, input.basisCutoffDate),
    from: input.basisFromDate,
    to,
  });
  const billedByProduct = new Map<string, number>();
  for (const allocation of allocations) {
    billedByProduct.set(
      allocation.masterProductId,
      (billedByProduct.get(allocation.masterProductId) ?? 0) + allocation.allocatedBilledSpend,
    );
  }
  return {
    ready: true,
    costs: [...billedByProduct].map(([masterProductId, billedSpend]) => ({
      masterProductId,
      advertisingCost: profitAdCost({ billedSpend }),
    })),
  };
}

/** Calendar days of an inclusive `[from, to]` basis. */
function daysBetween(fromDate: string, cutoffDate: string): number {
  let days = 0;
  for (let day = fromDate; day <= cutoffDate; day = shiftBusinessDateKey(day, 1)) days += 1;
  return days;
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

function yearMonths(fromDate: string, cutoffDate: string): string[] {
  const values: string[] = [];
  const from = new Date(`${fromDate.slice(0, 7)}-01T00:00:00.000Z`);
  const to = new Date(`${cutoffDate.slice(0, 7)}-01T00:00:00.000Z`);
  for (let cursor = from; cursor <= to; cursor = new Date(Date.UTC(
    cursor.getUTCFullYear(),
    cursor.getUTCMonth() + 1,
    1,
  ))) {
    values.push(cursor.toISOString().slice(0, 7));
  }
  return values;
}

function validCalendarDate(value: string): boolean {
  return CALENDAR_DATE.test(value) && parseBusinessDate(value) !== null;
}

function calendarDate(value: Date | string): string {
  const normalized = value instanceof Date ? businessDateKey(value) : value.slice(0, 10);
  if (!validCalendarDate(normalized)) {
    throw new UnprocessableEntityException('CONTRIBUTION_DATE_INVALID');
  }
  return normalized;
}

function nullableCalendarDate(value: Date | string | null): string | null {
  return value === null ? null : calendarDate(value);
}

export function contributionMoney(value: unknown): number | null {
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
