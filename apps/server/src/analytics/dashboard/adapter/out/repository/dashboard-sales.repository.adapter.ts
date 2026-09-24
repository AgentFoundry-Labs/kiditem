import { AI_LISTING_CONTENT_QUERY_PORT, type ListingContentQueryPort } from '../../../../../content/application/port/in/workspace/listing-content-query.port';
import { ownerTransaction } from '../../../../../prisma/owner-transaction';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../../../channels/application/port/in/account/channel-account.port';
import { CHANNEL_LISTING_QUERY_PORT, type ChannelListingQueryPort } from '../../../../../channels/application/port/in/listing/channel-listing-query.port';
import { CHANNEL_OPTION_RECIPE_PORT, type ChannelOptionRecipePort } from '../../../../../channels/application/port/in/channel-option-recipe.port';
import { PRODUCT_ABC_READ_PORT, type ProductAbcReadPort } from '../../../../../products/application/port/in/product-abc-read.port';
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../../../prisma/prisma.service";
import { businessDateKey } from "../../../../../common/kst";
import { readCurrentSellpiaProductMonthlyFacts } from "../../../../sellpia-product-sales/read/sellpia-product-monthly-facts";
import {
  ORDER_FACT_EXCLUDED_STATUSES,
  readOrderLineWindowFacts,
} from "../../../../../orders/adapter/out/persistence/read/order-facts.reader";
import {
  PRODUCT_TRANSACTIONAL_READ_PORT,
  type ProductTransactionalReadPort,
} from "../../../../../products/application/port/in/product-transactional-read.port";
import { readCompletedImportRowCount } from "../../../../../core/read/source-import-run.reader";

/**
 * 주문을 실어 오는 수집 원천. 몰 주문 수집과 쿠팡직배송 발주 수집이 오늘 주문을 만든다.
 */
const ORDER_COLLECTION_SOURCE_TYPES = [
  "order_collection_mall",
  "coupang_direct_order_capture",
] as const;
import {
  buildPerListingProfit,
  readAdEvidenceFromLedger,
  type PerListingProfit,
} from "../../../../../common/per-listing-profit";
import type { TopProduct } from "@kiditem/shared/dashboard";
import type {
  DashboardSalesRepositoryPort,
  SellpiaTopProductsRead,
  TodayKpiRow,
} from "../../../application/port/out/repository/dashboard-sales.repository.port";

interface SellpiaTopProductRow {
  productCode: string;
  name: string;
  nameOptionCode: string;
  revenue: number;
  /**
   * 판 물건의 원가. 원천 행의 `inAmount` 는 주문시점 공급가(`ORDER_TIME_SUPPLY_COST`)이고,
   * ABC 의 매출총이익도 같은 값을 쓴다 — 두 화면이 같은 원가를 말하도록 여기서도 그대로 더한다.
   */
  cost: number;
  /**
   * 판 줄마다 믿을 원가가 있었는가. `cost` 는 옵션 줄의 합이라 한 줄만 0 이어도 합은 0 보다
   * 커서 '아는 값' 처럼 보인다 — 그 줄의 매출이 통째로 이익이 되어 이익률을 부풀린다.
   * 원가 출처(`costBasis` · `vatIncluded`)가 명시되지 않은 줄도 믿을 원가가 아니다.
   */
  costComplete: boolean;
  revenueByMasterProduct: Map<string, number>;
}

/**
 * A Sellpia ranking is one monthly snapshot only when every source row shares
 * the same captured business-date window. Mixed or absent coverage is
 * unavailable, so the caller can keep the Orders ranking.
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
  return facts.every(
    (fact) =>
      fact.coverageStartDate !== null &&
      fact.coverageEndDate !== null &&
      businessDateKey(fact.coverageStartDate) === startDate &&
      businessDateKey(fact.coverageEndDate) === endDate,
  )
    ? { startDate, endDate }
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
@Injectable()
export class DashboardSalesRepositoryAdapter implements DashboardSalesRepositoryPort {
  constructor(
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly channelAccounts: ChannelAccountPort,
    @Inject(CHANNEL_LISTING_QUERY_PORT) private readonly channelListings: ChannelListingQueryPort,
    @Inject(CHANNEL_OPTION_RECIPE_PORT) private readonly channelRecipes: ChannelOptionRecipePort,
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT)
    private readonly inventoryTransactionalRead: ProductTransactionalReadPort,
    @Inject(PRODUCT_ABC_READ_PORT)
    private readonly productAbc: ProductAbcReadPort,
    @Inject(AI_LISTING_CONTENT_QUERY_PORT) private readonly listingContent: ListingContentQueryPort,
  ) {}

  /**
   * KST today KPI with the owner's completeness verdict intact.
   */
  async fetchTodayKpis(
    organizationId: string,
    todayStart: Date,
    todayEnd: Date,
  ): Promise<TodayKpiRow> {
    const [facts, collectedOrders] = await this.prisma.$transaction(
      async (tx) => Promise.all([
        readOrderLineWindowFacts(tx, {
          organizationId,
          from: todayStart,
          to: todayEnd,
          excludedStatuses: ORDER_FACT_EXCLUDED_STATUSES,
        }, this.channelAccounts),
        // 오늘 걷은 주문 수. 주문일이 아니라 **걷은 날** 기준이라 주문수집 화면과 같은 수다
        // (사장님 2026-09-21: "오늘 주문 50건이잖아").
        readCompletedImportRowCount(tx, {
          organizationId,
          sourceTypes: ORDER_COLLECTION_SOURCE_TYPES,
          from: todayStart,
          to: todayEnd,
        }),
      ]),
      { isolationLevel: "RepeatableRead" },
    );
    return {
      revenue: facts.window.revenue,
      orders: facts.window.orderCount,
      collectedOrders,
      requestedDates: facts.window.requestedDates,
      includedDates: facts.window.includedDates,
      missingDates: facts.window.missingDates,
      observedAt: facts.window.observedAt,
    };
  }

  /**
   * Top-N (10) listing revenue ranking for the calendar month. Revenue is
   * grouped by ChannelListing so a bundle line is counted once regardless of
   * how many source products its option consumes. Source product identity is
   * derived from option recipes; its retained official grade comes from Products.
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
    const rows = await this.prisma.$transaction(
      (tx) => this.fetchTopProductsSnapshot(tx, organizationId, monthStart, monthEnd),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const ids = [...new Set(rows.flatMap((row) => row.masterProductId ? [row.masterProductId] : []))];
    const snapshot = ids.length ? await this.productAbc.readAbc({ organizationId, masterProductIds: ids }) : null;
    const byId = new Map(snapshot?.products.map((row) => [row.masterProductId, row.abc]) ?? []);
    return rows.map((row) => {
      const abc = row.masterProductId ? byId.get(row.masterProductId) ?? null : null;
      return {
        ...row,
        abc,
        grade: abc?.abcGrade ?? null,
        abcEvaluation: abc?.evaluation ?? null,
      } satisfies TopProduct;
    });
  }

  /**
   * Top-N (10) products for a whole calendar month from Sellpia's published
   * monthly facts. These facts cover every channel, so this ranking is used
   * when the selected period is a complete month.
   *
   * 이익은 매출 − 셀피아 주문시점 공급가(`inAmount`)다. 광고비와 몰 수수료를 빼기 전이라
   * 순이익이 아니라 **매출총이익**이고, `profitKind: 'gross'` 로 그 성격을 함께 낸다 —
   * 화면이 칸 이름을 '매출총이익 · 총이익률' 로 바꿔 적는다(사장님 2026-09-21).
   * 원가 출처가 명시되지 않았거나 판 줄 중 하나라도 원가가 0 이면 이익을 말하지 않는다:
   * 현재 상품가를 끌어다 쓰는 일은 여전히 없다.
   */
  async fetchSellpiaTopProducts(
    organizationId: string,
    yearMonth: string,
  ): Promise<SellpiaTopProductsRead | null> {
    const { facts } = await this.prisma.$transaction(
      (tx) =>
        readCurrentSellpiaProductMonthlyFacts(tx, {
          organizationId,
          scope: { yearMonths: [yearMonth] },
        }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
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
      if (fact.optionCode < current.nameOptionCode) {
        current.nameOptionCode = fact.optionCode;
        current.name = fact.productName;
      }
      current.revenue += fact.orderAmount;
      current.cost += fact.inAmount;
      // 원가 출처를 못 박은 수집만 원가로 인정한다 — `sellpia-master-product-profit-fact`
      // 가 ABC 에 쓰는 관문과 같다. 팔린 줄인데 원가가 0 이면 못 읽은 것이다: 공짜로 떼어 온
      // 물건은 없고, 그대로 빼면 이익률이 100% 로 찍힌다.
      if (fact.costBasis !== "ORDER_TIME_SUPPLY_COST" || fact.vatIncluded !== true) {
        current.costComplete = false;
      }
      if (fact.orderQty > 0 && fact.inAmount <= 0) current.costComplete = false;
      if (fact.masterProductId) {
        current.revenueByMasterProduct.set(
          fact.masterProductId,
          (current.revenueByMasterProduct.get(fact.masterProductId) ?? 0)
            + fact.orderAmount,
        );
      }
      grouped.set(fact.productCode, current);
    }

    const rows = [...grouped.values()]
      .filter((row) => row.revenue > 0)
      .sort(
        (left, right) =>
          right.revenue - left.revenue
          || left.productCode.localeCompare(right.productCode),
      )
      .slice(0, 10);
    const masterProductIds = [
      ...new Set(rows.flatMap((row) => [...row.revenueByMasterProduct.keys()])),
    ];
    const snapshot = masterProductIds.length
      ? await this.productAbc.readAbc({ organizationId, masterProductIds })
      : null;
    const abcByMasterProductId = new Map(
      snapshot?.products.map((product) => [product.masterProductId, product.abc]) ?? [],
    );

    return {
      coverage,
      products: rows.map((row) => {
        const orderedMasterProductIds = [...row.revenueByMasterProduct.entries()]
          .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
          .map(([masterProductId]) => masterProductId);
        const abcViews = orderedMasterProductIds.map(
          (masterProductId) => abcByMasterProductId.get(masterProductId) ?? null,
        );
        const firstAbc = abcViews[0] ?? null;
        const abc = firstAbc && abcViews.every(
          (view) => view?.abcGrade === firstAbc.abcGrade,
        )
          ? firstAbc
          : null;
        // 원가가 0 인 상품은 원가를 못 받은 것이다 — 이익을 말하지 않는다.
        const netProfit = row.costComplete && row.cost > 0
          ? row.revenue - row.cost
          : null;
        return {
          id: `sellpia:${row.productCode}`,
          name: row.name,
          organization: "셀피아",
          abc,
          grade: abc?.abcGrade ?? null,
          abcEvaluation: abc?.evaluation ?? null,
          revenue: row.revenue,
          profitKind: "gross" as const,
          netProfit,
          profitRate: netProfit === null || row.revenue <= 0
            ? null
            : Math.round((netProfit / row.revenue) * 1000) / 10,
        } satisfies TopProduct;
      }),
    };
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
    }, this.channelAccounts);
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
    const optionRows = await this.channelListings.readOptionIdentities(ownerTransaction(tx), { organizationId, optionIds }).then(rows => rows.map(row => ({ id: row.optionId, listing: { id: row.listingId, externalId: row.listingExternalId, channelName: row.channelName, displayName: row.displayName } })));
    const summaries = await this.channelRecipes.readListingProductSummaries(ownerTransaction(tx), { organizationId, listingIds: [...new Set(optionRows.map((row) => row.listing.id))] });
    const options = optionRows.map((row) => ({ ...row, listing: { ...row.listing, masterProductId: summaries.get(row.listing.id) ?? null } }));
    const accounts = await this.channelAccounts.findByIds(ownerTransaction(tx), { organizationId, accountIds });
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
    return rows.map((r) => {
      const revenue = r.revenue;
      // A row with no listing has nothing to look up, and a listing the helper
      // withheld (incomplete ad coverage, per ADR-0006) answers `null` itself.
      const measured = r.listingId
        ? (profitByListing.get(r.listingId) ?? null)
        : null;
      return {
        id: r.id,
        masterProductId: r.masterProductId,
        name: r.name,
        organization: r.organization ?? "미지정",
        grade: null,
        abcEvaluation: null,
        revenue,
        // 이 길의 이익은 정산까지 끝난 순이익이다. 월간 셀피아 순위의 매출총이익과 성격이
        // 다르므로 화면이 칸 이름을 가려 적을 수 있게 종류를 밝힌다.
        profitKind: "net" as const,
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
      to, this.channelAccounts
    );
    const rows = await buildPerListingProfit(
      tx,
      organizationId,
      from,
      to,
      adEvidence,
      this.inventoryTransactionalRead, { listings: this.channelListings, recipes: this.channelRecipes, accounts: this.channelAccounts, content: this.listingContent }
    );
    return new Map(rows.map((row) => [row.listingId, row]));
  }

  /**
   * Per-day revenue for the calendar month, KST-bucketed.
   * `SUM(oli.total_price)` per `o.ordered_at AT TIME ZONE 'Asia/Seoul'::date`.
   */
}
