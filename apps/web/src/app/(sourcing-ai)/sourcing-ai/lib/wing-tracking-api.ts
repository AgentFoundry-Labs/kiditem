import { apiClient } from '@/lib/api-client';
import { detectExtensionId, sendToExtension } from '@/lib/extension-bridge';

// `/api/ads/wing-tracked-products/*` — 쿠팡 Wing 카탈로그 상품 추적 CRUD + 일별 지표 스냅샷 read.
// 수집은 Ads source owner가 발행한 attempt를 KidItem OS가 직접 실행한다.

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

export interface WingTrackedProductAttemptPlan {
  attemptId: string;
  attemptToken: string;
  state: 'RUNNING' | 'COMPLETE' | 'FAILED';
  expiresAt: string;
  businessDate: string;
  sourceKeywordFallback: 'any_requested_keyword_for_unassigned_product';
  keywords: string[];
  products: Array<{
    productId: string;
    sourceKeyword: string | null;
  }>;
}

export interface WingTrackedProductSourceStatus {
  ready: boolean;
  latestAttempt: {
    attemptId: string;
    state: 'RUNNING' | 'COMPLETE' | 'FAILED';
    startedAt: string;
    capturedAt: string | null;
    expiresAt: string;
    errorCode: string | null;
    errorMessage: string | null;
  } | null;
  latestComplete: {
    sourceImportRunId: string;
    businessDate: string;
    capturedAt: string;
    expectedProductCount: number;
    capturedProductCount: number;
    failedProductCount: number;
  } | null;
}

export interface WingTrackedProductCollectionReply {
  success: boolean;
  attemptId: string;
  terminalState: 'RUNNING' | 'COMPLETE' | 'FAILED';
  retryRequired?: boolean;
  attentionRequired?: boolean;
  completedKeywordCount?: number;
  errorCode?: string;
  error?: string;
}

function parseWingTrackedProductCollectionReply(
  value: unknown,
): WingTrackedProductCollectionReply {
  const record = isRecord(value) ? value : null;
  if (
    !record ||
    typeof record.success !== 'boolean' ||
    typeof record.attemptId !== 'string' ||
    (record.terminalState !== 'RUNNING' &&
      record.terminalState !== 'COMPLETE' &&
      record.terminalState !== 'FAILED')
  ) {
    throw new Error('KidItem OS 익스텐션이 추적 수집 결과를 올바르게 반환하지 않았습니다.');
  }
  const reply: WingTrackedProductCollectionReply = {
    success: record.success,
    attemptId: record.attemptId,
    terminalState: record.terminalState,
  };
  if (record.retryRequired !== undefined) {
    if (typeof record.retryRequired !== 'boolean') throw new Error('KidItem OS 익스텐션이 추적 수집 결과를 올바르게 반환하지 않았습니다.');
    reply.retryRequired = record.retryRequired;
  }
  if (record.attentionRequired !== undefined) {
    if (typeof record.attentionRequired !== 'boolean') throw new Error('KidItem OS 익스텐션이 추적 수집 결과를 올바르게 반환하지 않았습니다.');
    reply.attentionRequired = record.attentionRequired;
  }
  if (record.completedKeywordCount !== undefined) {
    if (typeof record.completedKeywordCount !== 'number' || !Number.isInteger(record.completedKeywordCount) || record.completedKeywordCount < 0) throw new Error('KidItem OS 익스텐션이 추적 수집 결과를 올바르게 반환하지 않았습니다.');
    reply.completedKeywordCount = record.completedKeywordCount;
  }
  if (record.errorCode !== undefined) {
    if (typeof record.errorCode !== 'string') throw new Error('KidItem OS 익스텐션이 추적 수집 결과를 올바르게 반환하지 않았습니다.');
    reply.errorCode = record.errorCode;
  }
  if (record.error !== undefined) {
    if (typeof record.error !== 'string') throw new Error('KidItem OS 익스텐션이 추적 수집 결과를 올바르게 반환하지 않았습니다.');
    reply.error = record.error;
  }
  return reply;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

export function beginWingTrackedProductAttempt(input: {
  idempotencyKey: string;
  keywords: string[];
}): Promise<WingTrackedProductAttemptPlan> {
  return apiClient.post<WingTrackedProductAttemptPlan>(
    `${BASE}/attempts`,
    { keywords: input.keywords },
    { headers: { 'Idempotency-Key': input.idempotencyKey } },
  );
}

export function fetchWingTrackedProductSourceStatus(): Promise<WingTrackedProductSourceStatus> {
  return apiClient.get<WingTrackedProductSourceStatus>(`${BASE}/attempts/current`);
}

/** The owner's operator stop for a running tracked Wing products attempt; it needs no attempt token. */
export function cancelWingTrackedProductAttempt(attemptId: string): Promise<unknown> {
  return apiClient.post(`${BASE}/attempts/${encodeURIComponent(attemptId)}/cancel`);
}

export async function requireWingTrackedProductExtension(): Promise<string> {
  const extensionId = await detectExtensionId();
  if (!extensionId) throw new Error('KidItem OS 익스텐션을 연결한 뒤 다시 시도해주세요.');
  return extensionId;
}

export async function collectWingTrackedProductsFromExtension(input: {
  extensionId: string;
  idempotencyKey: string;
  keywords: string[];
}): Promise<WingTrackedProductCollectionReply> {
  const response = await sendToExtension<unknown>(
    input.extensionId,
    {
      action: 'collectAdvertisingTrackedWingProducts',
      idempotencyKey: input.idempotencyKey,
      keywords: input.keywords,
    },
    null,
  );
  return parseWingTrackedProductCollectionReply(response);
}
