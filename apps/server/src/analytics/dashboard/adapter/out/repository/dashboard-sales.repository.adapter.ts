import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../../prisma/prisma.service";
import {
  ORDER_FACT_EXCLUDED_STATUSES,
  readOrderLineWindowFacts,
} from "../../../../../orders/read/order-facts.reader";
import { readMonthlyAdAllocationPublication } from "../../../../../advertising/read/monthly-ad-allocation.reader";
import { readProductAbcPublication } from "../../../../../products/read/product-abc-publication.reader";
import { readCurrentSellpiaProductMonthlyFacts } from "../../../../sellpia-product-sales/read/sellpia-product-monthly-facts";
import { businessDateKey } from "../../../../../common/kst";
import {
  buildPerListingProfit,
  readAdEvidenceFromLedger,
  type PerListingProfit,
} from "../../../../../common/per-listing-profit";
import type { TopProduct, TopProductGradeAbsence } from "@kiditem/shared/dashboard";
import type { ProductAbcEvaluation } from "@kiditem/shared/product-abc";
import type {
  DashboardSalesRepositoryPort,
  SellpiaTopProductsRead,
  TodayKpiRow,
} from "../../../application/port/out/repository/dashboard-sales.repository.port";

interface SellpiaTopProductRow {
  productCode: string;
  name: string;
  /** The option whose name the row carries — the product's first. */
  nameOptionCode: string;
  revenue: number;
  /**
   * 판 물건의 원가 = Σ(팔린 개수 × 매입 단가). 셀피아의 `inAmount`(그달 매입금액)와 다르다 —
   * 대량 입고한 달은 판매액의 몇십 배라 이익처럼 빼면 말이 안 된다(사장님 2026-09-21).
   */
  cost: number;
  /**
   * 판 줄마다 매입 단가가 있었는가. `cost` 는 옵션 줄의 합이라 한 줄만 단가가 0 이어도 합은
   * 0 보다 커서 '아는 값' 처럼 보인다 — 그 줄의 매출이 통째로 이익이 되어 이익률을
   * 부풀린다(2026-09-21 점검).
   */
  costComplete: boolean;
  revenueByMasterProduct: Map<string, number>;
}

/**
 * The one coverage window a month's Sellpia facts were captured over, or null
 * when there are no facts or they disagree: a ranking summed across different
 * windows is not one month's ranking.
 */
function sharedCoverage(
  facts: readonly Readonly<{
    coverageStartDate: Date | null;
    coverageEndDate: Date | null;
  }>[],
): SellpiaTopProductsRead["coverage"] | null {
  const first = facts[0];
  if (!first?.coverageStartDate || !first.coverageEndDate) return null;
  const startDate = businessDateKey(first.coverageStartDate);
  const endDate = businessDateKey(first.coverageEndDate);
  const shared = facts.every(
    (fact) =>
      fact.coverageStartDate !== null &&
      fact.coverageEndDate !== null &&
      businessDateKey(fact.coverageStartDate) === startDate &&
      businessDateKey(fact.coverageEndDate) === endDate,
  );
  return shared ? { startDate, endDate } : null;
}

/**
 * The evaluation a Sellpia product's options agree on. Options can map to
 * different master products; a grade is shown only when every one of them
 * carries it, and the evaluation shown is the best-selling one's.
 */
function agreedEvaluation(
  revenueByMasterProduct: ReadonlyMap<string, number>,
  evaluationByProductId: ReadonlyMap<string, ProductAbcEvaluation | null>,
): ProductAbcEvaluation | null {
  const evaluations = [...revenueByMasterProduct.entries()]
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .map(([id]) => evaluationByProductId.get(id) ?? null);
  const lead = evaluations[0] ?? null;
  if (!lead) return null;
  return evaluations.every((evaluation) => evaluation?.abcGrade === lead.abcGrade)
    ? lead
    : null;
}

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

/**
 * Why these sold products carry no ABC grade. The grade itself is the ABC
 * owner's publication; this only reads the two gates an operator can act on —
 * stock and the Coupang/Rocket recipe — so a blank grade beside a large revenue
 * says which one to fix (사장님 2026-09-21). Anything else is 'pending': the
 * product is eligible and waiting for the next publication.
 */
async function readGradeAbsence(
  tx: Prisma.TransactionClient,
  organizationId: string,
  masterProductIds: readonly string[],
): Promise<Map<string, TopProductGradeAbsence>> {
  const absence = new Map<string, TopProductGradeAbsence>();
  if (masterProductIds.length === 0) return absence;
  const rows = await tx.$queryRaw<Array<{ mp: string; stock: number; linked: boolean }>>`
    select sk.master_product_id::text as mp,
           coalesce(sum(sk.current_stock), 0)::int as stock,
           bool_or(exists (
             select 1
             from channel_listing_option_inventory_components c
             join channel_listing_options o on o.id = c.channel_listing_option_id and o.is_active
             join channel_listings l on l.id = o.listing_id and l.is_active
             join channel_accounts a on a.id = l.channel_account_id
               and a.status = 'active' and a.channel in ('coupang', 'rocket')
             where c.sellpia_inventory_sku_id = sk.id
           )) as linked
    from sellpia_inventory_skus sk
    where sk.organization_id = ${organizationId}::uuid
      and sk.is_active
      and sk.master_product_id = any(${[...masterProductIds]}::uuid[])
    group by 1`;
  for (const row of rows) {
    absence.set(row.mp, row.stock <= 0 ? 'out_of_stock' : row.linked ? 'pending' : 'not_linked');
  }
  for (const id of masterProductIds) {
    if (!absence.has(id)) absence.set(id, 'not_linked');
  }
  return absence;
}


/**
 * 그달 상품별 광고비. 광고 owner 가 발표한 배분을 그대로 더한다 — 이 파일은 광고비를 나누지
 * 않는다. 어느 발표를 읽을지는 대시보드가 고르지 않고, ABC 발표가 쓴 그 발표를 따라간다
 * (같은 수를 두 화면이 달리 말하지 않게, 사장님 2026-09-21).
 */
async function readMonthlyAdSpendByProduct(
  tx: Prisma.TransactionClient,
  organizationId: string,
  advertisingSourceImportRunId: string | null,
  yearMonth: string,
): Promise<Map<string, number> | null> {
  if (!advertisingSourceImportRunId) return null;
  const publication = await readMonthlyAdAllocationPublication(tx, {
    organizationId,
    sourceImportRunId: advertisingSourceImportRunId,
  });
  if (!publication) return null;
  const spend = new Map<string, number>();
  for (const allocation of publication.allocations) {
    if (!allocation.month.startsWith(yearMonth)) continue;
    spend.set(
      allocation.masterProductId,
      (spend.get(allocation.masterProductId) ?? 0) + allocation.allocatedSpend,
    );
  }
  return spend;
}

@Injectable()
export class DashboardSalesRepositoryAdapter implements DashboardSalesRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

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
              masterProduct: {
                select: { id: true, name: true },
              },
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
        masterProductId: listing?.masterProduct?.id ?? null,
        name:
          listing?.masterProduct?.name ??
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
    const absenceByProductId = await readGradeAbsence(
      tx,
      organizationId,
      rows.flatMap((row) =>
        row.masterProductId && !evaluationByProductId.get(row.masterProductId)
          ? [row.masterProductId]
          : [],
      ),
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
        profitKind: 'net' as const,
        gradeAbsence: abcEvaluation
          ? null
          : (r.masterProductId ? absenceByProductId.get(r.masterProductId) ?? 'not_linked' : 'not_linked'),
        abcEvaluation,
        revenue,
        netProfit: measured?.netProfit ?? null,
        profitRate: measured?.profitRate ?? null,
      } satisfies TopProduct;
    });
  }

  /**
   * Top-N (10) products for one calendar month from Sellpia's per-product
   * monthly sales. Sellpia sees every channel's sales, Rocket included, while
   * orders see only what the mall collectors brought in, so for a whole month
   * this is the complete ranking — and the one the operator checks against
   * Sellpia's own product report.
   *
   * A row is one Sellpia product with its options summed, the unit Sellpia
   * reports. Its grade is the ABC grade of the master products its options map
   * to, and only when they agree. Sellpia publishes sales and purchase amounts,
   * not a settled profit, so profit stays absent rather than passing a gross
   * margin off as net profit.
   */
  async fetchSellpiaTopProducts(
    organizationId: string,
    yearMonth: string,
  ): Promise<SellpiaTopProductsRead | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const { facts } = await readCurrentSellpiaProductMonthlyFacts(tx, {
          organizationId,
          scope: { yearMonths: [yearMonth] },
        });
        const coverage = sharedCoverage(facts);
        if (!coverage) return null;

        const grouped = new Map<string, SellpiaTopProductRow>();
        for (const fact of facts) {
          const current = grouped.get(fact.productCode) ?? {
            productCode: fact.productCode,
            name: fact.productName,
            nameOptionCode: fact.optionCode,
            revenue: 0,
            cost: 0,
            costComplete: true,
            revenueByMasterProduct: new Map<string, number>(),
          };
          // Sellpia names the product on its first option; later options can
          // carry a colour's own name ("… (블루)"), which would misname a row
          // that sums every colour.
          if (fact.optionCode < current.nameOptionCode) {
            current.nameOptionCode = fact.optionCode;
            current.name = fact.productName;
          }
          current.revenue += fact.orderAmount;
          current.cost += fact.orderQty * fact.buyPrice;
          // 팔린 줄은 전부 매입 단가가 있어야 원가를 안다고 말할 수 있다.
          if (fact.orderQty > 0 && fact.buyPrice <= 0) current.costComplete = false;
          if (fact.masterProductId) {
            current.revenueByMasterProduct.set(
              fact.masterProductId,
              (current.revenueByMasterProduct.get(fact.masterProductId) ?? 0) +
                fact.orderAmount,
            );
          }
          grouped.set(fact.productCode, current);
        }
        // Most of a month's rows are products that sold nothing.
        const rows = [...grouped.values()]
          .filter((row) => row.revenue > 0)
          .sort(
            (left, right) =>
              right.revenue - left.revenue ||
              left.productCode.localeCompare(right.productCode),
          )
          .slice(0, 10);

        const abc = await readProductAbcPublication(tx, {
          organizationId,
          masterProductIds: rows.flatMap((row) => [
            ...row.revenueByMasterProduct.keys(),
          ]),
        });
        const evaluationByProductId = new Map(
          abc.products.map((product) => [
            product.masterProductId,
            product.evaluation,
          ]),
        );

        const adSpendByProductId = await readMonthlyAdSpendByProduct(
          tx,
          organizationId,
          abc.publication?.advertisingSourceImportRunId ?? null,
          yearMonth,
        );
        const absenceByProductId = await readGradeAbsence(
          tx,
          organizationId,
          rows.flatMap((row) =>
            agreedEvaluation(row.revenueByMasterProduct, evaluationByProductId)
              ? []
              : [...row.revenueByMasterProduct.keys()],
          ),
        );

        return {
          coverage,
          products: rows.map((row) => {
            const abcEvaluation = agreedEvaluation(
              row.revenueByMasterProduct,
              evaluationByProductId,
            );
            // 한 셀피아 상품이 여러 마스터에 걸리면 가장 많이 판 쪽의 사정을 적는다.
            const leadProductId = [...row.revenueByMasterProduct.entries()]
              .sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
            // 이익 = 매출 − 셀피아 매입 원가 − 그달 광고비. 광고비는 지금 ABC 공식(v3)이
            // 광고를 빼고 매기는 탓에 발표를 따라갈 수 없어 0 으로 두는 달이 있다 — 그때는
            // 매출총이익이고, 화면이 그렇게 적는다(사장님 2026-09-21).
            const adSpend = adSpendByProductId === null
              ? 0
              : [...row.revenueByMasterProduct.keys()]
                .reduce((sum, id) => sum + (adSpendByProductId.get(id) ?? 0), 0);
            // 매입 원가가 0 인 상품은 원가를 못 받은 것이다 — 공짜로 떼어 온 물건은 없다.
            // 그대로 빼면 이익률이 100% 로 찍히므로 이익을 말하지 않는다(사장님 2026-09-21).
            // 한 옵션이라도 매입 단가를 못 읽었으면 이익은 모르는 값이다. 합계만 보면
            // 그 옵션의 매출이 통째로 이익이 되어 이익률이 부풀려진다(2026-09-21 점검).
            const netProfit = row.costComplete && row.cost > 0
              ? row.revenue - row.cost - adSpend
              : null;
            return {
              id: `sellpia:${row.productCode}`,
              name: row.name,
              organization: "셀피아",
              grade: abcEvaluation?.abcGrade ?? null,
              gradeAbsence: abcEvaluation
                ? null
                : (leadProductId ? absenceByProductId.get(leadProductId) ?? 'not_linked' : 'not_linked'),
              abcEvaluation,
              revenue: row.revenue,
              profitKind: 'gross',
              netProfit,
              profitRate: netProfit === null || row.revenue <= 0
                ? null
                : Math.round((netProfit / row.revenue) * 1000) / 10,
            } satisfies TopProduct;
          }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
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
    );
    return new Map(rows.map((row) => [row.listingId, row]));
  }

  /**
   * Per-day revenue for the calendar month, KST-bucketed.
   * `SUM(oli.total_price)` per `o.ordered_at AT TIME ZONE 'Asia/Seoul'::date`.
   */
}
