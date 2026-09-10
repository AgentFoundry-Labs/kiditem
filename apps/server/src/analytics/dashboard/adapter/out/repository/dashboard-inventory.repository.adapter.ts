// Inventory-side read model for the dashboard. Encapsulates the Prisma
// reads behind the inventory tile: grade counts, unread alerts, active
// product counts, per-listing profit metrics (shared helper), inventory
// Sellpia zero-stock and channel-SKU mapping-attention counts, last-7d grade history,
// low-CTR thumbnail count, and A-grade master products with their
// channel-listing review counts.
//
// 2-hop joins (A-grade review fetch) bind organization on both
// MasterProduct and ChannelListing both bind organizationId.

import { Inject, Injectable } from '@nestjs/common';
import { ProductAbcFormulaPayloadSchema } from '@kiditem/shared/product-abc';
import {
  isChannelListingOnSale,
  resolveChannelListingSaleStatus,
} from '@kiditem/shared/channel-listing';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { buildPerListingMetrics } from '../../../../../common/per-listing-profit';
import {
  MASTER_PRODUCT_PROFITABILITY_READ_PORT,
  type ProfitabilityEvidence,
  type ProfitabilityEvidenceSnapshot,
} from '../../../../../finance/application/port/in/master-product-profitability-read.port';
import { productAbcDisplayStatus } from '../../../../../products/domain/product-abc-display-status';
import type { DashboardAlertItem } from '@kiditem/shared/dashboard';
import type {
  DashboardInventoryRepositoryPort,
  AbcContributionRow,
  AbcStatusCountRow,
  AbcStatusCounts,
  DashboardPerListingMetrics,
  GradeCountRow,
  GradeChangeRow,
  AGradeReviewRow,
} from '../../../application/port/out/repository/dashboard-inventory.repository.port';

@Injectable()
export class DashboardInventoryRepositoryAdapter
  implements DashboardInventoryRepositoryPort
{
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MASTER_PRODUCT_PROFITABILITY_READ_PORT)
    private readonly evidence: ProfitabilityEvidence,
  ) {}

  async countActiveProductsByGrade(
    organizationId: string,
  ): Promise<GradeCountRow[]> {
    const rows = await this.prisma.masterProduct.groupBy({
      by: ['abcGrade'],
      _count: { id: true },
      where: {
        organizationId,
        isActive: true,
        abcGrade: { in: ['A', 'B', 'C'] },
      },
    });
    return rows.map((r) => ({
      abcGrade: r.abcGrade,
      count: r._count.id,
    } satisfies GradeCountRow));
  }

  async countActiveProductsByAbcStatus(
    organizationId: string,
  ): Promise<AbcStatusCounts> {
    const kst = new Date(Date.now() + 9 * 60 * 60 * 1_000);
    const targetCutoff = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 0)).toISOString().slice(0, 10);
    const [rows, evidence] = await Promise.all([
      this.prisma.masterProduct.findMany({
        where: { organizationId, isActive: true },
        select: { id: true, abcEvaluation: { select: { id: true } } },
      }),
      this.evidence.load({ organizationId, targetCutoff }),
    ]);
    const products = new Map(evidence.products.map((product) => [product.masterProductId, product]));
    const counts = new Map<AbcStatusCountRow['displayStatus'], number>();
    for (const row of rows) {
      const displayStatus = productAbcDisplayStatus(
        row.abcEvaluation !== null,
        products.get(row.id)?.mappingValid ?? false,
        { ...evidence.sources, actualCutoff: evidence.actualCutoff },
        products.get(row.id)?.saleStartDate ?? null,
      );
      counts.set(displayStatus, (counts.get(displayStatus) ?? 0) + 1);
    }
    return {
      rows: [...counts].map(([displayStatus, count]) => ({ displayStatus, count })),
      // The evaluation's own as-of, published beside the counts so the read
      // model never has to guess how old a stored grade is.
      evaluatedAsOf: {
        targetCutoff,
        actualCutoff: evidence.actualCutoff,
        capturedAt: latestCapturedAt(evidence),
      },
    } satisfies AbcStatusCounts;
  }

  async findActiveAbcContributions(
    organizationId: string,
  ): Promise<AbcContributionRow[]> {
    const rows = await this.prisma.masterProductAbcEvaluation.findMany({
      where: { organizationId, masterProduct: { is: { organizationId, isActive: true } } },
      select: {
        weightedOperatingProfit: true,
        masterProduct: { select: { abcGrade: true } },
      },
    });
    return rows.map((row) => ({
      abcGrade: row.masterProduct.abcGrade,
      weightedOperatingProfit: row.weightedOperatingProfit.toNumber(),
    } satisfies AbcContributionRow));
  }

  countUnclassifiedActiveProducts(organizationId: string): Promise<number> {
    return this.prisma.masterProduct.count({
      where: {
        organizationId,
        isActive: true,
        abcGrade: null,
      },
    });
  }

  async findAbcFormula(
    organizationId: string,
  ) {
    const state = await this.prisma.masterProductAbcFormulaState.findUnique({
      where: { organizationId },
      include: { activeFormulaVersion: { select: { formulaJson: true } }, },
    });
    const formula = state?.activeFormulaVersion
      ? ProductAbcFormulaPayloadSchema.safeParse(state.activeFormulaVersion.formulaJson)
      : null;
    return formula?.success ? formula.data : null;
  }

  async findUnreadAlerts(
    organizationId: string,
    limit: number,
  ): Promise<DashboardAlertItem[]> {
    const rows = await this.prisma.alert.findMany({
      where: { organizationId, isRead: false },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((a) => ({
      id: a.id,
      kind: a.kind as DashboardAlertItem['kind'],
      status: a.status as DashboardAlertItem['status'],
      type: a.type,
      severity: a.severity,
      title: a.title,
      message: a.message,
      sourceType: a.sourceType,
      href: a.href,
      targetType: a.targetType,
      targetId: a.targetId,
      isRead: a.isRead,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    } satisfies DashboardAlertItem));
  }

  async countActiveProducts(organizationId: string): Promise<number> {
    return this.prisma.masterProduct.count({
      where: { organizationId, isActive: true },
    });
  }

  fetchPerListingMetrics(
    organizationId: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<DashboardPerListingMetrics[]> {
    return buildPerListingMetrics(this.prisma, organizationId, monthStart, monthEnd);
  }

  countOutOfStockMasterProducts(organizationId: string): Promise<number> {
    return this.prisma.sellpiaInventorySku.count({
      where: {
        organizationId,
        isActive: true,
        currentStock: 0,
      },
    });
  }

  async getSellingChannelMappingSummary(
    organizationId: string,
  ) {
    const listings = await this.prisma.channelListing.findMany({
      where: {
        organizationId,
        channelAccount: {
          is: {
            organizationId,
            status: 'active',
            channel: { in: ['coupang', 'rocket'] },
          },
        },
      },
      select: {
        isActive: true,
        status: true,
        rawJson: true,
        channelListingDailySnapshots: {
          where: { organizationId },
          orderBy: [{ businessDate: 'desc' }, { lastObservedAt: 'desc' }],
          take: 1,
          select: { saleStatus: true },
        },
        options: {
          where: { organizationId },
          select: {
            status: true,
            inventoryComponents: {
              where: { organizationId },
              select: {
                sellpiaInventorySku: {
                  select: {
                    isActive: true,
                    currentStock: true,
                    masterProductId: true,
                    masterProduct: { select: { isActive: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    let unmatched = 0;
    let needsReview = 0;
    let matched = 0;
    const linkedMasterProductIds = new Set<string>();
    for (const listing of listings) {
      const saleStatus = resolveChannelListingSaleStatus({
        latestSnapshotStatus: listing.channelListingDailySnapshots[0]?.saleStatus,
        rawStatus: rawSaleStatus(listing.rawJson),
        optionStatuses: listing.options.map((option) => option.status),
        listingStatus: listing.status,
        isActive: listing.isActive,
      });
      if (!isChannelListingOnSale(saleStatus)) continue;
      for (const option of listing.options) {
        if (option.inventoryComponents.length === 0) {
          unmatched += 1;
        } else if (option.inventoryComponents.some(
          (component) => component.sellpiaInventorySku.isActive === false,
        )) {
          needsReview += 1;
        } else {
          matched += 1;
        }
        for (const component of option.inventoryComponents) {
          const sku = component.sellpiaInventorySku;
          if (
            sku.isActive
            && sku.currentStock > 0
            && sku.masterProduct?.isActive
            && sku.masterProductId
          ) {
            linkedMasterProductIds.add(sku.masterProductId);
          }
        }
      }
    }
    return {
      linkedMasterProductCount: linkedMasterProductIds.size,
      mappingStatusRows: [
        { mappingStatus: 'unmatched', count: unmatched },
        { mappingStatus: 'needs_review', count: needsReview },
        { mappingStatus: 'matched', count: matched },
      ],
    };
  }

  async findGradeHistory(
    organizationId: string,
    since: Date,
  ): Promise<GradeChangeRow[]> {
    return this.prisma.masterProductAbcGradeHistory.findMany({
      where: { organizationId, calculatedAt: { gte: since } },
      select: { oldGrade: true, newGrade: true },
    });
  }

  async countLowCtrThumbnails(organizationId: string): Promise<number> {
    return this.prisma.thumbnail.count({
      where: { organizationId, ctr: { lt: 1.5, gt: 0 } },
    });
  }

  async findAGradeReviewCounts(
    organizationId: string,
  ): Promise<AGradeReviewRow[]> {
    // 2-hop tenant scope: master.organizationId +
    // listings.organizationId on the nested filter.
    const products = await this.prisma.masterProduct.findMany({
      where: {
        organizationId,
        isActive: true,
        abcGrade: 'A',
      },
      select: {
        channelListings: {
          where: { organizationId, isActive: true },
          select: { _count: { select: { reviews: true } } },
        },
      },
    });
    return products.map((product) => ({
      reviewCount: product.channelListings.reduce(
        (sum, listing) => sum + listing._count.reviews,
        0,
      ),
    } satisfies AGradeReviewRow));
  }
}

/**
 * The newest capture time across the source generations behind one
 * profitability evidence snapshot. A snapshot is only as recently observed as
 * its most recent source read, and either source may publish none.
 */
function latestCapturedAt(evidence: ProfitabilityEvidenceSnapshot): string | null {
  const captures = [
    evidence.sourceVector.sellpia.capturedAt,
    evidence.sourceVector.advertising.capturedAt,
  ].filter((value): value is string => value !== null);
  return captures.reduce<string | null>(
    (latest, value) => (latest === null || value > latest ? value : latest),
    null,
  );
}

function rawSaleStatus(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of ['saleStatus', 'salesStatus', 'sale_status', '판매상태']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}
