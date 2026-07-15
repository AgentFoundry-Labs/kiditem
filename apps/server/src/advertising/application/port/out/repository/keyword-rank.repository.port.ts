// Outgoing port for Coupang keyword rank tracking persistence
// (`CoupangKeywordTracker`, `CoupangKeywordRankDailySnapshot`,
// `CoupangKeywordSerpDailySnapshot`, own-catalog reads on
// `ChannelListing`/`ChannelListingOption`). Application services
// (KeywordRankService, KeywordRankIngestHandler) depend on this contract;
// the Prisma-backed adapter lives in
// `adapter/out/repository/keyword-rank.repository.adapter.ts`.

export const KEYWORD_RANK_REPOSITORY_PORT = Symbol("KeywordRankRepositoryPort");

export interface KeywordTrackerRow {
  id: string;
  organizationId: string;
  keyword: string;
  vendorItemIds: string[];
  maxPages: number;
  enabled: boolean;
  lastCapturedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertKeywordTrackerInput {
  keyword: string;
  vendorItemIds?: string[];
  maxPages?: number;
}

export interface UpdateKeywordTrackerInput {
  enabled?: boolean;
  vendorItemIds?: string[];
  maxPages?: number;
}

/** 자사 카탈로그 자동매칭 대상 — 쿠팡 `ChannelListingOption.externalOptionId` 보유 행. */
export interface OwnVendorItem {
  vendorItemId: string;
  skuId: string;
  productName: string;
  category: string | null;
}

export interface RepresentativeKeywordOverrideRow {
  id: string;
  organizationId: string;
  vendorItemId: string;
  keyword: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertRankSnapshotInput {
  organizationId: string;
  keyword: string;
  vendorItemId: string;
  businessDate: Date;
  productId: string | null;
  itemId: string | null;
  productName: string | null;
  /** null = 스캔한 페이지 내 미노출(순위권 밖). */
  overallRank: number | null;
  organicRank: number | null;
  adRank: number | null;
  page: number | null;
  positionInPage: number | null;
  priceKrw: number | null;
  reviewCount: number | null;
  capturedAt: Date;
}

export interface UpsertSerpSnapshotInput {
  organizationId: string;
  keyword: string;
  businessDate: Date;
  /** SERP 아이템과 선택 판매자 최신순 카탈로그를 담는 JSON envelope. */
  items: unknown;
  itemCount: number;
  pagesScanned: number;
  capturedAt: Date;
}

export interface RankHistoryRow {
  vendorItemId: string;
  businessDate: Date;
  productName: string | null;
  overallRank: number | null;
  organicRank: number | null;
  adRank: number | null;
  page: number | null;
}

/** 상품 대표 키워드 현황 집계용 최근 순위 fact. */
export interface RankOverviewSnapshotRow {
  keyword: string;
  vendorItemId: string;
  businessDate: Date;
  productName: string | null;
  overallRank: number | null;
  organicRank: number | null;
  adRank: number | null;
  capturedAt: Date;
}

export interface ReplaceWingSalesRankSnapshotInput {
  organizationId: string;
  keyword: string;
  vendorItemId: string;
  businessDate: Date;
  productId: string | null;
  itemId: string | null;
  productName: string | null;
  categoryHierarchy: string | null;
  salesRank: number | null;
  salesLast28d: number | null;
  viewsLast28d: number | null;
  revenueLast28d: number | null;
  conversionRate28d: number | null;
  salePrice: number | null;
  reviewCount: number | null;
  keywordSalesLast28d: number | null;
  keywordViewsLast28d: number | null;
  keywordConversionRate28d: number | null;
  pagesScanned: number;
  collectedCount: number;
  totalResults: number | null;
  capturedAt: Date;
}

export interface WingSalesRankSnapshotRow {
  keyword: string;
  vendorItemId: string;
  businessDate: Date;
  productName: string | null;
  categoryHierarchy: string | null;
  salesRank: number | null;
  salesLast28d: number | null;
  viewsLast28d: number | null;
  revenueLast28d: number | null;
  conversionRate28d: number | null;
  salePrice: number | null;
  reviewCount: number | null;
  keywordSalesLast28d: number | null;
  keywordViewsLast28d: number | null;
  keywordConversionRate28d: number | null;
  collectedCount: number;
  totalResults: number | null;
  capturedAt: Date;
}

export interface SerpSnapshotRow {
  keyword: string;
  businessDate: Date;
  capturedAt: Date;
  pagesScanned: number;
  itemCount: number;
  items: unknown;
}

export interface MutateLatestSerpSnapshotInput {
  organizationId: string;
  keyword: string;
  capturedAt: Date;
  /** Repository-held lock 안에서 최신 JSON을 읽고 새 JSON을 만든다. null이면 저장하지 않는다. */
  mutateItems: (snapshot: SerpSnapshotRow) => unknown | null;
}

export interface KeywordRankRepositoryPort {
  listTrackers(organizationId: string): Promise<KeywordTrackerRow[]>;
  /**
   * keyword 기준 upsert — 이미 있으면 전달된 필드만 갱신하고 `enabled=true`
   * 로 되살린다(중복 키워드 등록 = 재활성화 의도).
   */
  upsertTrackerByKeyword(
    input: UpsertKeywordTrackerInput,
    organizationId: string,
  ): Promise<KeywordTrackerRow>;
  /** `{ id, organizationId }` 스코프 갱신 후 재조회; 없으면 throws. */
  updateTracker(
    id: string,
    organizationId: string,
    patch: UpdateKeywordTrackerInput,
  ): Promise<KeywordTrackerRow>;
  /** `{ id, organizationId }` 스코프 hard delete; 없으면 throws. */
  deleteTracker(id: string, organizationId: string): Promise<KeywordTrackerRow>;
  getTrackerByKeyword(
    keyword: string,
    organizationId: string,
  ): Promise<KeywordTrackerRow | null>;
  touchTrackerCaptured(
    id: string,
    organizationId: string,
    capturedAt: Date,
  ): Promise<void>;
  listOwnVendorItems(organizationId: string): Promise<OwnVendorItem[]>;
  listRepresentativeKeywordOverrides(
    organizationId: string,
  ): Promise<RepresentativeKeywordOverrideRow[]>;
  upsertRepresentativeKeywordOverride(
    organizationId: string,
    vendorItemId: string,
    keyword: string,
  ): Promise<RepresentativeKeywordOverrideRow>;
  deleteRepresentativeKeywordOverride(
    organizationId: string,
    vendorItemId: string,
  ): Promise<number>;
  hasOwnVendorItem(
    organizationId: string,
    vendorItemId: string,
  ): Promise<boolean>;
  /** 키워드×상품×일자 유니크 upsert; 처리한 행 수를 반환. */
  upsertRankSnapshots(rows: UpsertRankSnapshotInput[]): Promise<number>;
  /**
   * 키워드×일자당 최신본 upsert. 오래된 capturedAt은 무시하며, mergeItems는
   * 동일 키워드 DB lock 안에서 실행되어 병렬 seller catalog 수집을 보존한다.
   */
  upsertSerpSnapshot(
    input: UpsertSerpSnapshotInput,
    mergeItems?: (existing: SerpSnapshotRow | null) => unknown,
  ): Promise<{ id: string }>;
  /** 최신 SERP JSON을 DB lock 안에서 원자적으로 변경. 스냅샷 없음/변경 불필요면 null. */
  mutateLatestSerpSnapshot(
    input: MutateLatestSerpSnapshotInput,
  ): Promise<{ id: string } | null>;
  /** 최근 `days`일 rank fact — vendorItemId asc, businessDate asc 정렬. */
  findRankHistory(
    organizationId: string,
    keyword: string,
    days: number,
  ): Promise<RankHistoryRow[]>;
  /** 전체 추적 키워드의 최근 순위 fact — 상품×키워드별 시계열 집계용. */
  findRankOverviewSnapshots(
    organizationId: string,
    days: number,
  ): Promise<RankOverviewSnapshotRow[]>;
  /** 한 키워드의 당일 자사 상품 판매순위 스냅샷을 원자적으로 교체. */
  replaceWingSalesRankSnapshots(
    rows: ReplaceWingSalesRankSnapshotInput[],
  ): Promise<number>;
  findWingSalesRankSnapshots(
    organizationId: string,
    days: number,
  ): Promise<WingSalesRankSnapshotRow[]>;
  findLatestSerp(
    organizationId: string,
    keyword: string,
  ): Promise<SerpSnapshotRow | null>;
  findRecentSerpSnapshots(
    organizationId: string,
    days: number,
  ): Promise<SerpSnapshotRow[]>;
}
