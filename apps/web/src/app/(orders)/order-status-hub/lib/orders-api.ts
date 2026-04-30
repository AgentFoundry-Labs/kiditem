import {
  OrderListResponseSchema,
  OrderStatsResponseSchema,
  type OrderListItem,
  type OrderListResponse,
  type OrderStatus,
  type OrderStatsResponse,
} from '@kiditem/shared/order';
import { apiClient } from '@/lib/api-client';

const ORDER_LIST_STATUSES: OrderStatus[] = [
  'ACCEPT',
  'INSTRUCT',
  'DEPARTURE',
  'DELIVERING',
  'FINAL_DELIVERY',
  'CANCELED',
];

interface OrderListParams {
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

function orderListKeyParams(params: OrderListParams): Record<string, string> {
  const result: Record<string, string> = {};
  if (params.from) result.from = params.from;
  if (params.to) result.to = params.to;
  if (params.status) result.status = params.status;
  return result;
}

export function allOrderStatusesKeyParams(
  params: Omit<OrderListParams, 'status'>,
): Record<string, string> {
  return {
    ...orderListKeyParams(params),
    statuses: ORDER_LIST_STATUSES.join(','),
  };
}

async function fetchOrderList(params: OrderListParams): Promise<OrderListResponse> {
  return apiClient.getParsed(`/api/orders${searchParams(params)}`, OrderListResponseSchema);
}

export async function fetchOrderListAcrossStatuses(
  params: Omit<OrderListParams, 'status'>,
): Promise<OrderListResponse> {
  const responses = await Promise.all(
    ORDER_LIST_STATUSES.map((status) => fetchOrderList({ ...params, status })),
  );

  const byId = new Map<string, OrderListItem>();
  for (const response of responses) {
    for (const item of response.items) byId.set(item.id, item);
  }

  const items = [...byId.values()].sort(
    (a, b) => new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime(),
  );

  return {
    items,
    total: items.length,
    deliveryCompanies: responses[0]?.deliveryCompanies ?? [],
  } satisfies OrderListResponse;
}

export async function fetchOrderStats(): Promise<OrderStatsResponse> {
  return apiClient.getParsed('/api/orders/stats', OrderStatsResponseSchema);
}
