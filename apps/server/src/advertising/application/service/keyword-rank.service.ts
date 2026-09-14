// Application service for `/api/ads/keyword-rank/*` — 키워드 트래커 CRUD 와
// 순위 추이/최신 SERP 읽기. ingest 는 `KeywordRankIngestHandler` 가
// the keyword source-owner repository and handler.

import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  deriveRankChange,
  type ProductKeywordRankOverviewResponse,
  type ProductKeywordRankRow as SharedProductKeywordRankRow,
} from '@kiditem/shared/advertising';
import {
  buildRepresentativeKeywordAssignments,
  buildRepresentativeKeywordSearchAssignments,
} from "../../domain/representative-keyword";
import { currentBusinessDate } from "../../domain/business-date";
import { addDays, businessDateKey } from '../../../common/kst';
import { isNewerAttempt } from '../../../common/current-row';
import {
  KEYWORD_RANK_REPOSITORY_PORT,
  type KeywordRankRepositoryPort,
  type KeywordTrackerRow,
  type UpdateKeywordTrackerInput,
  type UpsertKeywordTrackerInput,
} from "../port/out/repository/keyword-rank.repository.port";
import type { ProductAbcGrade } from "@kiditem/shared/product-abc";

type ProductKeywordRankPresentation =
  "rising" | "falling" | "steady" | "out_of_range" | "not_collected";

type ProductKeywordRankRow = Omit<
  SharedProductKeywordRankRow,
  'capturedAt'
> & { capturedAt: Date | null };

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
  async getProductRankOverview(
    days: number,
    organizationId: string,
  ): Promise<ProductKeywordRankOverviewResponse> {
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
      const previousDate = latest
        ? addDays(latest.businessDate, -1)
        : null;
      const previous = previousDate
        ? historyRows.find(
            (row) => row.businessDate.getTime() === previousDate.getTime(),
          ) ?? null
        : null;
      const currentSalesRank = latest?.salesRank ?? null;
      const previousSalesRank = previous?.salesRank ?? null;
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
        abcGrades: ownItem?.abcGrade ? [ownItem.abcGrade] : [],
        currentSalesRank,
        previousSalesRank,
        salesLast28d: latest?.salesLast28d ?? null,
        viewsLast28d: latest?.viewsLast28d ?? null,
        revenueLast28d: latest?.revenueLast28d ?? null,
        conversionRate28d: latest?.conversionRate28d ?? null,
        salePrice: latest?.salePrice ?? null,
        reviewCount: latest?.reviewCount ?? null,
        collectedCount: latest?.collectedCount ?? null,
        totalResults: latest?.totalResults ?? null,
        businessDate: latest
          ? businessDateKey(latest.businessDate)
          : null,
        capturedAt: latest?.capturedAt ?? null,
        history: historyRows.map((row) => ({
          businessDate: businessDateKey(row.businessDate),
          salesRank: row.salesRank,
          salesLast28d: row.salesLast28d,
        })),
      } satisfies ProductKeywordRankRow);
    }

    const visibleRows = collapseDuplicateProductNames(rows, ownByVendorItemId);
    visibleRows.sort(
      (a, b) =>
        rankStatusPriority(rankPresentation(a)) -
          rankStatusPriority(rankPresentation(b)) ||
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
        risingCount: visibleRows.filter(
          (row) => rankPresentation(row) === 'rising',
        ).length,
        fallingCount: visibleRows.filter(
          (row) => rankPresentation(row) === 'falling',
        ).length,
        outOfRangeCount: visibleRows.filter(
          (row) => rankPresentation(row) === "out_of_range",
        ).length,
        notCollectedCount: visibleRows.filter(
          (row) => rankPresentation(row) === "not_collected",
        ).length,
      },
      rows: visibleRows,
    } satisfies ProductKeywordRankOverviewResponse;
  }

  /** 확장이 한 번의 Wing 조회로 같은 대표 키워드 상품을 함께 처리하도록 그룹화. */
  async getWingSalesRankTargets(organizationId: string) {
    return (await this.resolveWingSalesRankSelection(organizationId)).selection;
  }

  async resolveWingSalesRankSelection(organizationId: string) {
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
    const todayKey = businessDateKey(currentBusinessDate());
    const collectedToday = new Set(
      snapshots
        .filter(
          (snapshot) =>
            businessDateKey(snapshot.businessDate) === todayKey,
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
        phase:
          target.primaryVendorItemIds.size > 0
            ? ("primary" as const)
            : ("comparison" as const),
        maxPages: 5 as const,
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
    const selection = {
      productCount: deduped.length,
      candidateCount: assignments.length,
      keywordCount: allTargets.length,
      targetKeywordCount: targets.length,
      resumed:
        pendingTargets.length > 0 && pendingTargets.length < allTargets.length,
      pendingProductCount: pendingVendorItemIds.size,
      targets,
    };
    return { selection, assignments };
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
        businessDate: businessDateKey(row.businessDate),
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
      businessDate: businessDateKey(snapshot.businessDate),
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
    id: string;
    vendorItemId: string;
    categoryHierarchy: string | null;
    capturedAt: Date;
    updatedAt: Date;
  }>,
): T[] {
  const latest = new Map<string, {
    id: string;
    category: string;
    capturedAt: Date;
    updatedAt: Date;
  }>();
  for (const snapshot of snapshots) {
    if (!snapshot.categoryHierarchy) continue;
    const previous = latest.get(snapshot.vendorItemId);
    if (!previous || isNewerAttempt(
      { observedAt: snapshot.capturedAt, importedAt: snapshot.updatedAt, id: snapshot.id },
      { observedAt: previous.capturedAt, importedAt: previous.updatedAt, id: previous.id },
    )) {
      latest.set(snapshot.vendorItemId, {
        id: snapshot.id,
        category: snapshot.categoryHierarchy,
        capturedAt: snapshot.capturedAt,
        updatedAt: snapshot.updatedAt,
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
    rankStatusPriority(rankPresentation(a)) -
      rankStatusPriority(rankPresentation(b)) ||
    (a.currentSalesRank ?? Number.MAX_SAFE_INTEGER) -
      (b.currentSalesRank ?? Number.MAX_SAFE_INTEGER) ||
    (b.salesLast28d ?? -1) - (a.salesLast28d ?? -1) ||
    (b.capturedAt?.getTime() ?? 0) - (a.capturedAt?.getTime() ?? 0) ||
    a.vendorItemId.localeCompare(b.vendorItemId)
  );
}

function rankPresentation(
  row: Pick<
    ProductKeywordRankRow,
    'businessDate' | 'currentSalesRank' | 'previousSalesRank'
  >,
): ProductKeywordRankPresentation {
  if (row.businessDate === null) return 'not_collected';
  if (row.currentSalesRank === null) return 'out_of_range';
  return deriveRankChange(row.currentSalesRank, row.previousSalesRank)
    .direction ?? 'steady';
}

function rankStatusPriority(status: ProductKeywordRankPresentation): number {
  const priorities: Record<ProductKeywordRankPresentation, number> = {
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
