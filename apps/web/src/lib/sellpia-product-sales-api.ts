import { apiClient } from '@/lib/api-client';
import {
  SellpiaProductSalesSummarySchema,
  type SellpiaProductSalesSummary,
} from '@kiditem/shared/dashboard';

// Sellpia 상품별 소진(재고관리) 백엔드 read 래퍼. 상품 손익 수집은 실행 kind
// `analytics.sellpia_product_profitability`(lib/sellpia-product-profitability-collection).

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
