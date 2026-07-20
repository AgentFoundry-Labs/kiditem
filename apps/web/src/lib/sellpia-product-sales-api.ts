import { apiClient } from '@/lib/api-client';
import {
  SellpiaProductSalesSummarySchema,
  SellpiaProductSalesIngestResultSchema,
  type SellpiaProductSalesSummary,
  type SellpiaProductSalesIngestPayload,
  type SellpiaProductSalesIngestResult,
} from '@kiditem/shared/dashboard';

// Sellpia 상품별 소진(재고관리) 백엔드 read/ingest 래퍼.

const FETCH_TIMEOUT_MS = 15_000;

export async function fetchSellpiaProductSales(params?: {
  months?: number;
}): Promise<SellpiaProductSalesSummary> {
  const query = new URLSearchParams();
  if (params?.months) query.set('months', String(params.months));
  const qs = query.toString();
  const path = `/api/sellpia-product-sales${qs ? `?${qs}` : ''}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await apiClient.fetchRaw(path, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`상품별 소진 조회 실패 (HTTP ${res.status})`);
    }
    return SellpiaProductSalesSummarySchema.parse(await res.json());
  } finally {
    clearTimeout(timeout);
  }
}

export async function ingestSellpiaProductSales(
  payload: SellpiaProductSalesIngestPayload,
): Promise<SellpiaProductSalesIngestResult> {
  const raw = await apiClient.post<unknown>('/api/sellpia-product-sales/ingest', payload);
  return SellpiaProductSalesIngestResultSchema.parse(raw);
}
