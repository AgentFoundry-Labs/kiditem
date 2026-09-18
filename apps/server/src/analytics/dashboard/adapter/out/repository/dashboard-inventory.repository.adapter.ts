// Inventory-side read model for the dashboard. Encapsulates the Prisma
// reads behind the inventory tile: grade counts, unread alerts, active
// product counts, per-listing profit metrics (shared helper), inventory
// Sellpia zero-stock and channel-SKU mapping-attention counts, current grade history,
// low-CTR thumbnail count, and A-grade master products with their
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
import { readLatestListingSaleStatusFacts } from "../../../../../channels/read/channel-listing-daily-facts";
import {
  readInventoryAvailability,
  readInventorySkuIdentities,
} from "../../../../../inventory/read/inventory-availability";
import { readCurrentProductAbcGradeChanges } from "../../../../../products/read/product-abc-publication.reader";
import { readCurrentReviewListingStats } from "../../../../../orders/read/review-facts.reader";
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
} from "../../../application/port/out/repository/dashboard-inventory.repository.port";
import type { ResolvedDashboardPeriod } from "../../../domain/period/dashboard-period";

@Injectable()
export class DashboardInventoryRepositoryAdapter implements DashboardInventoryRepositoryPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRODUCT_ABC_READ_PORT)
    private readonly productAbc: ProductAbcReadPort,
    private readonly alerts: SourceFailureAlerts,
  ) {}

  async readProductAbcFacts(
    organizationId: string,
  ): Promise<DashboardAbcFacts> {
    // Which products are active is this read model's question; what ABC status
    // each of them carries is Products'. The dashboard names the population and
    // counts the published answer — it does not choose an evidence cutoff of
    // its own (ADR 0002).
    const active = await this.prisma.masterProduct.findMany({
      where: { organizationId, isActive: true },
      select: { id: true },
    });
    const snapshot = await this.productAbc.readAbc({
      organizationId,
      masterProductIds: active.map((row) => row.id),
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
    return this.prisma.masterProduct.count({
      where: { organizationId, isActive: true },
    });
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
          to,
        );
        const { metrics, withheldListings, orderWindowComplete } = await buildPerListingMetricsCoverage(
          tx,
          organizationId,
          from,
          to,
          accountAdEvidence,
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
        const listings = await tx.channelListing.findMany({
          where: {
            organizationId,
            channelAccount: {
              is: {
                organizationId,
                status: "active",
                channel: { in: ["coupang", "rocket"] },
              },
            },
          },
          select: {
            id: true,
            masterProductId: true,
            isActive: true,
            status: true,
            rawJson: true,
            options: {
              where: { organizationId },
              select: {
                status: true,
                inventoryComponents: {
                  where: { organizationId },
                  select: {
                    sellpiaInventorySkuId: true,
                  },
                },
              },
            },
          },
        });
        const componentSkuIds = [
          ...new Set(
            listings.flatMap((listing) =>
              listing.options.flatMap((option) =>
                option.inventoryComponents.map(
                  (component) => component.sellpiaInventorySkuId,
                ),
              ),
            ),
          ),
        ];
        const [statusFacts, identities, activeIdentities] = await Promise.all([
          readLatestListingSaleStatusFacts(tx, {
            organizationId,
            listingIds: listings.map((listing) => listing.id),
          }),
          readInventorySkuIdentities(tx, {
            organizationId,
            selector: { kind: "ids", values: componentSkuIds },
          }),
          readInventorySkuIdentities(tx, {
            organizationId,
            selector: { kind: "active" },
          }),
        ]);
        const availability = await readInventoryAvailability(tx, {
          organizationId,
          sellpiaInventorySkuIds: activeIdentities.map(
            (sku) => sku.sellpiaInventorySkuId,
          ),
        });
        const masterProductIds = [...new Set(
          listings.flatMap((listing) =>
            listing.masterProductId ? [listing.masterProductId] : []),
        )];
        const activeProducts = await tx.masterProduct.findMany({
          where: {
            organizationId,
            id: { in: masterProductIds },
            isActive: true,
          },
          select: { id: true },
        });
        const activeProductIds = new Set(
          activeProducts.map((product) => product.id),
        );
        const identityBySkuId = new Map(
          identities.map((sku) => [sku.sellpiaInventorySkuId, sku]),
        );
        const availabilityBySkuId = new Map(
          availability.items.map((item) => [item.sellpiaInventorySkuId, item]),
        );
        const stockMeasured =
          availability.snapshot.collected &&
          activeIdentities.every((sku) =>
            availabilityBySkuId.has(sku.sellpiaInventorySkuId),
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
                  identityBySkuId.get(component.sellpiaInventorySkuId)
                    ?.isActive !== true,
              )
            ) {
              needsReview += 1;
            } else {
              matched += 1;
            }
          }
          if (
            listing.masterProductId &&
            activeProductIds.has(listing.masterProductId)
          ) {
            linkedMasterProductIds.add(listing.masterProductId);
          }
        }
        return {
          outOfStockSkus: stockMeasured
            ? activeIdentities.filter(
                (sku) =>
                  availabilityBySkuId.get(sku.sellpiaInventorySkuId)
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

  async countLowCtrThumbnails(organizationId: string): Promise<number> {
    return this.prisma.thumbnail.count({
      where: { organizationId, ctr: { lt: 1.5, gt: 0 } },
    });
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
        const products = await tx.masterProduct.findMany({
          where: {
            organizationId,
            id: { in: [...masterProductIds] },
            isActive: true,
          },
          select: {
            channelListings: {
              where: { organizationId, isActive: true },
              select: { id: true },
            },
          },
        });
        const listingIds = products.flatMap((product) =>
          product.channelListings.map((listing) => listing.id),
        );
        const stats = await readCurrentReviewListingStats(
          tx,
          organizationId,
          listingIds,
        );
        const countByListingId = new Map(
          stats.map((row) => [row.listingId, row.totalReviews]),
        );
        return products.map(
          (product) =>
            ({
              reviewCount: product.channelListings.reduce(
                (sum, listing) => sum + (countByListingId.get(listing.id) ?? 0),
                0,
              ),
            }) satisfies AGradeReviewRow,
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
