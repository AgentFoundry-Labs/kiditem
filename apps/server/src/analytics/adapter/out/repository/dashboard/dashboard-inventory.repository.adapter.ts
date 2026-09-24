import { AI_LISTING_CONTENT_QUERY_PORT, type ListingContentQueryPort } from '../../../../../content/application/port/in/workspace/listing-content-query.port';
import { CHANNEL_ACCOUNT_PORT, type ChannelAccountPort } from '../../../../../channels/application/port/in/account/channel-account.port';
import { ownerTransaction } from '../../../../../prisma/owner-transaction';
import { CHANNEL_OPTION_RECIPE_PORT, type ChannelOptionRecipePort } from '../../../../../channels/application/port/in/channel-option-recipe.port';
import { CHANNEL_LISTING_QUERY_PORT, type ChannelListingQueryPort } from '../../../../../channels/application/port/in/listing/channel-listing-query.port';
import { withListingProductSummary } from '../../../../../channels/domain/listing/listing-product-summary';
// Inventory-side read model for the dashboard. Encapsulates the Prisma
// reads behind the inventory tile: grade counts, unread alerts, active
// product counts, per-listing profit metrics (shared helper), inventory
// Sellpia zero-stock and channel-SKU mapping-attention counts, current grade history,
// and A-grade master products with their
// channel-listing review counts.
//
// 2-hop joins (A-grade review fetch) bind organization on both
// MasterProduct and ChannelListing both bind organizationId.

import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  isChannelListingOnSale,
  resolveChannelListingSaleStatus,
} from "@kiditem/shared/channel-listing";
import {
  PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD,
  productAbcDisplayStatus,
  productAbcSaleAgeDays,
} from "@kiditem/shared/product-abc";
import { PrismaService } from "../../../../../prisma/prisma.service";
import {
  PRODUCT_TRANSACTIONAL_READ_PORT,
  type ProductTransactionalReadPort,
} from '../../../../../products/application/port/in/product-transactional-read.port';
import {
  PRODUCT_SOURCE_READ_PORT,
  type ProductSourceReadPort,
} from '../../../../../products/application/port/in/product-source-read.port';
import { readCurrentProductAbcGradeChanges } from "../../../../../products/adapter/out/persistence/read/product-abc-publication.reader";
import { readCurrentReviewListingStats } from "../../../../../orders/adapter/out/persistence/read/review-facts.reader";
import {
  buildPerListingMetricsCoverage,
  readAdEvidenceFromLedger,
} from "../../../../../common/per-listing-profit";
import {
  PRODUCT_ABC_READ_PORT,
  type ProductAbcReadPort,
} from "../../../../../products/application/port/in/product-abc-read.port";
import { SourceFailureAlerts } from "../../../../../alerts/alerts.service";
import type { DashboardAlertItem } from "@kiditem/shared/dashboard";
import type {
  DashboardInventoryRepositoryPort,
  DashboardAbcFacts,
  DashboardPerListingMetricsResult,
  AGradeReviewRow,
} from "../../../../application/port/out/repository/dashboard/dashboard-inventory.repository.port";
import type { ResolvedDashboardPeriod } from "../../../../domain/dashboard/period/dashboard-period";

@Injectable()
export class DashboardInventoryRepositoryAdapter implements DashboardInventoryRepositoryPort {
  constructor(
    @Inject(CHANNEL_OPTION_RECIPE_PORT) private readonly channelRecipes: ChannelOptionRecipePort,
    @Inject(CHANNEL_LISTING_QUERY_PORT) private readonly channelListings: ChannelListingQueryPort,
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_ABC_READ_PORT)
    private readonly productAbc: ProductAbcReadPort,
    private readonly alerts: SourceFailureAlerts,
    @Inject(PRODUCT_TRANSACTIONAL_READ_PORT)
    private readonly inventoryTransactionalRead: ProductTransactionalReadPort,
    @Inject(PRODUCT_SOURCE_READ_PORT)
    private readonly productSource: ProductSourceReadPort,
    @Inject(CHANNEL_ACCOUNT_PORT) private readonly channelAccounts: ChannelAccountPort,
    @Inject(AI_LISTING_CONTENT_QUERY_PORT) private readonly listingContent: ListingContentQueryPort,
  ) {}

  async readProductAbcFacts(
    organizationId: string,
  ): Promise<DashboardAbcFacts> {
    // Which products are active is this read model's question; what ABC status
    // each of them carries is Products'. The dashboard names the population and
    // counts the published answer — it does not choose an evidence cutoff of
    // its own (ADR 0002).
    const active = await this.productSource.listActiveForMatching(organizationId);
    const snapshot = await this.productAbc.readAbc({
      organizationId,
      masterProductIds: active.map((row) => row.masterProductId),
    });
    const gradeChanges = await this.prisma.$transaction(
      (tx) =>
        readCurrentProductAbcGradeChanges(tx, {
          organizationId,
          publicationRevision:
            snapshot.publication?.publicationRevision ?? null,
        }),
      { isolationLevel: "RepeatableRead" },
    );
    const statusCounts = new Map<
      DashboardAbcFacts["statusRows"][number]["displayStatus"],
      number
    >();
    const gradeCounts = new Map<"A" | "B" | "C", number>();
    const contributionRows: DashboardAbcFacts["contributionRows"] = [];
    const aGradeMasterProductIds: string[] = [];
    let classifiedProductCount = 0;
    let newProductCount = 0;
    // The active formula's minimum; a product younger than it is not graded yet.
    const minimumSaleAgeDays = (snapshot.publication?.formula ?? PRODUCT_ABC_ABSOLUTE_CURRENT_PAYLOAD).minimumSaleAgeDays;
    let withheldContributionProductCount = 0;
    for (const product of snapshot.products) {
      const displayStatus = productAbcDisplayStatus(product.abc);
      statusCounts.set(
        displayStatus,
        (statusCounts.get(displayStatus) ?? 0) + 1,
      );
      const evaluation = product.abc.evaluation;
      const saleAge = productAbcSaleAgeDays(product.saleStartDate, snapshot.actualCutoff);
      if (!evaluation && saleAge !== null && saleAge < minimumSaleAgeDays) newProductCount += 1;
      if (evaluation) {
        classifiedProductCount += 1;
        gradeCounts.set(
          evaluation.abcGrade,
          (gradeCounts.get(evaluation.abcGrade) ?? 0) + 1,
        );
        if (evaluation.abcGrade === "A") {
          aGradeMasterProductIds.push(product.masterProductId);
        }
        if (product.contributionEligible) {
          contributionRows.push({
            abcGrade: evaluation.abcGrade,
            weightedOperatingProfit: evaluation.weightedOperatingProfit,
          });
        } else {
          withheldContributionProductCount += 1;
        }
      }
    }
    return {
      gradeRows: [...gradeCounts].map(([abcGrade, count]) => ({
        abcGrade,
        count,
      })),
      statusRows: [...statusCounts].map(([displayStatus, count]) => ({
        displayStatus,
        count,
      })),
      contributionRows,
      withheldContributionProductCount,
      unclassifiedProductCount:
        snapshot.products.length - classifiedProductCount,
      newProductCount,
      formula: snapshot.publication?.formula ?? null,
      evaluatedAsOf: {
        targetCutoff: snapshot.targetCutoff,
        actualCutoff: snapshot.actualCutoff,
        capturedAt: snapshot.capturedAt,
      },
      publication: snapshot.publication && {
        publicationRevision: snapshot.publication.publicationRevision,
        officialCutoffDate: snapshot.publication.officialCutoffDate,
        publishedAt: snapshot.publication.publishedAt,
        sellpiaSourceImportRunId: snapshot.publication.sellpiaSourceImportRunId,
        advertisingSourceImportRunId:
          snapshot.publication.advertisingSourceImportRunId,
        mappingGeneration: snapshot.publication.mappingGeneration,
      },
      gradeChanges: [...gradeChanges],
      aGradeMasterProductIds,
    } satisfies DashboardAbcFacts;
  }

  async findUnreadAlerts(
    organizationId: string,
    limit: number,
  ): Promise<DashboardAlertItem[]> {
    // The Alert table is the alerts module's to read. This adapter asks it for
    // the rows this panel shows and projects them; it does not hold a second
    // opinion about filter, order, or limit.
    const rows = await this.alerts.list(organizationId, {
      isRead: false,
      status: "OPEN",
      limit,
    });
    return rows.map(
      (a) =>
        ({
          id: a.id,
          status: a.status as DashboardAlertItem["status"],
          type: a.type,
          title: a.title,
          message: a.message,
          sourceType: a.sourceType,
          href: a.href,
          targetType: a.targetType,
          targetId: a.targetId,
          isRead: a.isRead,
          createdAt: new Date(a.createdAt),
          updatedAt: a.updatedAt ? new Date(a.updatedAt) : undefined,
        }) satisfies DashboardAlertItem,
    );
  }

  async countActiveProducts(organizationId: string): Promise<number> {
    return (await this.productSource.listActiveForMatching(organizationId)).length;
  }

  async fetchPerListingMetrics(
    organizationId: string,
    period: ResolvedDashboardPeriod,
  ): Promise<DashboardPerListingMetricsResult> {
    // Which listings the ad source actually covered is the helper's rule
    // (ADR-0006); this adapter only carries its answer across the port: the
    // measured rows, how many listings it withheld, whether the Orders
    // collection covered the window, and whether advertising applies to the
    // organization at all. That last fact, and which dates the sweep measured,
    // come from the one advertising ledger read for the same resolved window.
    const { from, to } = period.queryWindow;
    return this.prisma.$transaction(
      async (tx) => {
        const accountAdEvidence = await readAdEvidenceFromLedger(
          tx,
          organizationId,
          from,
          to, this.channelAccounts
        );
        const { metrics, withheldListings, orderWindowComplete } = await buildPerListingMetricsCoverage(
          tx,
          organizationId,
          from,
          to,
          accountAdEvidence,
          undefined,
          this.inventoryTransactionalRead, { listings: this.channelListings, recipes: this.channelRecipes, accounts: this.channelAccounts, content: this.listingContent }
        );
        return {
          rows: metrics,
          withheldListings,
          orderWindowComplete,
          hasAdAccount: accountAdEvidence.hasAdAccount,
        } satisfies DashboardPerListingMetricsResult;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async readInventoryAvailabilityFacts(organizationId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const listingRows = await this.channelListings.readCatalogFacts(ownerTransaction(tx), { organizationId, channels: ['coupang', 'rocket'], activeAccountsOnly: true }).then(rows => rows.map(row => ({ ...row, options: row.options.map(option => ({ ...option, inventoryComponents: option.components })) })));
        const listings = listingRows.map(withListingProductSummary);
        const inventoryContext = { client: tx };
        const [statusFacts, identities] = await Promise.all([
          this.channelListings.readLatestSaleStatus(ownerTransaction(tx), {
            organizationId,
            listingIds: listings.map((listing) => listing.id),
          }),
          this.inventoryTransactionalRead.readSourceIdentities(inventoryContext, {
            organizationId,
            selector: { kind: "all" },
          }),
        ]);
        const inventoryLock = await this.inventoryTransactionalRead.lock(
          inventoryContext,
          organizationId,
        );
        const availability = await this.inventoryTransactionalRead.readAvailability(
          inventoryContext,
          inventoryLock,
          {
          organizationId,
          masterProductIds: identities.map(
            (product) => product.masterProductId,
          ),
          },
        );
        const identityBySkuId = new Map(
          identities.map((product) => [product.masterProductId, product]),
        );
        const availabilityBySkuId = new Map(
          availability.items.map((item) => [item.masterProductId, item]),
        );
        const stockMeasured =
          availability.snapshot.collected &&
          identities.every((product) =>
            availabilityBySkuId.has(product.masterProductId),
          );
        const saleStatusByListing = new Map(
          statusFacts.map((fact) => [fact.listingId, fact.saleStatus]),
        );
        let unmatched = 0;
        let needsReview = 0;
        let matched = 0;
        const linkedMasterProductIds = new Set<string>();
        for (const listing of listings) {
          const saleStatus = resolveChannelListingSaleStatus({
            latestSnapshotStatus: saleStatusByListing.get(listing.id) ?? null,
            rawStatus: rawSaleStatus(listing.rawJson),
            optionStatuses: listing.options.map((option) => option.status),
            listingStatus: listing.status,
            isActive: listing.isActive,
          });
          if (!isChannelListingOnSale(saleStatus)) continue;
          for (const option of listing.options) {
            if (option.inventoryComponents.length === 0) {
              unmatched += 1;
            } else if (
              option.inventoryComponents.some(
                (component) =>
                  !identityBySkuId.has(component.masterProductId),
              )
            ) {
              needsReview += 1;
            } else {
              matched += 1;
            }
          }
          if (listing.masterProductId) {
            linkedMasterProductIds.add(listing.masterProductId);
          }
        }
        return {
          outOfStockSkus: stockMeasured
            ? identities.filter(
                (product) =>
                  availabilityBySkuId.get(product.masterProductId)
                    ?.currentStock === 0,
              ).length
            : null,
          linkedMasterProductCount: linkedMasterProductIds.size,
          mappingStatusRows: [
            { mappingStatus: "unmatched", count: unmatched },
            { mappingStatus: "needs_review", count: needsReview },
            { mappingStatus: "matched", count: matched },
          ],
          snapshot: {
            ...availability.snapshot,
            verifiedAt: availability.snapshot.verifiedAt
              ? new Date(availability.snapshot.verifiedAt).toISOString()
              : null,
          },
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }

  async findReviewCountsForProducts(
    organizationId: string,
    masterProductIds: readonly string[],
  ): Promise<AGradeReviewRow[]> {
    if (masterProductIds.length === 0) return [];
    // Grade selection comes from Products' current publication above. This
    // query only joins those identities to review counts; the mutable
    // MasterProduct.abcGrade cache is not publication authority.
    return this.prisma.$transaction(
      async (tx) => {
        const listings = await this.channelRecipes.findListingsBySourceProducts(ownerTransaction(tx), { organizationId, masterProductIds, activeOnly: true }).then(rows => rows.map(row => ({ id: row.listingId })));
        const summaries = await this.channelRecipes.readListingProductSummaries(ownerTransaction(tx), { organizationId, listingIds: listings.map((listing) => listing.id) });
        const listingIds = listings.filter((listing) => masterProductIds.includes(summaries.get(listing.id) ?? "")).map((listing) => listing.id);
        const stats = await readCurrentReviewListingStats(
          tx,
          organizationId,
          listingIds,
        );
        const countByListingId = new Map(
          stats.map((row) => [row.listingId, row.totalReviews]),
        );
        const countByProductId = new Map<string, number>();
        for (const listing of listings) {
          const masterProductId = summaries.get(listing.id);
          if (!masterProductId || !masterProductIds.includes(masterProductId)) continue;
          countByProductId.set(
            masterProductId,
            (countByProductId.get(masterProductId) ?? 0)
              + (countByListingId.get(listing.id) ?? 0),
          );
        }
        return masterProductIds.map((masterProductId) =>
          ({ reviewCount: countByProductId.get(masterProductId) ?? 0 }) satisfies AGradeReviewRow,
        );
      },
      { isolationLevel: "RepeatableRead" },
    );
  }
}

function rawSaleStatus(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of ["saleStatus", "salesStatus", "sale_status", "판매상태"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim())
      return candidate.trim();
  }
  return null;
}
