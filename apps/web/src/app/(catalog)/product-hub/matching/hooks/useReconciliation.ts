'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type {
  ReconciliationItemListResponse,
  ReconciliationScanRequest,
  ReconciliationScanResponse,
  ReconciliationSummary,
  ReconciliationItem,
} from '@kiditem/shared/channel-reconciliation';

const BASE = '/api/channels/reconciliation/coupang';

export type ReconciliationStatusFilter =
  | 'all'
  | 'auto_linked'
  | 'needs_review'
  | 'conflict'
  | 'linked'
  | 'ignored';

interface UseReconciliationItemsParams {
  statusFilter: ReconciliationStatusFilter;
  page: number;
  limit: number;
  search?: string;
}

export function useReconciliationSummary() {
  return useQuery({
    queryKey: queryKeys.channelReconciliation.summary(),
    queryFn: () => apiClient.get<ReconciliationSummary>(`${BASE}/summary`),
  });
}

export function useReconciliationItems(params: UseReconciliationItemsParams) {
  // The "auto_linked" tab is a server-side `linked` slice with
  // `resolutionSource = auto_legacy_code` so pagination remains accurate.
  const serverStatus =
    params.statusFilter === 'auto_linked' ? 'linked' : params.statusFilter;

  const query: Record<string, string> = {
    page: String(params.page),
    limit: String(params.limit),
  };
  if (serverStatus !== 'all') query.status = serverStatus;
  if (params.statusFilter === 'auto_linked') {
    query.resolutionSource = 'auto_legacy_code';
  }
  if (params.search?.trim()) query.search = params.search.trim();

  return useQuery({
    queryKey: queryKeys.channelReconciliation.items(query),
    queryFn: () =>
      apiClient.get<ReconciliationItemListResponse>(
        `${BASE}/items?${new URLSearchParams(query).toString()}`,
      ),
  });
}

export function useScanReconciliation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ReconciliationScanRequest) =>
      apiClient.post<ReconciliationScanResponse>(`${BASE}/scan-from-rows`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.channelReconciliation.all });
    },
  });
}

export function useSyncReconciliationSnapshots() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post<ReconciliationScanResponse>(`${BASE}/sync-from-snapshots`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.channelReconciliation.all });
    },
  });
}

export function useSyncReconciliationCatalog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiClient.post<ReconciliationScanResponse>(`${BASE}/sync-catalog`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.channelReconciliation.all });
    },
  });
}

export function useLinkReconciliationItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; productOptionId: string }) =>
      apiClient.post<ReconciliationItem>(`${BASE}/items/${vars.id}/link`, {
        productOptionId: vars.productOptionId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.channelReconciliation.all });
    },
  });
}

export function useIgnoreReconciliationItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; reason?: string | null }) =>
      apiClient.post<ReconciliationItem>(`${BASE}/items/${vars.id}/ignore`, {
        reason: vars.reason ?? null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.channelReconciliation.all });
    },
  });
}
