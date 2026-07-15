import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ExtensionSyncDto } from '../../adapter/in/http/dto';
import { resolveBusinessDate } from '../../domain/business-date';
import {
  buildRepresentativeKeywordSearchAssignments,
  type RepresentativeKeywordSearchAssignment,
} from '../../domain/representative-keyword';
import { cleanString, toNumberOrNull } from '../../domain/scrape-row-normalizers';
import {
  KEYWORD_RANK_REPOSITORY_PORT,
  type KeywordRankRepositoryPort,
  type ReplaceWingSalesRankSnapshotInput,
} from '../port/out/repository/keyword-rank.repository.port';

interface ParsedWingSalesItem {
  productId: string | null;
  itemId: string | null;
  vendorItemId: string | null;
  productName: string | null;
  categoryHierarchy: string | null;
  salesRank: number;
  salesLast28d: number | null;
  viewsLast28d: number | null;
  revenueLast28d: number | null;
  conversionRate28d: number | null;
  salePrice: number | null;
  reviewCount: number | null;
}

/** Wing pre-matching 상품분석의 최근 28일 판매량순 결과를 자사 상품에 투영. */
@Injectable()
export class WingSalesRankIngestHandler {
  private readonly logger = new Logger(WingSalesRankIngestHandler.name);

  constructor(
    @Inject(KEYWORD_RANK_REPOSITORY_PORT)
    private readonly keywordRankRepo: KeywordRankRepositoryPort,
  ) {}

  async execute(payload: ExtensionSyncDto, organizationId: string) {
    const [ownItems, overrides, previousSnapshots] = await Promise.all([
      this.keywordRankRepo.listOwnVendorItems(organizationId),
      this.keywordRankRepo.listRepresentativeKeywordOverrides(organizationId),
      this.keywordRankRepo.findWingSalesRankSnapshots(organizationId, 365),
    ]);
    const manualKeywordByVendorItemId = new Map(
      overrides.map((override) => [override.vendorItemId, override.keyword]),
    );
    const products = applyObservedCategories(
      dedupeOwnItems(ownItems),
      previousSnapshots,
    );
    const assignments = buildRepresentativeKeywordSearchAssignments(
      products,
      manualKeywordByVendorItemId,
    );
    const assignmentsByKeyword = groupAssignments(assignments);
    const results: Array<{
      keyword: string;
      businessDate: string;
      productCount: number;
      rankedCount: number;
      outOfRangeCount: number;
    }> = [];

    for (const candidate of payload.data ?? []) {
      if (!candidate || typeof candidate !== 'object') continue;
      const entry = candidate as Record<string, unknown>;
      const keyword = cleanString(entry.keyword);
      if (!keyword) continue;
      const targets = assignmentsByKeyword.get(keyword) ?? [];
      if (targets.length === 0) {
        this.logger.warn(
          `wing_sales_rank ingest skipped keyword without own targets (${keyword})`,
        );
        continue;
      }

      const capturedAtRaw = cleanString(entry.capturedAt) ?? payload.timestamp;
      const parsedAt = capturedAtRaw ? new Date(capturedAtRaw) : null;
      const capturedAt =
        parsedAt && Number.isFinite(parsedAt.getTime()) ? parsedAt : new Date();
      const businessDate = resolveBusinessDate(
        cleanString(entry.capturedAt),
        payload.timestamp,
      );
      const items = parseItems(entry.items);
      const bestByVendorItemId = new Map<string, ParsedWingSalesItem>();
      for (const item of items) {
        if (!item.vendorItemId) continue;
        const previous = bestByVendorItemId.get(item.vendorItemId);
        if (!previous || item.salesRank < previous.salesRank) {
          bestByVendorItemId.set(item.vendorItemId, item);
        }
      }

      const pagesScanned = toNumberOrNull(entry.pagesScanned) ?? 0;
      const collectedCount = toNumberOrNull(entry.collectedCount) ?? items.length;
      const totalResults = toNumberOrNull(entry.totalResults);
      const keywordMetrics = aggregateKeywordMetrics(items);
      const rows: ReplaceWingSalesRankSnapshotInput[] = targets.map((target) => {
        const item = bestByVendorItemId.get(target.vendorItemId) ?? null;
        return {
          organizationId,
          keyword,
          vendorItemId: target.vendorItemId,
          businessDate,
          productId: item?.productId ?? null,
          itemId: item?.itemId ?? null,
          productName: item?.productName ?? target.productName,
          categoryHierarchy:
            item?.categoryHierarchy ?? target.category ?? null,
          salesRank: item?.salesRank ?? null,
          salesLast28d: item?.salesLast28d ?? null,
          viewsLast28d: item?.viewsLast28d ?? null,
          revenueLast28d: item?.revenueLast28d ?? null,
          conversionRate28d: item?.conversionRate28d ?? null,
          salePrice: item?.salePrice ?? null,
          reviewCount: item?.reviewCount ?? null,
          keywordSalesLast28d: keywordMetrics.salesLast28d,
          keywordViewsLast28d: keywordMetrics.viewsLast28d,
          keywordConversionRate28d: keywordMetrics.conversionRate28d,
          pagesScanned,
          collectedCount,
          totalResults,
          capturedAt,
        };
      });
      await this.keywordRankRepo.replaceWingSalesRankSnapshots(rows);
      const rankedCount = rows.filter((row) => row.salesRank !== null).length;
      results.push({
        keyword,
        businessDate: businessDate.toISOString().slice(0, 10),
        productCount: rows.length,
        rankedCount,
        outOfRangeCount: rows.length - rankedCount,
      });
    }

    return { success: true, results };
  }
}

function parseItems(raw: unknown): ParsedWingSalesItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return [];
    }
    const row = candidate as Record<string, unknown>;
    const salesRank = toNumberOrNull(row.salesRank) ?? index + 1;
    return [
      {
        productId: cleanString(row.productId),
        itemId: cleanString(row.itemId),
        vendorItemId: cleanString(row.vendorItemId),
        productName: cleanString(row.productName),
        categoryHierarchy: cleanString(row.categoryHierarchy),
        salesRank,
        salesLast28d: toNumberOrNull(row.salesLast28d),
        viewsLast28d: toNumberOrNull(row.pvLast28Day),
        revenueLast28d: toNumberOrNull(row.estimatedRevenue28d),
        conversionRate28d:
          typeof row.conversionRate28d === 'number' &&
          Number.isFinite(row.conversionRate28d)
            ? row.conversionRate28d
            : null,
        salePrice: toNumberOrNull(row.salePrice),
        reviewCount: toNumberOrNull(row.ratingCount),
      },
    ];
  });
}

function dedupeOwnItems<T extends { vendorItemId: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.vendorItemId, item])).values()];
}

function groupAssignments(
  assignments: RepresentativeKeywordSearchAssignment[],
) {
  const grouped = new Map<string, RepresentativeKeywordSearchAssignment[]>();
  for (const assignment of assignments) {
    const rows = grouped.get(assignment.keyword) ?? [];
    rows.push(assignment);
    grouped.set(assignment.keyword, rows);
  }
  return grouped;
}

function applyObservedCategories<
  T extends {
    vendorItemId: string;
    category: string | null;
  },
>(
  products: T[],
  snapshots: Array<{
    vendorItemId: string;
    categoryHierarchy: string | null;
    capturedAt: Date;
  }>,
): T[] {
  const latestCategory = new Map<string, { value: string; capturedAt: Date }>();
  for (const snapshot of snapshots) {
    if (!snapshot.categoryHierarchy) continue;
    const previous = latestCategory.get(snapshot.vendorItemId);
    if (!previous || snapshot.capturedAt > previous.capturedAt) {
      latestCategory.set(snapshot.vendorItemId, {
        value: snapshot.categoryHierarchy,
        capturedAt: snapshot.capturedAt,
      });
    }
  }
  return products.map((product) => ({
    ...product,
    category:
      product.category ?? latestCategory.get(product.vendorItemId)?.value ?? null,
  }));
}

function aggregateKeywordMetrics(items: ParsedWingSalesItem[]) {
  const salesRows = items.filter((item) => item.salesLast28d !== null);
  const viewRows = items.filter((item) => item.viewsLast28d !== null);
  const salesLast28d =
    salesRows.length > 0
      ? salesRows.reduce((sum, item) => sum + (item.salesLast28d ?? 0), 0)
      : null;
  const viewsLast28d =
    viewRows.length > 0
      ? viewRows.reduce((sum, item) => sum + (item.viewsLast28d ?? 0), 0)
      : null;
  return {
    salesLast28d,
    viewsLast28d,
    conversionRate28d:
      salesLast28d !== null && viewsLast28d !== null && viewsLast28d > 0
        ? salesLast28d / viewsLast28d
        : null,
  };
}
