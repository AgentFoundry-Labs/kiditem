// /api/sourcing/trend/* 라우트 전용 API 래퍼 — 시드 키워드 CRUD, 서버 사이드
// 트렌드 수집 트리거, 네이버/1688/쇼츠 일별 스냅샷 조회. 네이버·쇼츠는 서버가
// 직접 수집하고, 1688은 로그인된 Chrome 확장 배치를 우선 사용한 뒤 서버에 저장한다.

import { apiClient } from '@/lib/api-client';

// 서버가 POST /collect 로 직접 수집하는 소스.
export type TrendSource = 'naver' | '1688' | 'shorts';
// 시드에 태깅 가능한 소스. tiktok-cc 는 봇/리전 차단으로 확장 스크랩 전용이라
// 서버 collect 대상이 아니라 시드 태깅 + 확장 배치로만 수집한다.
export type TrendSeedSource = TrendSource | 'tiktok-cc';

export interface TrendSeed {
  id: string;
  keyword: string;
  /** 1688 中文 검색어. null 이면 keyword 를 그대로 사용. */
  keywordCn: string | null;
  sources: TrendSeedSource[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertTrendSeedInput {
  keyword: string;
  keywordCn?: string;
  sources?: TrendSeedSource[];
}

export interface UpdateTrendSeedInput {
  keyword?: string;
  keywordCn?: string;
  sources?: TrendSeedSource[];
  enabled?: boolean;
}

export interface TrendSourceCollectResult {
  source: TrendSource;
  ok: boolean;
  collected: number;
  error?: string;
}

export interface TrendCollectResult {
  businessDate: string;
  results: TrendSourceCollectResult[];
}

export interface Trend1688CollectionTarget {
  label: string;
  keyword: string;
}

export interface NaverKeywordSparklinePoint {
  businessDate: string;
  trendRatio: number | null;
  monthlyTotalSearchCount: number | null;
}

export interface NaverKeywordTrendView {
  keyword: string;
  latest: {
    businessDate: string;
    monthlyTotalSearchCount: number | null;
    monthlyPcSearchCount: number | null;
    monthlyMobileSearchCount: number | null;
    competitionIndex: string | null;
    averageAdRank: number | null;
    trendRatio: number | null;
    trendDelta: number | null;
  };
  sparkline: NaverKeywordSparklinePoint[];
}

export interface PopularKeywordRiser {
  keyword: string;
  /** null = 이전 범위에 없던 신규 진입. 양수 = 상승 계단 수. */
  rankDelta: number | null;
}

export interface PopularKeywordBoardView {
  boardKey: string;
  boardLabel: string | null;
  latest: Array<{ rank: number; keyword: string }>;
  risers: PopularKeywordRiser[];
}

export interface Hot1688OfferView {
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
  /** 이전 수집일에는 없던 신규 진입 오퍼. */
  newlyRanked: boolean;
}

export interface ShortsTrendView {
  videoKey: string;
  rank: number | null;
  title: string | null;
  channelName: string | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  keyword: string | null;
  publishedAt: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
}

export type TiktokCcTrendType = 'hashtag' | 'keyword' | 'product' | 'song';

export interface TiktokCcTrendItemView {
  trendType: TiktokCcTrendType;
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
  /** 이전 수집일에는 없던 신규 진입. */
  newlyRanked: boolean;
}

export interface TiktokCcRegionView {
  region: string;
  items: TiktokCcTrendItemView[];
}

export function collectTrend(sources?: TrendSource[]): Promise<TrendCollectResult> {
  return apiClient.post<TrendCollectResult>('/api/sourcing/trend/collect', { sources });
}

export function fetchTiktokCcTrends(
  days: number,
): Promise<{ days: number; businessDate: string | null; capturedAt: string | null; regions: TiktokCcRegionView[] }> {
  return apiClient.get<{ days: number; businessDate: string | null; capturedAt: string | null; regions: TiktokCcRegionView[] }>(
    `/api/sourcing/trend/tiktok-cc?days=${days}`,
  );
}

export async function fetch1688CollectionTargets(): Promise<Trend1688CollectionTarget[]> {
  const { targets } = await apiClient.get<{ targets: Trend1688CollectionTarget[] }>(
    '/api/sourcing/trend/1688-targets',
  );
  return targets;
}

export async function fetchTrendSeeds(): Promise<TrendSeed[]> {
  const { seeds } = await apiClient.get<{ seeds: TrendSeed[] }>('/api/sourcing/trend/seeds');
  return seeds;
}

export async function upsertTrendSeed(input: UpsertTrendSeedInput): Promise<TrendSeed> {
  const { seed } = await apiClient.post<{ seed: TrendSeed }>('/api/sourcing/trend/seeds', input);
  return seed;
}

export async function updateTrendSeed(
  id: string,
  patch: UpdateTrendSeedInput,
): Promise<TrendSeed> {
  const { seed } = await apiClient.patch<{ seed: TrendSeed }>(
    `/api/sourcing/trend/seeds/${id}`,
    patch,
  );
  return seed;
}

export function deleteTrendSeed(id: string): Promise<{ deleted: boolean }> {
  return apiClient.delete<{ deleted: boolean }>(`/api/sourcing/trend/seeds/${id}`);
}

export function fetchNaverKeywordTrends(
  days: number,
): Promise<{ days: number; keywords: NaverKeywordTrendView[] }> {
  return apiClient.get<{ days: number; keywords: NaverKeywordTrendView[] }>(
    `/api/sourcing/trend/naver-keywords?days=${days}`,
  );
}

export function fetchPopularKeywordBoards(
  days: number,
): Promise<{ days: number; boards: PopularKeywordBoardView[] }> {
  return apiClient.get<{ days: number; boards: PopularKeywordBoardView[] }>(
    `/api/sourcing/trend/popular-keywords?days=${days}`,
  );
}

export function fetch1688HotProducts(
  days: number,
): Promise<{ days: number; businessDate: string | null; capturedAt: string | null; offers: Hot1688OfferView[] }> {
  return apiClient.get<{ days: number; businessDate: string | null; capturedAt: string | null; offers: Hot1688OfferView[] }>(
    `/api/sourcing/trend/1688-hot?days=${days}`,
  );
}

export function fetchShortsTrends(
  days: number,
): Promise<{ days: number; businessDate: string | null; capturedAt: string | null; items: ShortsTrendView[] }> {
  return apiClient.get<{ days: number; businessDate: string | null; capturedAt: string | null; items: ShortsTrendView[] }>(
    `/api/sourcing/trend/shorts?days=${days}`,
  );
}

export const TREND_SOURCE_META: Record<TrendSeedSource, { label: string; className: string }> = {
  naver: { label: '네이버', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  '1688': { label: '1688', className: 'bg-orange-50 text-orange-700 ring-orange-200' },
  shorts: { label: '쇼츠', className: 'bg-rose-50 text-rose-700 ring-rose-200' },
  'tiktok-cc': { label: '틱톡', className: 'bg-slate-900 text-white ring-slate-700' },
};

/** 서버 사이드 수집(collect) 버튼에 노출하는 소스 순서. tiktok-cc 제외. */
export const TREND_SOURCE_ORDER: TrendSource[] = ['naver', '1688', 'shorts'];

/** 시드 태깅에 노출하는 소스 순서(확장 스크랩 전용 tiktok-cc 포함). */
export const TREND_SEED_SOURCE_ORDER: TrendSeedSource[] = ['naver', '1688', 'shorts', 'tiktok-cc'];

/** 문구·완구 빠른 시드 제안. 클릭 시 입력값만 채우고 자동 생성하지 않는다. */
export const KOREAN_SEED_SUGGESTIONS = [
  '초등 필통',
  '포토카드',
  '스퀴시',
  '캐릭터 문구',
  '메모지',
];

/** 1688 검색용 中文 시드 제안. keywordCn 입력을 채운다. */
export const CHINESE_SEED_SUGGESTIONS = ['文具', '儿童文具', '捏捏乐', '盲盒'];
