import { apiClient } from '@/lib/api-client';

export type LiveCommerceSource = 'taobao' | '1688' | 'douyin';

export interface LiveCommerceSourceStatus {
  source: LiveCommerceSource;
  connection: 'official-api' | 'chrome-extension';
  configured: boolean;
  missing: string[];
  requiresLogin: boolean;
  latestCapturedAt: string | null;
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

export interface LiveCommerceCollectionResult {
  businessDate: string;
  broadcastCount: number;
  productCount: number;
  warnings: string[];
}

export function fetchLiveCommerceStatus(): Promise<{ sources: LiveCommerceSourceStatus[] }> {
  return apiClient.get('/api/sourcing/live-commerce/status');
}

export function collectTaobaoLive(input: {
  liveIds?: string[];
  queryDate?: string;
}): Promise<LiveCommerceCollectionResult> {
  return apiClient.post('/api/sourcing/live-commerce/taobao/collect', input);
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
