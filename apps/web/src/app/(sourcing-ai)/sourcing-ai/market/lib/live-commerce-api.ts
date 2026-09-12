import { apiClient } from '@/lib/api-client';

export type LiveCommerceSource = 'taobao' | '1688' | 'douyin';

export interface LiveCommerceSourceStatus {
  source: LiveCommerceSource;
  connection: 'official-api' | 'chrome-extension';
  configured: boolean;
  missing: string[];
  requiresLogin: boolean;
  latestCapturedAt: string | null;
  sourceStatus?: TaobaoLiveSourceStatus;
}

export interface LiveCommerceBroadcastView {
  businessDate: string;
  source: LiveCommerceSource;
  broadcastId: string;
  title: string | null;
  broadcasterId: string | null;
  broadcasterName: string | null;
  status: string | null;
  viewerCount: number | null;
  likeCount: number | null;
  startedAt: string | null;
  endedAt: string | null;
  coverImageUrl: string | null;
  sourceUrl: string | null;
  capturedAt: string;
}

export interface LiveCommerceProductView {
  businessDate: string;
  source: LiveCommerceSource;
  broadcastId: string;
  productId: string;
  rank: number | null;
  title: string | null;
  priceCny: number | null;
  salesCount: number | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  capturedAt: string;
}

export interface TaobaoLiveAttempt {
  warnings?: string[];
  attemptId: string;
  state: 'RUNNING' | 'COMPLETE' | 'FAILED';
  completedAt: string | null;
  expiresAt: string;
  errorCode: string | null;
  errorMessage: string | null;
}
export interface TaobaoLiveSourceStatus {
  ready: boolean;
  refreshing: boolean;
  latestAttempt: TaobaoLiveAttempt | null;
  latestComplete: TaobaoLiveAttempt | null;
  actualCutoffAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}
export function fetchLiveCommerceStatus(input: { liveIds: string[] } = { liveIds: [] }): Promise<{ sources: LiveCommerceSourceStatus[] }> {
  const query = new URLSearchParams({ liveIds: JSON.stringify(input.liveIds) });
  return apiClient.get(`/api/sourcing/live-commerce/status?${query}`);
}

export function collectTaobaoLive(input: { liveIds: string[] }, idempotencyKey: string): Promise<TaobaoLiveAttempt> {
  return apiClient.post('/api/sourcing/live-commerce/taobao/attempts', input, {
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

export function fetchLiveCommerceSnapshots(days: number): Promise<{
  days: number;
  broadcasts: LiveCommerceBroadcastView[];
  products: LiveCommerceProductView[];
}> {
  return apiClient.get(`/api/sourcing/live-commerce/snapshots?days=${days}`);
}

export interface LiveTrendKeywordView {
  keyword: string;
  productCount: number;
  broadcastCount: number;
  sources: string[];
  totalSales: number | null;
  minPriceCny: number | null;
  maxPriceCny: number | null;
  sampleTitles: string[];
  topImageUrl: string | null;
  latestCapturedAt: string | null;
}

/** 라이브 방송 노출 상품명에서 역추출한 문구·완구 트렌드 키워드. */
export function fetchLiveCommerceKeywords(days: number): Promise<{
  days: number;
  keywords: LiveTrendKeywordView[];
}> {
  return apiClient.get(`/api/sourcing/live-commerce/keywords?days=${days}`);
}
