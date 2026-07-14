export const TREND_COLLECTION_REPOSITORY_PORT = Symbol('TrendCollectionRepositoryPort');

export const TREND_SEED_SOURCES = ['naver', 'shorts', '1688'] as const;
export type TrendSeedSource = (typeof TREND_SEED_SOURCES)[number];

export interface TrendSeedRow {
  id: string;
  organizationId: string;
  keyword: string;
  keywordCn: string | null;
  sources: string[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertTrendSeedInput {
  organizationId: string;
  keyword: string;
  keywordCn?: string | null;
  sources?: string[];
}

export interface UpdateTrendSeedInput {
  id: string;
  organizationId: string;
  keyword?: string;
  keywordCn?: string | null;
  sources?: string[];
  enabled?: boolean;
}

export interface NaverKeywordSnapshotUpsert {
  organizationId: string;
  keyword: string;
  businessDate: Date;
  monthlyTotalSearchCount: number | null;
  monthlyPcSearchCount: number | null;
  monthlyMobileSearchCount: number | null;
  competitionIndex: string | null;
  averageAdRank: number | null;
  trendRatio: number | null;
  trendDelta: number | null;
  capturedAt: Date;
}

export interface NaverKeywordSnapshotRow {
  keyword: string;
  businessDate: Date;
  monthlyTotalSearchCount: number | null;
  monthlyPcSearchCount: number | null;
  monthlyMobileSearchCount: number | null;
  competitionIndex: string | null;
  averageAdRank: number | null;
  trendRatio: number | null;
  trendDelta: number | null;
  capturedAt: Date;
}

export interface NaverPopularKeywordSnapshotUpsert {
  organizationId: string;
  boardKey: string;
  boardLabel: string | null;
  cid: string | null;
  businessDate: Date;
  rank: number;
  keyword: string;
  linkId: string | null;
  capturedAt: Date;
}

export interface NaverPopularKeywordSnapshotRow {
  boardKey: string;
  boardLabel: string | null;
  cid: string | null;
  businessDate: Date;
  rank: number;
  keyword: string;
  linkId: string | null;
}

export interface Sourcing1688HotProductSnapshotUpsert {
  organizationId: string;
  businessDate: Date;
  offerId: string;
  sourceKeyword: string;
  rank: number | null;
  title: string | null;
  priceCny: number | null;
  monthlySales: number | null;
  repurchaseRate: string | null;
  tradeScore: string | null;
  supplierName: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  capturedAt: Date;
}

export interface Sourcing1688HotProductSnapshotRow {
  businessDate: Date;
  capturedAt: Date;
  offerId: string;
  sourceKeyword: string;
  rank: number | null;
  title: string | null;
  priceCny: number | null;
  monthlySales: number | null;
  repurchaseRate: string | null;
  tradeScore: string | null;
  supplierName: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
}

export interface ShortsSnapshotUpsert {
  organizationId: string;
  businessDate: Date;
  videoKey: string;
  rank: number | null;
  title: string | null;
  channelName: string | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  keyword: string | null;
  publishedAt: Date | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  capturedAt: Date;
}

export interface ShortsSnapshotRow {
  businessDate: Date;
  capturedAt: Date;
  videoKey: string;
  rank: number | null;
  title: string | null;
  channelName: string | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  keyword: string | null;
  publishedAt: Date | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
}

export interface TrendHistoryQuery {
  organizationId: string;
  days: number;
}

export interface TrendCollectionRepositoryPort {
  listSeeds(organizationId: string): Promise<TrendSeedRow[]>;
  upsertSeedByKeyword(input: UpsertTrendSeedInput): Promise<TrendSeedRow>;
  updateSeed(input: UpdateTrendSeedInput): Promise<TrendSeedRow>;
  deleteSeed(input: { id: string; organizationId: string }): Promise<void>;

  upsertNaverKeywordSnapshots(rows: NaverKeywordSnapshotUpsert[]): Promise<number>;
  /** 보드×일자 스냅샷을 통째로 교체해 사라진 키워드 행도 함께 정리한다. */
  replaceNaverPopularKeywordSnapshots(rows: NaverPopularKeywordSnapshotUpsert[]): Promise<number>;
  upsert1688HotProductSnapshots(rows: Sourcing1688HotProductSnapshotUpsert[]): Promise<number>;
  upsertShortsSnapshots(rows: ShortsSnapshotUpsert[]): Promise<number>;

  findNaverKeywordHistory(query: TrendHistoryQuery): Promise<NaverKeywordSnapshotRow[]>;
  findPopularKeywordHistory(query: TrendHistoryQuery): Promise<NaverPopularKeywordSnapshotRow[]>;
  find1688HotHistory(query: TrendHistoryQuery): Promise<Sourcing1688HotProductSnapshotRow[]>;
  findShortsHistory(query: TrendHistoryQuery): Promise<ShortsSnapshotRow[]>;
}
