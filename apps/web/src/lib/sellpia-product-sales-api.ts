import { apiClient } from '@/lib/api-client';
import {
  SellpiaProductSalesSummarySchema,
  type SellpiaProductSalesSummary,
} from '@kiditem/shared/dashboard';
import {
  SellpiaProfitabilityAttemptSchema,
  type SellpiaProfitabilityAttempt,
} from '@kiditem/shared/source-import';

// Sellpia 상품별 소진(재고관리) 백엔드 read 래퍼.

const FETCH_TIMEOUT_MS = 15_000;
export const SELLPIA_PROFITABILITY_SOURCE_PATH = '/api/sellpia-product-sales';

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

export function beginSellpiaProductProfitabilitySourceAttempt(input: {
  idempotencyKey: string;
  normalizedSourceAvailabilityDate?: string;
}): Promise<SellpiaProfitabilityAttempt> {
  return apiClient
    .post<unknown>(
      `${SELLPIA_PROFITABILITY_SOURCE_PATH}/attempts`,
      input.normalizedSourceAvailabilityDate
        ? { normalizedSourceAvailabilityDate: input.normalizedSourceAvailabilityDate }
        : {},
      { headers: { 'Idempotency-Key': input.idempotencyKey } },
    )
    .then((response) => SellpiaProfitabilityAttemptSchema.parse(response));
}
