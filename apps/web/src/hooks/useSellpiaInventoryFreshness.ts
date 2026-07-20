'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { sellpiaInventoryFreshnessApi } from '@/lib/sellpia-inventory-freshness-api';
import { invalidateSellpiaInventory } from '@/app/(inventory)/_shared/invalidate-sellpia-inventory';

const FRESHNESS_POLL_MS = 15_000;

export function useSellpiaInventoryFreshness({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const freshness = useQuery({
    queryKey: queryKeys.inventory.freshness(),
    queryFn: sellpiaInventoryFreshnessApi.getState,
    enabled,
    refetchInterval: enabled ? FRESHNESS_POLL_MS : false,
  });
  const history = useQuery({
    queryKey: queryKeys.inventory.historyList({ page: '1', limit: '20' }),
    queryFn: () => sellpiaInventoryFreshnessApi.listHistory({ page: 1, limit: 20 }),
    enabled,
  });
  const currentBasis = useQuery({
    queryKey: queryKeys.inventory.currentBasis(),
    queryFn: sellpiaInventoryFreshnessApi.getCurrentBasis,
    enabled,
  });

  const invalidateFreshness = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.freshness() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.history() }),
    ]);
  }, [queryClient]);

  const importManual = useCallback(async (file: File, confirmed: true) => {
    const result = await sellpiaInventoryFreshnessApi.importManual(file, confirmed);
    await invalidateSellpiaInventory(queryClient);
    return result;
  }, [queryClient]);

  const requestRefresh = useCallback(async (reason: 'manual_request' | 'retry') => {
    const state = await sellpiaInventoryFreshnessApi.requestRefresh(reason);
    await invalidateFreshness();
    return state;
  }, [invalidateFreshness]);

  const confirmSourceBinding = useCallback(async () => {
    const state = await sellpiaInventoryFreshnessApi.confirmSourceBinding();
    await invalidateFreshness();
    return state;
  }, [invalidateFreshness]);

  return {
    state: freshness.data ?? null,
    pollVersion: freshness.dataUpdatedAt,
    currentBasis: currentBasis.data ?? null,
    history: history.data?.items ?? [],
    isLoading: freshness.isLoading,
    isHistoryLoading: history.isLoading,
    error: freshness.error,
    importManual,
    requestRefresh,
    confirmSourceBinding,
    invalidateFreshness,
  };
}
