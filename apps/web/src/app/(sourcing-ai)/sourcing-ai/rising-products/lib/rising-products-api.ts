import { apiClient } from '@/lib/api-client';

// `/api/sourcing/rising-products/*` — 쿠팡 키워드 SERP 스냅샷 위에서 리뷰속도·오가닉
// 순위상승 + Wing 실매출로 급상승 상품을 탐지한 결과(결정론 replay). 수집 자체는
// 확장(coupang-ads-scraper)의 SERP/Wing 스냅샷이 담당한다.

export type RisingProductGrade = 'A' | 'B' | 'C' | 'WATCH' | 'EXCLUDE';
export type RisingProductDecision = 'order' | 'observe_3d' | 'exclude';

export interface RisingProductComponents {
  momentum: number;
  freshness: number;
  trendFit: number;
  riskPenalty: number;
}

export interface RisingProductSignals {
  spanDays: number;
  observationDays: number;
  firstSeenBusinessDate: string;
  daysSinceFirstSeen: number;
  reviewGrowth: number;
  reviewVelocityPerDay: number;
  rankClimb: number | null;
  salesLast28d: number | null;
  salesVelocityPerDay: number | null;
  hasWingSales: boolean;
  trendDelta: number | null;
  monthlySearchVolume: number | null;
}

export interface RisingProductCandidate {
  id: string;
  rank: number;
  keyword: string;
  vendorItemId: string | null;
  productId: string | null;
  productName: string;
  productUrl: string | null;
  latestPriceKrw: number | null;
  latestReviewCount: number | null;
  latestRatingScore: number | null;
  latestOrganicRank: number | null;
  score: number;
  grade: RisingProductGrade;
  decision: RisingProductDecision;
  components: RisingProductComponents;
  signals: RisingProductSignals;
  reasons: string[];
  risks: string[];
  modelTags: string[];
  sourceDate: string;
}

export interface RisingProductStats {
  candidateCount: number;
  serpSnapshotCount: number;
  keywordCount: number;
  orderCount: number;
  observeCount: number;
  excludedCount: number;
  withWingSalesCount: number;
  insufficientHistoryCount: number;
  averageScore: number;
  topKeyword: string | null;
}

export interface RisingProductModel {
  candidates: RisingProductCandidate[];
  stats: RisingProductStats;
  model: {
    pipeline: string;
    version: number;
    generatorVersion: string;
    weights: RisingProductComponents;
  };
}

export interface RisingProductsResult {
  businessDate: string;
  windowDays: number;
  generatedAt: string;
  confidence: number;
  dataGaps: string[];
  model: RisingProductModel;
}

export interface DetectRisingProductsInput {
  windowDays?: number;
  limit?: number;
}

const BASE = '/api/sourcing/rising-products';

export function fetchLatestRisingProducts(): Promise<RisingProductsResult | null> {
  return apiClient.get<RisingProductsResult | null>(BASE);
}

export function detectRisingProducts(
  input: DetectRisingProductsInput = {},
): Promise<RisingProductsResult> {
  return apiClient.post<RisingProductsResult>(`${BASE}/detect`, input);
}

// 급상승 키워드를 쿠팡 순위추적에 추가 → 확장이 그 키워드 SERP를 수집 → 탐지기 후보에 반영.
// 순위추적 트래커 엔드포인트를 이 화면에서 직접 소비한다(route-local 래퍼).
export interface KeywordTrackerLite {
  id: string;
  keyword: string;
  enabled: boolean;
}

export function fetchKeywordTrackers(): Promise<KeywordTrackerLite[]> {
  return apiClient.get<KeywordTrackerLite[]>('/api/ads/keyword-rank/trackers');
}

export function addKeywordTracker(keyword: string): Promise<KeywordTrackerLite> {
  return apiClient.post<KeywordTrackerLite>('/api/ads/keyword-rank/trackers', { keyword });
}
