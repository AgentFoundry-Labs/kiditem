import {
  InventorySkuSnapshotListResponseSchema,
  type InventorySkuSnapshotItem,
  type InventorySkuSnapshotListResponse,
  type InventorySkuStockStatus,
  type SellpiaInventorySkuLinkStatus,
} from '@kiditem/shared/inventory';
import {
  ChannelSkuAvailabilityListResponseSchema,
  type ChannelSkuAvailabilityListResponse,
  type ChannelSkuAvailabilityStatus,
} from '@kiditem/shared/channel-sku-availability';
import { apiClient } from '@/lib/api-client';

export interface SellpiaInventorySkuListParams {
  page?: number;
  limit?: number;
  query?: string;
  stockStatus?: InventorySkuStockStatus;
  linkStatus?: SellpiaInventorySkuLinkStatus;
}

export interface ChannelSkuAvailabilityListParams {
  channelAccountId?: string;
  status?: ChannelSkuAvailabilityStatus;
  hasBottleneck?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

type QueryValue = string | number | boolean | undefined;

function withSearchParams(path: string, params: object): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, QueryValue][]) {
    if (value !== undefined && value !== '') searchParams.set(key, String(value));
  }
  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

export function sellpiaInventoryKeyParams(
  params: SellpiaInventorySkuListParams,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key, value]) => [key, String(value)]),
  );
}

export function channelSkuAvailabilityKeyParams(
  params: ChannelSkuAvailabilityListParams,
): Record<string, string> {
  return sellpiaInventoryKeyParams(params);
}

export async function listSellpiaInventorySkus(
  params: SellpiaInventorySkuListParams = {},
): Promise<InventorySkuSnapshotListResponse> {
  return apiClient.getParsed(
    withSearchParams('/api/inventory/sellpia-skus', params),
    InventorySkuSnapshotListResponseSchema,
  );
}

export async function fetchAllSellpiaInventorySkus(
  params: Omit<SellpiaInventorySkuListParams, 'page' | 'limit'> = {},
): Promise<InventorySkuSnapshotItem[]> {
  const response = await apiClient.getParsed(
    withSearchParams('/api/inventory/sellpia-skus/export-snapshot', params),
    InventorySkuSnapshotListResponseSchema,
  );
  if (response.items.length !== response.total) {
    throw new Error('Sellpia 재고 출력 스냅샷의 행 수가 일치하지 않습니다.');
  }
  return response.items;
}

export async function listChannelSkuAvailability(
  params: ChannelSkuAvailabilityListParams = {},
): Promise<ChannelSkuAvailabilityListResponse> {
  return apiClient.getParsed(
    withSearchParams('/api/channels/sku-availability', params),
    ChannelSkuAvailabilityListResponseSchema,
  );
}
