'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SellpiaInventoryFreshnessStatus } from '@kiditem/shared/sellpia-inventory-freshness';
import { ZodError } from 'zod';
import { isApiError } from '@/lib/api-error';
import { operationsApi } from '@/lib/operations-api';
import { queryKeys } from '@/lib/query-keys';
import { sellpiaInventoryFreshnessApi } from '@/lib/sellpia-inventory-freshness-api';

export const SELLPIA_ACTIVE_POLL_MS = 15_000;
export const SELLPIA_IDLE_POLL_MS = 60_000;

export function getSellpiaFreshnessPollInterval(
  enabled: boolean,
  status: SellpiaInventoryFreshnessStatus | null,
  hasError: boolean,
): number | false {
  if (!enabled) return false;
  if (
    !hasError
    && (status === 'refresh_required' || status === 'syncing')
  ) {
    return SELLPIA_ACTIVE_POLL_MS;
  }
  return SELLPIA_IDLE_POLL_MS;
}

export function shouldRetrySellpiaFreshness(
  failureCount: number,
  error: unknown,
): boolean {
  if (failureCount >= 1) return false;
  if (error instanceof ZodError) return false;
  if (!isApiError(error)) return true;
  return error.status === 502 || error.status === 503 || error.status === 504;
}

export function useSellpiaInventoryFreshness({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const freshness = useQuery({
    queryKey: queryKeys.inventory.freshness(),
    queryFn: sellpiaInventoryFreshnessApi.getState,
    enabled,
    retry: shouldRetrySellpiaFreshness,
    refetchInterval: (query) => getSellpiaFreshnessPollInterval(
      enabled,
      query.state.data?.status ?? null,
      query.state.error !== null,
    ),
    refetchIntervalInBackground: false,
  });
  const invalidateFreshness = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.freshness() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.history() }),
    ]);
  }, [queryClient]);

  const requestRefresh = useCallback(async (reason: 'manual_request' | 'retry') => {
    const run = await operationsApi.start('inventory.refresh_sellpia_snapshot', {
      sourceSurface: 'domain_screen',
      input: { reason },
    });
    await invalidateFreshness();
    return run;
  }, [invalidateFreshness]);

  return {
    state: freshness.data ?? null,
    pollVersion: freshness.dataUpdatedAt,
    isLoading: freshness.isLoading,
    error: freshness.error,
    requestRefresh,
    invalidateFreshness,
  };
}
