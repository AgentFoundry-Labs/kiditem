// /api/ads/keyword-rank/* 라우트 전용 API 래퍼 — 키워드 트래커 CRUD 와
// 순위 추이/최신 SERP 조회. 순위 수집 자체는 확장(rank-extension.ts)이 담당.

import { apiClient } from '@/lib/api-client';

export interface KeywordTracker {
  id: string;
  organizationId: string;
  keyword: string;
  /** 명시 추적 타깃. 빈 배열 = 자사 카탈로그 자동매칭만. */
  vendorItemIds: string[];
  maxPages: number;
  enabled: boolean;
  lastCapturedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateKeywordTrackerInput {
  keyword: string;
  vendorItemIds?: string[];
  maxPages?: number;
}

export interface UpdateKeywordTrackerInput {
  enabled?: boolean;
  vendorItemIds?: string[];
  maxPages?: number;
}

export interface RankHistoryPoint {
  businessDate: string;
  /** null = 스캔한 페이지 내 미노출(순위권 밖). */
  overallRank: number | null;
  organicRank: number | null;
  adRank: number | null;
  page: number | null;
}

export interface RankHistorySeries {
  vendorItemId: string;
  productName: string | null;
  isOwn: boolean;
  points: RankHistoryPoint[];
}

export interface KeywordRankHistoryResponse {
  keyword: string;
  series: RankHistorySeries[];
}

export type ProductKeywordRankStatus =
  | 'rising'
  | 'falling'
  | 'steady'
  | 'out_of_range'
  | 'not_collected';

export interface ProductKeywordRankRow {
  keyword: string;
  keywordSource:
    | 'manual_override'
    | 'wing_performance'
    | 'coupang_category'
    | 'product_name';
  keywordScore: number | null;
  recommendationReason: string;
  automaticKeyword: string;
  category: string | null;
  candidates: RepresentativeKeywordCandidate[];
  vendorItemId: string;
  groupedVendorItemIds: string[];
  groupedOptionCount: number;
  skuId: string | null;
  productName: string | null;
  abcGrade: "A" | "B" | "C" | null;
  currentSalesRank: number | null;
  previousSalesRank: number | null;
  /** 양수 = 순위 상승, 음수 = 하락. */
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
  capturedAt: string | null;
  status: ProductKeywordRankStatus;
  history: Array<{
    businessDate: string;
    salesRank: number | null;
    salesLast28d: number | null;
  }>;
}

export interface RepresentativeKeywordCandidate {
  keyword: string;
  origin: 'coupang_category' | 'product_name';
  score: number | null;
  salesRank: number | null;
  keywordSalesLast28d: number | null;
  keywordViewsLast28d: number | null;
  keywordConversionRate28d: number | null;
  observed: boolean;
}

export interface ProductKeywordRankOverviewResponse {
  periodDays: number;
  summary: {
    productCount: number;
    optionCount: number;
    duplicateOptionCount: number;
    representativeKeywordCount: number;
    rankedCount: number;
    top20Count: number;
    risingCount: number;
    fallingCount: number;
    outOfRangeCount: number;
    notCollectedCount: number;
  };
  rows: ProductKeywordRankRow[];
}

/** 확장이 캡처한 SERP 아이템 — DOM 순서 그대로(광고 포함). */
export interface SerpItem {
  rank: number;
  page: number | null;
  positionInPage: number | null;
  isAd: boolean;
  productId: string | null;
  itemId: string | null;
  vendorItemId: string | null;
  name: string | null;
  priceKrw: number | null;
  reviewCount: number | null;
  ratingScore: number | null;
  link: string | null;
}

export interface KeywordSerpResponse {
  keyword: string;
  businessDate?: string;
  capturedAt?: string;
  pagesScanned?: number;
  itemCount?: number;
  items: SerpItem[];
  ownVendorItemIds: string[];
}

export function fetchKeywordTrackers(): Promise<KeywordTracker[]> {
  return apiClient.get<KeywordTracker[]>('/api/ads/keyword-rank/trackers');
}

export function createKeywordTracker(
  input: CreateKeywordTrackerInput,
): Promise<KeywordTracker> {
  return apiClient.post<KeywordTracker>('/api/ads/keyword-rank/trackers', input);
}

export function updateKeywordTracker(
  id: string,
  patch: UpdateKeywordTrackerInput,
): Promise<KeywordTracker> {
  return apiClient.patch<KeywordTracker>(`/api/ads/keyword-rank/trackers/${id}`, patch);
}

export function deleteKeywordTracker(id: string): Promise<KeywordTracker> {
  return apiClient.delete<KeywordTracker>(`/api/ads/keyword-rank/trackers/${id}`);
}

export function fetchKeywordRankHistory(
  keyword: string,
  days: number,
): Promise<KeywordRankHistoryResponse> {
  return apiClient.get<KeywordRankHistoryResponse>(
    `/api/ads/keyword-rank/history?keyword=${encodeURIComponent(keyword)}&days=${days}`,
  );
}

export function fetchProductKeywordRanks(
  days: number,
): Promise<ProductKeywordRankOverviewResponse> {
  return apiClient.get<ProductKeywordRankOverviewResponse>(
    `/api/ads/keyword-rank/products?days=${days}`,
  );
}

export function setProductRepresentativeKeyword(
  vendorItemId: string,
  keyword: string,
): Promise<{ vendorItemId: string; keyword: string }> {
  return apiClient.patch(
    `/api/ads/keyword-rank/products/${encodeURIComponent(vendorItemId)}/keyword`,
    { keyword },
  );
}

export function resetProductRepresentativeKeyword(
  vendorItemId: string,
): Promise<{ vendorItemId: string; reset: boolean }> {
  return apiClient.delete(
    `/api/ads/keyword-rank/products/${encodeURIComponent(vendorItemId)}/keyword`,
  );
}

export function fetchKeywordSerp(keyword: string): Promise<KeywordSerpResponse> {
  return apiClient.get<KeywordSerpResponse>(
    `/api/ads/keyword-rank/serp?keyword=${encodeURIComponent(keyword)}`,
  );
}

/** 콤마/공백 구분 vendorItemId 입력 문자열 → 중복 제거 배열. */
export function parseVendorItemIdsInput(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[\s,]+/)
        .map((token) => token.trim())
        .filter(Boolean),
    ),
  ];
}
