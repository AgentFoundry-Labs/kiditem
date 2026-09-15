import type { SourcingKeywordAnalysisSnapshot } from '@kiditem/shared/sourcing';

export const TREND_COLLECTION_REPOSITORY_PORT = Symbol('TrendCollectionRepositoryPort');

export const TREND_SEED_SOURCES = ['naver', 'shorts', '1688', 'tiktok-cc'] as const;
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

/**
 * A raw 1688 offer discovered through one exact search keyword.
 *
 * This is an immutable source observation input, not a daily projection: one
 * offer may deliberately occur more than once when different keywords found it.
 */
export interface Sourcing1688OfferKeywordObservationInput {
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
  searchMetadata?: {
    score: number;
    salesText?: string | null;
    supplierFactoryUrl?: string | null;
    supplierTags?: string[];
    purchaseTags?: string[];
    minOrderQuantity?: number | null;
    shippingFulfillmentRate?: string | null;
    shippingPickupRate?: string | null;
    shipFrom?: string | null;
    serviceScore?: number | null;
  };
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

export interface TiktokCcSnapshotUpsert {
  organizationId: string;
  ingestionRunId: string;
  businessDate: Date;
  region: string;
  trendType: string;
  entityKey: string;
  rank: number | null;
  label: string | null;
  industry: string | null;
  sourceKeyword: string | null;
  postCount: number | null;
  viewCount: number | null;
  growthPct: number | null;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
  capturedAt: Date;
}

export interface TiktokCcSnapshotRow {
  businessDate: Date;
  capturedAt: Date;
  region: string;
  trendType: string;
  entityKey: string;
  rank: number | null;
  label: string | null;
  industry: string | null;
  sourceKeyword: string | null;
  postCount: number | null;
  viewCount: number | null;
  growthPct: number | null;
  thumbnailUrl: string | null;
  sourceUrl: string | null;
}

export interface TrendHistoryQuery {
  organizationId: string;
  days: number;
}

export interface TrendCollectionRepositoryPort {
  findLatestCompleteTrendScope(input: { organizationId: string; source: 'naver' | 'shorts' }): Promise<string | null>;
  findKeywordAnalysisSnapshot(input: { organizationId: string; inputHash: string; attemptId?: string }): Promise<SourcingKeywordAnalysisSnapshot | null>;
  listSeeds(organizationId: string): Promise<TrendSeedRow[]>;
  upsertSeedByKeyword(input: UpsertTrendSeedInput): Promise<TrendSeedRow>;
  updateSeed(input: UpdateTrendSeedInput): Promise<TrendSeedRow>;
  deleteSeed(input: { id: string; organizationId: string }): Promise<void>;

  findNaverKeywordHistory(query: TrendHistoryQuery): Promise<NaverKeywordSnapshotRow[]>;
  findPopularKeywordHistory(query: TrendHistoryQuery): Promise<{ rows: NaverPopularKeywordSnapshotRow[]; coverage: Array<{ boardKey: string; businessDate: Date }> }>;
  find1688HotHistory(query: TrendHistoryQuery): Promise<Sourcing1688HotProductSnapshotRow[]>;
  findShortsHistory(query: TrendHistoryQuery): Promise<ShortsSnapshotRow[]>;
  /**
   * The same rows with every business date a complete collection covered in the
   * window, including a day whose collection stored no video.
   */
  findShortsHistoryWithCoverage(query: TrendHistoryQuery): Promise<{ rows: ShortsSnapshotRow[]; coverage: Array<{ businessDate: Date }> }>;
  findTiktokCcHistory(query: TrendHistoryQuery): Promise<TiktokCcSnapshotRow[]>;
}
