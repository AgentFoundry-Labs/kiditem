import { Inject, Injectable } from '@nestjs/common';
import type { WingRankPlan, WingRankResult } from '@kiditem/shared/advertising-operations';
import type { OperationStagedChunk } from '@kiditem/shared/operation';
import type { OwnerTransaction } from '../../../common/owner-transaction';
import { assembleWingRankCaptures, planWingRank } from '../../domain/wing-rank-operation';
import { advertisingKeywordIdentity } from '@kiditem/shared/advertising-operations';
import { KeywordRankService } from './keyword-rank.service';
import { resolveBusinessDate } from '../../domain/business-date';
import type { RepresentativeKeywordSearchAssignment } from '../../domain/representative-keyword';
import {
  cleanString,
  toNumberOrNull,
} from '../../domain/scrape-row-normalizers';
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
  constructor(
    @Inject(KEYWORD_RANK_REPOSITORY_PORT)
    private readonly keywordRankRepo: KeywordRankRepositoryPort,
    private readonly keywordRank: KeywordRankService,
  ) {}

  /**
   * Wing 판매순위 실행의 계획(`advertising.wing_rank`, KID-362). 키워드 선택은 옛 batch와 같다 — 오늘 아직 안 본 대표 키워드
   * 먼저, 모두 봤으면 전체. 계정 확인은 owner가 한다.
   */
  async planOperation(input: { organizationId: string; channelAccountId: string; keywords?: readonly string[] }): Promise<WingRankPlan> {
    const { selection, assignments } = await this.keywordRank.resolveWingSalesRankSelection(input.organizationId);
    return planWingRank({ channelAccountId: input.channelAccountId, selection, assignments, keywords: input.keywords });
  }

  /** finish 트랜잭션에서 키워드마다 그날 자사 상품 판매순위를 실행 ID와 함께 바꿔 쓴다. */
  async publishOperation(tx: OwnerTransaction, input: {
    organizationId: string;
    operationId: string;
    plan: WingRankPlan;
    chunks: readonly OperationStagedChunk[];
  }): Promise<WingRankResult> {
    const captures = assembleWingRankCaptures(input.plan, input.chunks);
    return this.keywordRankRepo.runInTransaction(tx, async () => {
      let rows = 0;
      let rankedCount = 0;
      for (const entry of input.plan.keywords) {
        const capture = captures.get(advertisingKeywordIdentity(entry.keyword))!;
        const normalized = this.normalizeCapture(
          { keyword: entry.keyword, capturedAt: capture.capturedAt, items: capture.items, pagesScanned: capture.pagesScanned, collectedCount: capture.items.length, totalResults: null },
          entry.targets.map((target) => ({ ...target, keyword: entry.keyword })),
          input.organizationId,
        );
        rows += await this.keywordRankRepo.replaceWingSalesRankSnapshots(
          normalized.rows.map((row) => ({ ...row, operationId: input.operationId })),
        );
        rankedCount += normalized.rankedCount;
      }
      return { keywords: input.plan.keywords.length, rows, rankedCount };
    });
  }

  normalizeCapture(
    entry: {
      keyword: string;
      capturedAt: string;
      items: unknown;
      pagesScanned: number;
      collectedCount: number;
      totalResults: number | null;
    },
    targets: RepresentativeKeywordSearchAssignment[],
    organizationId: string,
  ) {
    const keyword = entry.keyword;
    const capturedAt = new Date(entry.capturedAt);
    const businessDate = resolveBusinessDate(
      entry.capturedAt,
      entry.capturedAt,
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
    const rows: Omit<ReplaceWingSalesRankSnapshotInput, 'operationId'>[] =
      targets.map((target) => {
        const item = bestByVendorItemId.get(target.vendorItemId) ?? null;
        return {
          organizationId,
          keyword,
          vendorItemId: target.vendorItemId,
          businessDate,
          productId: item?.productId ?? null,
          itemId: item?.itemId ?? null,
          productName: item?.productName ?? target.productName,
          categoryHierarchy: item?.categoryHierarchy ?? target.category ?? null,
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

    const rankedCount = rows.filter((row) => row.salesRank !== null).length;
    return {
      rows,
      items,
      capturedAt,
      businessDate,
      rankedCount,
      outOfRangeCount: rows.length - rankedCount,
    };
  }
}

function parseItems(raw: unknown): ParsedWingSalesItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((candidate, index) => {
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      Array.isArray(candidate)
    ) {
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
