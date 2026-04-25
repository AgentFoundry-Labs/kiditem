import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import {
  AdjustStockInputSchema,
  InventoryListResponseSchema,
  InventorySchema,
  IssueStockInputSchema,
  ReceiveStockInputSchema,
  StockOperationResultSchema,
  TransactionListResponseSchema,
  TransactionSummarySchema,
  UpdateInventoryMetadataInputSchema,
} from '@kiditem/shared';
import type {
  AdjustStockInput,
  Inventory,
  InventoryListResponse,
  InventoryStatus,
  IssueStockInput,
  ReceiveStockInput,
  StockOperationResult,
  TransactionListItem,
  TransactionListResponse,
  TransactionSummary,
  UpdateInventoryMetadataInput,
} from '@kiditem/shared';

export type InventoryFilterKey = 'all' | InventoryStatus;

export interface InventoryListParams {
  page?: number;
  limit?: number;
  status?: InventoryStatus;
  optionId?: string;
  masterId?: string;
}

export interface TransactionListParams {
  page?: number;
  limit?: number;
  optionId?: string;
  type?: 'RECEIVE' | 'ISSUE' | 'ADJUST';
  from?: string;
  to?: string;
}

function searchParams(params: InventoryListParams | TransactionListParams): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') sp.set(key, String(value));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export function inventoryListKeyParams(params: InventoryListParams): Record<string, string> {
  const result: Record<string, string> = {};
  if (params.page !== undefined) result.page = String(params.page);
  if (params.limit !== undefined) result.limit = String(params.limit);
  if (params.status !== undefined) result.status = params.status;
  if (params.optionId) result.optionId = params.optionId;
  if (params.masterId) result.masterId = params.masterId;
  return result;
}

export function transactionKeyParams(params: TransactionListParams): Record<string, string> {
  const result: Record<string, string> = {};
  if (params.page !== undefined) result.page = String(params.page);
  if (params.limit !== undefined) result.limit = String(params.limit);
  if (params.optionId) result.optionId = params.optionId;
  if (params.type) result.type = params.type;
  if (params.from) result.from = params.from;
  if (params.to) result.to = params.to;
  return result;
}

export async function fetchInventoryList(params: InventoryListParams): Promise<InventoryListResponse> {
  return apiClient.getParsed(`/api/inventory${searchParams(params)}`, InventoryListResponseSchema);
}

export async function fetchInventoryDetail(id: string): Promise<Inventory> {
  return apiClient.getParsed(`/api/inventory/${id}`, InventorySchema);
}

export async function updateInventoryMetadata(
  id: string,
  input: UpdateInventoryMetadataInput,
): Promise<Inventory> {
  const body = UpdateInventoryMetadataInputSchema.parse(input);
  const raw = await apiClient.patch<unknown>(`/api/inventory/${id}`, body);
  return InventorySchema.parse(raw);
}

export async function receiveStock(id: string, input: ReceiveStockInput): Promise<StockOperationResult> {
  const body = ReceiveStockInputSchema.parse(input);
  const raw = await apiClient.post<unknown>(`/api/inventory/${id}/receive`, body);
  return StockOperationResultSchema.parse(raw);
}

export async function issueStock(id: string, input: IssueStockInput): Promise<StockOperationResult> {
  const body = IssueStockInputSchema.parse(input);
  const raw = await apiClient.post<unknown>(`/api/inventory/${id}/issue`, body);
  return StockOperationResultSchema.parse(raw);
}

export async function adjustStock(id: string, input: AdjustStockInput): Promise<StockOperationResult> {
  const body = AdjustStockInputSchema.parse(input);
  const raw = await apiClient.post<unknown>(`/api/inventory/${id}/adjust`, body);
  return StockOperationResultSchema.parse(raw);
}

export async function fetchTransactions(params: TransactionListParams): Promise<TransactionListResponse> {
  return apiClient.getParsed(
    `/api/inventory/transactions${searchParams(params)}`,
    TransactionListResponseSchema,
  );
}

const TRANSACTIONS_PAGE_SIZE = 200;

/**
 * Build a closed `[from, to]` ISO8601 window for a `YYYY-MM` period.
 * Used by inventory-hub StockIo / StockLedger to scope transaction reads
 * to a single calendar month under the server `@IsISO8601` DTO.
 */
export function monthPeriodWindow(period: string): { from: string; to: string } {
  const [year, month] = period.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${period}-01T00:00:00.000Z`,
    to: `${period}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`,
  };
}

/**
 * Fetch every transaction for a window by paging through `/api/inventory/transactions`.
 * Server DTO caps `limit` at @Max(200) — this helper assembles all pages so callers that
 * derive period-scoped totals (StockIo KPIs, StockLedger ledger) do not silently truncate
 * when a period has > 200 transactions.
 */
export async function fetchAllTransactionsInWindow(
  params: Omit<TransactionListParams, 'page' | 'limit'>,
): Promise<TransactionListItem[]> {
  const first = await fetchTransactions({
    ...params,
    page: 1,
    limit: TRANSACTIONS_PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(first.total / TRANSACTIONS_PAGE_SIZE));
  const rest: TransactionListItem[] = [];
  for (let page = 2; page <= totalPages; page += 1) {
    const data = await fetchTransactions({
      ...params,
      page,
      limit: TRANSACTIONS_PAGE_SIZE,
    });
    rest.push(...data.items);
  }
  return [...first.items, ...rest];
}

export async function fetchTransactionSummary(days: number): Promise<TransactionSummary> {
  const safeDays = z.number().int().min(1).max(365).parse(days);
  return apiClient.getParsed(
    `/api/inventory/transactions/summary?days=${safeDays}`,
    TransactionSummarySchema,
  );
}
