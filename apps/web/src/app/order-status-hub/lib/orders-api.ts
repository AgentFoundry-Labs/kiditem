import {
  OrderListResponseSchema,
  OrderStatsResponseSchema,
  type OrderListResponse,
  type OrderStatsResponse,
} from '@kiditem/shared';
import { apiClient } from '@/lib/api-client';

export interface OrderListParams {
  from?: string;
  to?: string;
  status?: string;
}

function searchParams(params: OrderListParams): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') sp.set(key, String(value));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export function orderListKeyParams(params: OrderListParams): Record<string, string> {
  const result: Record<string, string> = {};
  if (params.from) result.from = params.from;
  if (params.to) result.to = params.to;
  if (params.status) result.status = params.status;
  return result;
}

export async function fetchOrderList(params: OrderListParams): Promise<OrderListResponse> {
  return apiClient.getParsed(`/api/orders${searchParams(params)}`, OrderListResponseSchema);
}

export async function fetchOrderStats(): Promise<OrderStatsResponse> {
  return apiClient.getParsed('/api/orders/stats', OrderStatsResponseSchema);
}
