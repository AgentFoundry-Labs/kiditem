import {
  InventorySkuSnapshotListResponseSchema,
  SellpiaImportRunListResponseSchema,
  SellpiaReceiptBatchCreateInputSchema,
  SellpiaReceiptBatchMarkUploadedInputSchema,
  SellpiaReceiptUploadBatchSchema,
  type InventorySkuSnapshotItem,
  type InventorySkuSnapshotListResponse,
  type InventorySkuStockStatus,
  type SellpiaImportRunListResponse,
  type SellpiaReceiptBatchCreateInput,
  type SellpiaReceiptBatchMarkUploadedInput,
  type SellpiaReceiptUploadBatch,
} from '@kiditem/shared/inventory';
import {
  ChannelSkuAvailabilityListResponseSchema,
  type ChannelSkuAvailabilityListResponse,
  type ChannelSkuAvailabilityStatus,
} from '@kiditem/shared/channel-sku-availability';
import { z } from 'zod';
import { apiClient } from '@/lib/api-client';

export interface SellpiaInventorySkuListParams {
  page?: number;
  limit?: number;
  query?: string;
  stockStatus?: InventorySkuStockStatus;
}

export interface SellpiaImportRunListParams {
  page?: number;
  limit?: number;
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

export function sellpiaImportRunKeyParams(
  params: SellpiaImportRunListParams,
): Record<string, string> {
  return sellpiaInventoryKeyParams(params);
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

const EXPORT_PAGE_SIZE = 200;
const EXPORT_PAGE_CONCURRENCY = 4;

export async function fetchAllSellpiaInventorySkus(
  params: Omit<SellpiaInventorySkuListParams, 'page' | 'limit'> = {},
): Promise<InventorySkuSnapshotItem[]> {
  const first = await listSellpiaInventorySkus({
    ...params,
    page: 1,
    limit: EXPORT_PAGE_SIZE,
  });
  const items = [...first.items];
  const totalPages = Math.ceil(first.total / EXPORT_PAGE_SIZE);

  for (let firstPage = 2; firstPage <= totalPages; firstPage += EXPORT_PAGE_CONCURRENCY) {
    const pages = Array.from(
      { length: Math.min(EXPORT_PAGE_CONCURRENCY, totalPages - firstPage + 1) },
      (_, index) => firstPage + index,
    );
    const responses = await Promise.all(pages.map((page) => listSellpiaInventorySkus({
      ...params,
      page,
      limit: EXPORT_PAGE_SIZE,
    })));
    for (const response of responses) items.push(...response.items);
  }

  return items.slice(0, first.total);
}

export async function listSellpiaImportRuns(
  params: SellpiaImportRunListParams = {},
): Promise<SellpiaImportRunListResponse> {
  return apiClient.getParsed(
    withSearchParams('/api/inventory/sellpia-sync/import-runs', params),
    SellpiaImportRunListResponseSchema,
  );
}

export async function listChannelSkuAvailability(
  params: ChannelSkuAvailabilityListParams = {},
): Promise<ChannelSkuAvailabilityListResponse> {
  return apiClient.getParsed(
    withSearchParams('/api/channels/sku-availability', params),
    ChannelSkuAvailabilityListResponseSchema,
  );
}

const SellpiaReceiptUploadBatchListSchema = z.array(SellpiaReceiptUploadBatchSchema);

export async function listSellpiaReceiptBatches(): Promise<SellpiaReceiptUploadBatch[]> {
  return apiClient.getParsed(
    '/api/inventory/sellpia-receipt-batches',
    SellpiaReceiptUploadBatchListSchema,
  );
}

export async function createSellpiaReceiptBatch(
  input: SellpiaReceiptBatchCreateInput,
): Promise<SellpiaReceiptUploadBatch> {
  const body = SellpiaReceiptBatchCreateInputSchema.parse(input);
  const raw = await apiClient.post<unknown>('/api/inventory/sellpia-receipt-batches', body);
  return SellpiaReceiptUploadBatchSchema.parse(raw);
}

export async function markSellpiaReceiptBatchUploaded(
  batchId: string,
  input: SellpiaReceiptBatchMarkUploadedInput,
): Promise<SellpiaReceiptUploadBatch> {
  const body = SellpiaReceiptBatchMarkUploadedInputSchema.parse(input);
  const raw = await apiClient.post<unknown>(
    `/api/inventory/sellpia-receipt-batches/${batchId}/mark-uploaded`,
    body,
  );
  return SellpiaReceiptUploadBatchSchema.parse(raw);
}
