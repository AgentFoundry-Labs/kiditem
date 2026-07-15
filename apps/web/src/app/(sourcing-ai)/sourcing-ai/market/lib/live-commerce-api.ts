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
