// Application service for `/api/ads/keyword-rank/*` — 키워드 트래커 CRUD 와
// 순위 추이/최신 SERP 읽기. ingest 는 `KeywordRankIngestHandler` 가
// `AdSyncService.sync` dispatch 를 통해 처리한다.

import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  buildRepresentativeKeywordAssignments,
  buildRepresentativeKeywordSearchAssignments,
  type RepresentativeKeywordCandidate,
  type RepresentativeKeywordSource,
} from "../../domain/representative-keyword";
import { currentBusinessDate } from "../../domain/business-date";
import {
  KEYWORD_RANK_REPOSITORY_PORT,
  type KeywordRankRepositoryPort,
  type KeywordTrackerRow,
  type UpdateKeywordTrackerInput,
  type UpsertKeywordTrackerInput,
} from "../port/out/repository/keyword-rank.repository.port";
import {
  PRODUCT_VARIANT_ABC_GRADE_READ_PORT,
  type ProductVariantAbcGradeReadPort,
} from "../../../products/application/port/in/product-variant-abc-grade-read.port";
import type { ProductAbcGrade } from "@kiditem/shared/product-abc";

export type ProductKeywordRankStatus =
  "rising" | "falling" | "steady" | "out_of_range" | "not_collected";

export interface ProductKeywordRankRow {
  keyword: string;
  keywordSource: RepresentativeKeywordSource;
  keywordScore: number | null;
  recommendationReason: string;
  automaticKeyword: string;
  category: string | null;
  candidates: RepresentativeKeywordCandidate[];
  vendorItemId: string;
  /** 같은 쿠팡 상품명으로 묶인 전체 옵션ID. 화면 검색과 중복 표시용. */
  groupedVendorItemIds: string[];
  groupedOptionCount: number;
  skuId: string | null;
  productName: string | null;
  /** 연결된 운영 상품의 저장된 자동 ABC 등급. 미분류는 빈 배열. */
  abcGrades: ProductAbcGrade[];
  currentSalesRank: number | null;
  previousSalesRank: number | null;
  rankChange: number | null;
  salesLast28d: number | null;
  viewsLast28d: number | null;
  revenueLast28d: number | null;
  conversionRate28d: number | null;
  salePrice: number | null;
  reviewCount: number | null;
  collectedCount: number | null;
  totalResults: number | null;
  businessDate: string | null;
  capturedAt: Date | null;
  status: ProductKeywordRankStatus;
  history: Array<{
    businessDate: string;
    salesRank: number | null;
    salesLast28d: number | null;
  }>;
}

export interface KeywordRankHistoryPoint {
  businessDate: string;
  overallRank: number | null;
  organicRank: number | null;
  adRank: number | null;
  page: number | null;
}

export interface KeywordRankHistorySeries {
  vendorItemId: string;
  productName: string | null;
  isOwn: boolean;
  points: KeywordRankHistoryPoint[];
}

@Injectable()
export class KeywordRankService {
  constructor(
    @Inject(KEYWORD_RANK_REPOSITORY_PORT)
    private readonly keywordRankRepo: KeywordRankRepositoryPort,
    @Inject(PRODUCT_VARIANT_ABC_GRADE_READ_PORT)
    private readonly productVariantAbcGrades: ProductVariantAbcGradeReadPort,
  ) {}

  listTrackers(organizationId: string): Promise<KeywordTrackerRow[]> {
    return this.keywordRankRepo.listTrackers(organizationId);
  }

  createTracker(
    input: UpsertKeywordTrackerInput,
    organizationId: string,
  ): Promise<KeywordTrackerRow> {
    return this.keywordRankRepo.upsertTrackerByKeyword(
      {
        keyword: input.keyword.trim(),
        vendorItemIds: input.vendorItemIds,
        maxPages: input.maxPages,
      },
      organizationId,
    );
  }

  updateTracker(
    id: string,
    patch: UpdateKeywordTrackerInput,
    organizationId: string,
  ): Promise<KeywordTrackerRow> {
    return this.keywordRankRepo.updateTracker(id, organizationId, patch);
  }

  deleteTracker(
    id: string,
    organizationId: string,
  ): Promise<KeywordTrackerRow> {
    return this.keywordRankRepo.deleteTracker(id, organizationId);
  }

  async setRepresentativeKeyword(
    vendorItemId: string,
    keyword: string,
    organizationId: string,
  ) {
    const ownsProduct = await this.keywordRankRepo.hasOwnVendorItem(
      organizationId,
      vendorItemId,
    );
    if (!ownsProduct) throw new NotFoundException("Coupang product not found");
    return this.keywordRankRepo.upsertRepresentativeKeywordOverride(
      organizationId,
      vendorItemId,
      keyword.trim(),
    );
  }

  async resetRepresentativeKeyword(
    vendorItemId: string,
    organizationId: string,
  ) {
    const ownsProduct = await this.keywordRankRepo.hasOwnVendorItem(
      organizationId,
      vendorItemId,
    );
    if (!ownsProduct) throw new NotFoundException("Coupang product not found");
    const deleted =
      await this.keywordRankRepo.deleteRepresentativeKeywordOverride(
        organizationId,
        vendorItemId,
      );
    return { vendorItemId, reset: deleted > 0 };
  }

  /** 자사 카탈로그 전체의 대표 키워드별 Wing 최근 28일 판매량순 현황. */
  async getProductRankOverview(days: number, organizationId: string) {
    const [overrides, ownItems, snapshots] = await Promise.all([
      this.keywordRankRepo.listRepresentativeKeywordOverrides(organizationId),
      this.keywordRankRepo.listOwnVendorItems(organizationId),
      this.keywordRankRepo.findWingSalesRankSnapshots(organizationId, days),
    ]);
    const dedupedOwnItems = [
      ...new Map(ownItems.map((item) => [item.vendorItemId, item])).values(),
    ];
    const ownByVendorItemId = new Map(
      dedupedOwnItems.map((item) => [item.vendorItemId, item]),
    );
    const abcGradesByVariant =
      await this.productVariantAbcGrades.findAbcGradesByProductVariantIds({
        organizationId,
        productVariantIds: [
          ...new Set(
            dedupedOwnItems.flatMap((item) =>
              item.productVariantId ? [item.productVariantId] : [],
            ),
          ),
        ],
      });
    const products = applyObservedCategories(dedupedOwnItems, snapshots);
    const manualKeywordByVendorItemId = new Map(
      overrides.map((override) => [override.vendorItemId, override.keyword]),
    );
    const assignments = buildRepresentativeKeywordAssignments(
      products,
      manualKeywordByVendorItemId,
      snapshots.map((snapshot) => ({
        vendorItemId: snapshot.vendorItemId,
        keyword: snapshot.keyword,
        salesRank: snapshot.salesRank,
        keywordSalesLast28d: snapshot.keywordSalesLast28d,
        keywordViewsLast28d: snapshot.keywordViewsLast28d,
        keywordConversionRate28d: snapshot.keywordConversionRate28d,
      })),
    );
    const snapshotsByTarget = new Map<string, typeof snapshots>();

    for (const snapshot of snapshots) {
      const key = targetKey(snapshot.keyword, snapshot.vendorItemId);
      const existing = snapshotsByTarget.get(key) ?? [];
      existing.push(snapshot);
      snapshotsByTarget.set(key, existing);
    }

    const rows: ProductKeywordRankRow[] = [];
    for (const assignment of assignments) {
      const historyRows =
        snapshotsByTarget.get(
          targetKey(assignment.keyword, assignment.vendorItemId),
        ) ?? [];
      const latest = historyRows.at(-1) ?? null;
      const previous = historyRows.at(-2) ?? null;
      const currentSalesRank = latest?.salesRank ?? null;
      const previousSalesRank = previous?.salesRank ?? null;
      const rankChange =
        currentSalesRank !== null && previousSalesRank !== null
          ? previousSalesRank - currentSalesRank
          : null;
      const status: ProductKeywordRankStatus = !latest
        ? "not_collected"
        : currentSalesRank === null
          ? "out_of_range"
          : rankChange === null || rankChange === 0
            ? "steady"
            : rankChange > 0
              ? "rising"
              : "falling";
      const ownItem = ownByVendorItemId.get(assignment.vendorItemId);

      rows.push({
        keyword: assignment.keyword,
        keywordSource: assignment.source,
        keywordScore: assignment.score,
        recommendationReason: assignment.recommendationReason,
        automaticKeyword: assignment.automaticKeyword,
        category: assignment.category,
        candidates: assignment.candidates,
        vendorItemId: assignment.vendorItemId,
        groupedVendorItemIds: [assignment.vendorItemId],
        groupedOptionCount: 1,
        skuId: ownItem?.skuId ?? null,
        // 자사 카탈로그의 상품명(channelName=등록/노출상품명)을 우선한다.
        // Wing 스냅샷 productName 은 SERP 수집 과정에서 옵션값("1개")이 섞여
        // 들어오는 경우가 있어 후순위로 둔다.
        productName: ownItem?.productName ?? latest?.productName ?? null,
        abcGrades: ownItem?.productVariantId
          ? (abcGradesByVariant.get(ownItem.productVariantId) ?? [])
          : [],
        currentSalesRank,
        previousSalesRank,
        rankChange,
        salesLast28d: latest?.salesLast28d ?? null,
        viewsLast28d: latest?.viewsLast28d ?? null,
        revenueLast28d: latest?.revenueLast28d ?? null,
        conversionRate28d: latest?.conversionRate28d ?? null,
        salePrice: latest?.salePrice ?? null,
        reviewCount: latest?.reviewCount ?? null,
        collectedCount: latest?.collectedCount ?? null,
        totalResults: latest?.totalResults ?? null,
        businessDate: latest
          ? latest.businessDate.toISOString().slice(0, 10)
          : null,
        capturedAt: latest?.capturedAt ?? null,
        status,
        history: historyRows.map((row) => ({
          businessDate: row.businessDate.toISOString().slice(0, 10),
          salesRank: row.salesRank,
          salesLast28d: row.salesLast28d,
        })),
      });
    }

    const visibleRows = collapseDuplicateProductNames(rows, ownByVendorItemId);
    visibleRows.sort(
      (a, b) =>
        rankStatusPriority(a.status) - rankStatusPriority(b.status) ||
        (a.currentSalesRank ?? Number.MAX_SAFE_INTEGER) -
          (b.currentSalesRank ?? Number.MAX_SAFE_INTEGER) ||
        (b.salesLast28d ?? -1) - (a.salesLast28d ?? -1) ||
        a.productName?.localeCompare(b.productName ?? "", "ko") ||
        a.keyword.localeCompare(b.keyword, "ko"),
    );

    return {
      periodDays: days,
      summary: {
        productCount: visibleRows.length,
        optionCount: rows.length,
        duplicateOptionCount: rows.length - visibleRows.length,
        representativeKeywordCount: new Set(
          visibleRows.map((row) => row.keyword),
        ).size,
        rankedCount: visibleRows.filter((row) => row.currentSalesRank !== null)
          .length,
        top20Count: visibleRows.filter(
          (row) => row.currentSalesRank !== null && row.currentSalesRank <= 20,
        ).length,
        risingCount: visibleRows.filter((row) => row.status === "rising")
          .length,
        fallingCount: visibleRows.filter((row) => row.status === "falling")
          .length,
        outOfRangeCount: visibleRows.filter(
          (row) => row.status === "out_of_range",
        ).length,
        notCollectedCount: visibleRows.filter(
          (row) => row.status === "not_collected",
        ).length,
      },
      rows: visibleRows,
    };
  }

  /** 확장이 한 번의 Wing 조회로 같은 대표 키워드 상품을 함께 처리하도록 그룹화. */
  async getWingSalesRankTargets(organizationId: string) {
    const [overrides, ownItems, snapshots] = await Promise.all([
      this.keywordRankRepo.listRepresentativeKeywordOverrides(organizationId),
      this.keywordRankRepo.listOwnVendorItems(organizationId),
      this.keywordRankRepo.findWingSalesRankSnapshots(organizationId, 365),
    ]);
    const deduped = [
      ...new Map(ownItems.map((item) => [item.vendorItemId, item])).values(),
    ];
    const assignments = buildRepresentativeKeywordSearchAssignments(
      applyObservedCategories(deduped, snapshots),
      new Map(
        overrides.map((override) => [override.vendorItemId, override.keyword]),
      ),
    );
    const todayKey = currentBusinessDate().toISOString().slice(0, 10);
    const collectedToday = new Set(
      snapshots
        .filter(
          (snapshot) =>
            snapshot.businessDate.toISOString().slice(0, 10) === todayKey,
        )
        .map((snapshot) => targetKey(snapshot.keyword, snapshot.vendorItemId)),
    );
    const pendingVendorItemIds = new Set(
      assignments
        .filter(
          (assignment) =>
            !collectedToday.has(
              targetKey(assignment.keyword, assignment.vendorItemId),
            ),
        )
        .map((assignment) => assignment.vendorItemId),
    );
    const byKeyword = new Map<
      string,
      {
        vendorItemIds: Set<string>;
        primaryVendorItemIds: Set<string>;
        pendingVendorItemIds: Set<string>;
        pendingPrimaryVendorItemIds: Set<string>;
      }
    >();
    for (const assignment of assignments) {
      const target = byKeyword.get(assignment.keyword) ?? {
        vendorItemIds: new Set<string>(),
        primaryVendorItemIds: new Set<string>(),
        pendingVendorItemIds: new Set<string>(),
        pendingPrimaryVendorItemIds: new Set<string>(),
      };
      target.vendorItemIds.add(assignment.vendorItemId);
      if (assignment.candidateIndex === 0) {
        target.primaryVendorItemIds.add(assignment.vendorItemId);
      }
      if (
        !collectedToday.has(
          targetKey(assignment.keyword, assignment.vendorItemId),
        )
      ) {
        target.pendingVendorItemIds.add(assignment.vendorItemId);
        if (assignment.candidateIndex === 0) {
          target.pendingPrimaryVendorItemIds.add(assignment.vendorItemId);
        }
      }
      byKeyword.set(assignment.keyword, target);
    }
    const allTargets = [...byKeyword.entries()]
      .map(([keyword, target]) => ({
        keyword,
        vendorItemIds: [...target.vendorItemIds],
        productCount: target.vendorItemIds.size,
        primaryProductCount: target.primaryVendorItemIds.size,
        pendingProductCount: target.pendingVendorItemIds.size,
        pendingPrimaryProductCount: target.pendingPrimaryVendorItemIds.size,
        phase: target.primaryVendorItemIds.size > 0 ? "primary" : "comparison",
        maxPages: 5,
      }))
      .sort(
        (a, b) =>
          Number(b.pendingPrimaryProductCount > 0) -
            Number(a.pendingPrimaryProductCount > 0) ||
          Number(b.primaryProductCount > 0) -
            Number(a.primaryProductCount > 0) ||
          b.pendingPrimaryProductCount - a.pendingPrimaryProductCount ||
          b.pendingProductCount - a.pendingProductCount ||
          b.productCount - a.productCount ||
          a.keyword.localeCompare(b.keyword, "ko"),
      );
    const pendingTargets = allTargets.filter(
      (target) => target.pendingProductCount > 0,
    );
    // 같은 날 중단된 실행은 이미 저장한 키워드를 건너뛰고 이어서 수집한다.
    // 오늘 대상이 모두 수집된 뒤 다시 누르면 전체를 새로 갱신한다.
    const targets = pendingTargets.length > 0 ? pendingTargets : allTargets;
    return {
      productCount: deduped.length,
      candidateCount: assignments.length,
      keywordCount: allTargets.length,
      targetKeywordCount: targets.length,
      resumed:
        pendingTargets.length > 0 && pendingTargets.length < allTargets.length,
      pendingProductCount: pendingVendorItemIds.size,
      targets,
    };
  }

  /**
   * 키워드 순위 추이 — vendorItemId 별 시리즈로 그룹. `isOwn` 은 자사
   * Coupang `ChannelListingOption.externalOptionId` 포함 여부. productName 은 최신
   * fact 의 이름을 우선하고, 없으면 자사 카탈로그 이름으로 보충한다.
   */
  async getHistory(keyword: string, days: number, organizationId: string) {
    const [rows, ownItems] = await Promise.all([
      this.keywordRankRepo.findRankHistory(organizationId, keyword, days),
      this.keywordRankRepo.listOwnVendorItems(organizationId),
    ]);
    const ownNameByVendorItemId = new Map(
      ownItems.map((item) => [item.vendorItemId, item.productName]),
    );

    const seriesByVendorItemId = new Map<string, KeywordRankHistorySeries>();
    for (const row of rows) {
      let series = seriesByVendorItemId.get(row.vendorItemId);
      if (!series) {
        series = {
          vendorItemId: row.vendorItemId,
          productName: null,
          isOwn: ownNameByVendorItemId.has(row.vendorItemId),
          points: [],
        };
        seriesByVendorItemId.set(row.vendorItemId, series);
      }
      // 행이 businessDate asc 정렬이므로 마지막 non-null 이름이 최신.
      if (row.productName) series.productName = row.productName;
      series.points.push({
        businessDate: row.businessDate.toISOString().slice(0, 10),
        overallRank: row.overallRank,
        organicRank: row.organicRank,
        adRank: row.adRank,
        page: row.page,
      });
    }
    for (const series of seriesByVendorItemId.values()) {
      if (!series.productName) {
        series.productName =
          ownNameByVendorItemId.get(series.vendorItemId) ?? null;
      }
    }

    return { keyword, series: [...seriesByVendorItemId.values()] };
  }

  /** 키워드 최신 SERP 캡처 + 자사 vendorItemId 목록(경쟁사 대비 하이라이트용). */
  async getLatestSerp(keyword: string, organizationId: string) {
    const snapshot = await this.keywordRankRepo.findLatestSerp(
      organizationId,
      keyword,
    );
    if (!snapshot) {
      return { keyword, items: [], ownVendorItemIds: [] };
    }
    const ownItems =
      await this.keywordRankRepo.listOwnVendorItems(organizationId);
    return {
      keyword,
      businessDate: snapshot.businessDate.toISOString().slice(0, 10),
      capturedAt: snapshot.capturedAt,
      pagesScanned: snapshot.pagesScanned,
      itemCount: snapshot.itemCount,
      items: snapshot.items,
      ownVendorItemIds: ownItems.map((item) => item.vendorItemId),
    };
  }
}

function applyObservedCategories<
  T extends { vendorItemId: string; category: string | null },
>(
  products: T[],
  snapshots: Array<{
    vendorItemId: string;
    categoryHierarchy: string | null;
    capturedAt: Date;
  }>,
): T[] {
  const latest = new Map<string, { category: string; capturedAt: Date }>();
  for (const snapshot of snapshots) {
    if (!snapshot.categoryHierarchy) continue;
    const previous = latest.get(snapshot.vendorItemId);
    if (!previous || snapshot.capturedAt > previous.capturedAt) {
      latest.set(snapshot.vendorItemId, {
        category: snapshot.categoryHierarchy,
        capturedAt: snapshot.capturedAt,
      });
    }
  }
  return products.map((product) => ({
    ...product,
    category:
      product.category ?? latest.get(product.vendorItemId)?.category ?? null,
  }));
}

function targetKey(keyword: string, vendorItemId: string): string {
  return `${keyword}\u0000${vendorItemId}`;
}

function collapseDuplicateProductNames(
  rows: ProductKeywordRankRow[],
  ownByVendorItemId: ReadonlyMap<string, { productName: string }>,
): ProductKeywordRankRow[] {
  const groups = new Map<string, ProductKeywordRankRow[]>();
  for (const row of rows) {
    const catalogName = ownByVendorItemId.get(row.vendorItemId)?.productName;
    const normalizedName = normalizeProductGroupName(
      catalogName ?? row.productName,
    );
    const key = normalizedName
      ? `name:${normalizedName}`
      : `vendor-item:${row.vendorItemId}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => {
    const representative = [...group].sort(compareGroupRepresentatives)[0];
    return {
      ...representative,
      abcGrades: sortAbcGrades(
        new Set(group.flatMap((row) => row.abcGrades)),
      ),
      groupedVendorItemIds: group.map((row) => row.vendorItemId),
      groupedOptionCount: group.length,
    };
  });
}

function sortAbcGrades(
  grades: ReadonlySet<ProductAbcGrade>,
): ProductAbcGrade[] {
  const order: Record<ProductAbcGrade, number> = { A: 0, B: 1, C: 2 };
  return [...grades].sort((left, right) => order[left] - order[right]);
}

function compareGroupRepresentatives(
  a: ProductKeywordRankRow,
  b: ProductKeywordRankRow,
): number {
  return (
    Number(b.keywordSource === "manual_override") -
      Number(a.keywordSource === "manual_override") ||
    Number(b.currentSalesRank !== null) - Number(a.currentSalesRank !== null) ||
    rankStatusPriority(a.status) - rankStatusPriority(b.status) ||
    (a.currentSalesRank ?? Number.MAX_SAFE_INTEGER) -
      (b.currentSalesRank ?? Number.MAX_SAFE_INTEGER) ||
    (b.salesLast28d ?? -1) - (a.salesLast28d ?? -1) ||
    (b.capturedAt?.getTime() ?? 0) - (a.capturedAt?.getTime() ?? 0) ||
    a.vendorItemId.localeCompare(b.vendorItemId)
  );
}

function rankStatusPriority(status: ProductKeywordRankStatus): number {
  const priorities: Record<ProductKeywordRankStatus, number> = {
    rising: 0,
    steady: 1,
    falling: 2,
    out_of_range: 3,
    not_collected: 4,
  };
  return priorities[status];
}

function normalizeProductGroupName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("ko");
}
