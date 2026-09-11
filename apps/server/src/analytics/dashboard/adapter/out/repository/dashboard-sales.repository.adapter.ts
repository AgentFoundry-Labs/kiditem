import { Inject, Injectable } from '@nestjs/common';
import { ProductAbcEvaluationSchema } from '@kiditem/shared/product-abc';
import { PrismaService } from '../../../../../prisma/prisma.service';
import {
  buildPerListingProfit,
  readAccountAdEvidence,
  type PerListingProfit,
} from '../../../../../common/per-listing-profit';
import {
  AD_ACCOUNT_DAILY_KPI_READ_PORT,
  type AdAccountDailyKpiReadPort,
} from '../../../../../advertising/application/port/in/ad-account-daily-kpi-source.port';
import type { TopProduct } from '@kiditem/shared/dashboard';
import type {
  DashboardSalesRepositoryPort,
  TodayKpiRow,
} from '../../../application/port/out/repository/dashboard-sales.repository.port';

interface TopProductRawRow {
  id: string;
  /**
   * The listing the row settles against, separate from `id` because `id` also
   * has to name rows that have no listing. Null is how a Rocket line says so.
   */
  listingId: string | null;
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
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AD_ACCOUNT_DAILY_KPI_READ_PORT)
    private readonly adAccountDailyKpiRead: AdAccountDailyKpiReadPort,
  ) {}

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
   * Revenue comes from this SQL, which is the only read that can see a Rocket
   * line. Profit comes from `buildPerListingProfit` — the same helper
   * `/api/profit-loss` uses, for the same window — so the two screens cannot
   * disagree about one listing's margin. A row the helper has no answer for
   * publishes no profit (ADR-0004, which withdrew this ranking's exemption).
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
        COALESCE(cl.id::text, 'line-sku:' || oli.sku) AS id,
        cl.id::text AS "listingId",
        COALESCE(mp.name, cl.display_name, cl.channel_name, cl.external_id, oli.product_name) AS name,
        COALESCE(cl.channel_name, ca.name, ca.channel) AS organization,
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
      -- Rocket purchase orders are channel revenue too, and their lines never
      -- carry a listing option: the Coupang direct importer resolves product
      -- identity through Supply's confirmation, not through a listing. An
      -- inner join here hid that revenue entirely — a July of 18,945,520원
      -- rendered as "no product revenue". The line's own product identity
      -- stands in when no listing resolves; the grade and the evidence stay
      -- absent rather than being guessed at.
      LEFT JOIN channel_listing_options clo
        ON clo.id = oli.listing_option_id
        AND clo.organization_id = ${organizationId}::uuid
      LEFT JOIN channel_listings cl
        ON cl.id = clo.listing_id
        AND cl.organization_id = ${organizationId}::uuid
      LEFT JOIN channel_accounts ca
        ON ca.id = o.channel_account_id
        AND ca.organization_id = ${organizationId}::uuid
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
        AND o.ordered_at >= ${monthStart}
        AND o.ordered_at < ${monthEnd}
        AND o.status NOT IN ('cancelled', 'returned', 'refunded')
      GROUP BY COALESCE(cl.id::text, 'line-sku:' || oli.sku),
               cl.id, cl.display_name, cl.channel_name, cl.external_id,
               ca.name, ca.channel, oli.product_name, mp.name, abce.id, abcf.id
      ORDER BY revenue DESC
      LIMIT 10
    `;

    // The ranking used to publish `revenue * 0.3` here. A flat margin reads on
    // screen exactly like a settled figure, and the Rocket rows above — which
    // have no settlement inputs at all — made that indistinguishable from a
    // measurement. The precise math was already extracted to be shared, so ask
    // it for the same window instead of assuming, and leave the answer absent
    // where it has none.
    const rankedListingIds = new Set(
      rows.map((r) => r.listingId).filter((id): id is string => Boolean(id)),
    );
    // Nothing in the ranking settles against a listing — an empty month, or a
    // month of Rocket lines only — so the per-listing read has no consumer and
    // is not worth its four queries.
    const profitByListing = rankedListingIds.size === 0
      ? new Map<string, PerListingProfit>()
      : await this.readProfitByRankedListing(organizationId, monthStart, monthEnd);

    return rows.map((r) => {
      const revenue = Number(r.revenue ?? 0);
      // A row with no listing has nothing to look up, and a listing the helper
      // withheld (incomplete ad coverage, per ADR-0003) answers `null` itself.
      const measured = r.listingId ? profitByListing.get(r.listingId) ?? null : null;
      const parsedEvaluation = ProductAbcEvaluationSchema.safeParse(r.abcEvaluation);
      const abcEvaluation = parsedEvaluation.success ? parsedEvaluation.data : null;
      return {
        id: r.id,
        name: r.name,
        organization: r.organization ?? '미지정',
        grade: abcEvaluation?.abcGrade ?? null,
        abcEvaluation,
        revenue,
        netProfit: measured?.netProfit ?? null,
        profitRate: measured?.profitRate ?? null,
      } satisfies TopProduct;
    });
  }

  /**
   * One listing's profit, as the shared helper answers it for this window.
   * Separate so the ranking reads as a ranking: the helper needs Advertising's
   * account-level evidence for the same window first, because its absence is
   * what made "runs no ads" and "ad collection failed" the same zero.
   */
  private async readProfitByRankedListing(
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<Map<string, PerListingProfit>> {
    const adEvidence = await readAccountAdEvidence(
      this.adAccountDailyKpiRead,
      organizationId,
      from,
      to,
    );
    const rows = await buildPerListingProfit(
      this.prisma,
      organizationId,
      from,
      to,
      adEvidence,
    );
    return new Map(rows.map((row) => [row.listingId, row]));
  }

  /**
   * Per-day revenue for the calendar month, KST-bucketed.
   * `SUM(oli.total_price)` per `o.ordered_at AT TIME ZONE 'Asia/Seoul'::date`.
   */
}
