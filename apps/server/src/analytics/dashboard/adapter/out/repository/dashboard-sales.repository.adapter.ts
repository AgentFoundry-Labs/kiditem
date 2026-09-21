import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../../prisma/prisma.service";
import {
  ORDER_FACT_EXCLUDED_STATUSES,
  readOrderLineWindowFacts,
} from "../../../../../orders/read/order-facts.reader";
import { readProductAbcPublication } from "../../../../../products/adapter/out/persistence/read/product-abc-publication.reader";
import {
  PRODUCT_TRANSACTIONAL_READ_PORT,
  type ProductTransactionalReadPort,
} from "../../../../../products/application/port/in/product-transactional-read.port";
import {
  buildPerListingProfit,
  readAdEvidenceFromLedger,
  type PerListingProfit,
} from "../../../../../common/per-listing-profit";
import type { TopProduct } from "@kiditem/shared/dashboard";
import type {
  DashboardSalesRepositoryPort,
  TodayKpiRow,
} from "../../../application/port/out/repository/dashboard-sales.repository.port";

interface TopProductRawRow {
  id: string;
  /**
   * The listing the row settles against, separate from `id` because `id` also
   * has to name rows that have no listing. Null is how a Rocket line says so.
   */
  listingId: string | null;
  masterProductId: string | null;
  name: string;
  organization: string | null;
  revenue: number;
  quantity: number;
}

/**
 * Sales projection over Orders' canonical line-fact reader. Listing, account,
 * and product lookups below are identity/configuration joins only; revenue and
 * quantity always come from the owner reader.
 */
@Injectable()
export class DashboardSalesRepositoryAdapter implements DashboardSalesRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT)
    private readonly inventoryTransactionalRead: ProductTransactionalReadPort,
  ) {}

  /**
   * KST today KPI with the owner's completeness verdict intact.
   */
  async fetchTodayKpis(
    organizationId: string,
    todayStart: Date,
    todayEnd: Date,
  ): Promise<TodayKpiRow> {
    const facts = await this.prisma.$transaction(
      (tx) =>
        readOrderLineWindowFacts(tx, {
          organizationId,
          from: todayStart,
          to: todayEnd,
          excludedStatuses: ORDER_FACT_EXCLUDED_STATUSES,
        }),
      { isolationLevel: "RepeatableRead" },
    );
    return {
      revenue: facts.window.revenue,
      orders: facts.window.orderCount,
      requestedDates: facts.window.requestedDates,
      includedDates: facts.window.includedDates,
      missingDates: facts.window.missingDates,
      observedAt: facts.window.observedAt,
    };
  }

  /**
   * Top-N (10) listing revenue ranking for the calendar month. Revenue is
   * grouped by ChannelListing so a bundle line is counted once regardless of
   * how many Sellpia components its option consumes. Product labels and grade
   * come from the listing's direct operational-product link.
   *
   * Revenue comes from the canonical Orders reader, which is the only read that can see a Rocket
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
    return this.prisma.$transaction(
      (tx) => this.fetchTopProductsSnapshot(tx, organizationId, monthStart, monthEnd),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async fetchTopProductsSnapshot(
    tx: Prisma.TransactionClient,
    organizationId: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<TopProduct[]> {
    const facts = await readOrderLineWindowFacts(tx, {
      organizationId,
      from: monthStart,
      to: monthEnd,
      excludedStatuses: ORDER_FACT_EXCLUDED_STATUSES,
    });
    if (facts.window.revenue === null) return [];

    const lines = facts.orders.flatMap((order) => order.lines);
    const optionIds = [
      ...new Set(
        lines.flatMap((line) =>
          line.listingOptionId ? [line.listingOptionId] : [],
        ),
      ),
    ];
    const accountIds = [
      ...new Set(facts.orders.map((order) => order.channelAccountId)),
    ];
    const options = await tx.channelListingOption.findMany({
        where: { organizationId, id: { in: optionIds } },
        select: {
          id: true,
          listing: {
            select: {
              id: true,
              externalId: true,
              channelName: true,
              displayName: true,
              masterProductId: true,
            },
          },
        },
      });
    const accounts = await tx.channelAccount.findMany({
        where: { organizationId, id: { in: accountIds } },
        select: { id: true, name: true, channel: true },
      });
    const optionById = new Map(options.map((option) => [option.id, option]));
    const accountById = new Map(
      accounts.map((account) => [account.id, account]),
    );
    const masterProductIds = [...new Set(options.flatMap((option) =>
      option.listing.masterProductId ? [option.listing.masterProductId] : []))];
    const masterProducts = await this.inventoryTransactionalRead.readSourceIdentities(
      { client: tx },
      { organizationId, selector: { kind: 'ids', values: masterProductIds } },
    );
    const masterProductById = new Map(masterProducts.map((product) => [
      product.masterProductId,
      product,
    ]));
    const grouped = new Map<string, TopProductRawRow>();
    for (const line of lines) {
      const listing = line.listingOptionId
        ? (optionById.get(line.listingOptionId)?.listing ?? null)
        : null;
      const account = accountById.get(line.channelAccountId);
      const id = listing?.id ?? `line-sku:${line.sku ?? line.lineItemId}`;
      const current = grouped.get(id) ?? {
        id,
        listingId: listing?.id ?? null,
        masterProductId: listing?.masterProductId ?? null,
        name:
          (listing?.masterProductId
            ? masterProductById.get(listing.masterProductId)?.name
            : null) ??
          listing?.displayName ??
          listing?.channelName ??
          listing?.externalId ??
          line.productName,
        organization:
          listing?.channelName ?? account?.name ?? account?.channel ?? null,
        revenue: 0,
        quantity: 0,
      };
      current.revenue += line.revenue;
      current.quantity += line.quantity;
      grouped.set(id, current);
    }
    const rows = [...grouped.values()]
      .sort(
        (left, right) =>
          right.revenue - left.revenue || left.id.localeCompare(right.id),
      )
      .slice(0, 10);

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
    const profitByListing =
      rankedListingIds.size === 0
        ? new Map<string, PerListingProfit>()
        : await this.readProfitByRankedListing(
            tx,
            organizationId,
            monthStart,
            monthEnd,
          );
    const abc = await readProductAbcPublication(tx, {
      organizationId,
      masterProductIds: rows.flatMap((row) =>
        row.masterProductId ? [row.masterProductId] : [],
      ),
    });
    const evaluationByProductId = new Map(
      abc.products.map((product) => [
        product.masterProductId,
        product.evaluation,
      ]),
    );

    return rows.map((r) => {
      const revenue = r.revenue;
      // A row with no listing has nothing to look up, and a listing the helper
      // withheld (incomplete ad coverage, per ADR-0006) answers `null` itself.
      const measured = r.listingId
        ? (profitByListing.get(r.listingId) ?? null)
        : null;
      const abcEvaluation = r.masterProductId
        ? (evaluationByProductId.get(r.masterProductId) ?? null)
        : null;
      return {
        id: r.id,
        name: r.name,
        organization: r.organization ?? "미지정",
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
    tx: Prisma.TransactionClient,
    organizationId: string,
    from: Date,
    to: Date,
  ): Promise<Map<string, PerListingProfit>> {
    const adEvidence = await readAdEvidenceFromLedger(
      tx,
      organizationId,
      from,
      to,
    );
    const rows = await buildPerListingProfit(
      tx,
      organizationId,
      from,
      to,
      adEvidence,
      this.inventoryTransactionalRead,
    );
    return new Map(rows.map((row) => [row.listingId, row]));
  }

  /**
   * Per-day revenue for the calendar month, KST-bucketed.
   * `SUM(oli.total_price)` per `o.ordered_at AT TIME ZONE 'Asia/Seoul'::date`.
   */
}
