import { apiClient } from '@/lib/api-client';

// `/api/ads/wing-tracked-products/*` — 쿠팡 Wing 카탈로그 상품 추적 CRUD + 일별 지표 스냅샷 read.
// 지표 수집은 실행 kind `advertising.wing_tracked_products`다(KID-362, `wing-tracked-products-collection.ts`).

export interface WingTrackedSnapshot {
  trackedProductId: string;
  businessDate: string;
  salePriceKrw: number | null;
  ratingCount: number | null;
  ratingAverage: number | null;
  pvLast28Day: number | null;
  salesLast28d: number | null;
  estimatedRevenue28d: number | null;
  conversionRate28d: number | null;
  capturedAt: string;
}

export interface WingTrackedProduct {
  id: string;
  productId: string;
  itemId: string | null;
  vendorItemId: string | null;
  productName: string;
  imagePath: string | null;
  brandName: string | null;
  categoryHierarchy: string | null;
  sourceKeyword: string | null;
  enabled: boolean;
  lastCapturedAt: string | null;
  createdAt: string;
  updatedAt: string;
  latestSnapshot: WingTrackedSnapshot | null;
}

export interface WingTrackedMetrics {
  salePriceKrw: number | null;
  ratingCount: number | null;
  ratingAverage: number | null;
  pvLast28Day: number | null;
  salesLast28d: number | null;
  estimatedRevenue28d: number | null;
  conversionRate28d: number | null;
}

export interface AddWingTrackedProductInput extends WingTrackedMetrics {
  productId: string;
  itemId?: string | null;
  vendorItemId?: string | null;
  productName: string;
  imagePath?: string | null;
  brandName?: string | null;
  categoryHierarchy?: string | null;
  sourceKeyword?: string | null;
}

export interface WingTrackedHistory {
  trackedProductId: string;
  productName: string;
  points: WingTrackedSnapshot[];
}

export interface WingTrackedHistoriesResponse {
  items: WingTrackedHistory[];
}

const BASE = '/api/ads/wing-tracked-products';

export function listWingTrackedProducts(): Promise<WingTrackedProduct[]> {
  return apiClient.get<WingTrackedProduct[]>(BASE);
}

export function addWingTrackedProduct(
  input: AddWingTrackedProductInput,
): Promise<WingTrackedProduct> {
  return apiClient.post<WingTrackedProduct>(BASE, input);
}

export function deleteWingTrackedProduct(id: string): Promise<{ id: string }> {
  return apiClient.delete<{ id: string }>(`${BASE}/${id}`);
}

export function fetchWingTrackedHistory(id: string, days = 30): Promise<WingTrackedHistory> {
  return apiClient.get<WingTrackedHistory>(
    `${BASE}/${id}/history?days=${encodeURIComponent(String(days))}`,
  );
}

export function fetchWingTrackedHistories(
  days = 30,
): Promise<WingTrackedHistoriesResponse> {
  return apiClient.get<WingTrackedHistoriesResponse>(
    `${BASE}/history?days=${encodeURIComponent(String(days))}`,
    { timeoutMs: 10_000 },
  );
}
