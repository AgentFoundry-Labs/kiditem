'use client';

import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { collectAndPersistRocketPurchaseOrders, type CollectAndPersistRocketPurchaseOrdersInput } from '@/lib/rocket-purchase-collection-action';
import { loadRocketPoSource } from '@/lib/rocket-sales-collection';
import { createSecureRandomUuid } from '@/lib/secure-random-uuid';
import { queryKeys } from '@/lib/query-keys';

type CollectionInput = Omit<CollectAndPersistRocketPurchaseOrdersInput, 'channelAccountId' | 'idempotencyKey' | 'onAttempt'>;

/** Shared explicit CTA/key policy. Polling reads owner state, never starts work. */
export function useRocketPoSource(channelAccountId: string, enabled = true) {
  const client = useQueryClient();
  const requests = useRef(new Map<string, { key: string; attemptId?: string }>());
  const source = useQuery({
    queryKey: queryKeys.orders.rocketPoSource(channelAccountId),
    queryFn: () => loadRocketPoSource(channelAccountId),
    enabled: enabled && Boolean(channelAccountId),
    retry: false,
    refetchInterval: (query) => query.state.data?.refreshing ? 2_000 : false,
    meta: { suppressGlobalErrorToast: true },
  });
  const latestCompleteId = source.data?.latestComplete?.attemptId;
  useEffect(() => {
    if (latestCompleteId) void client.invalidateQueries({ queryKey: queryKeys.orders.rocketSavedPoLists() });
  }, [client, latestCompleteId]);
  useEffect(() => {
    const observed = source.data?.latestAttempt;
    if (!observed || observed.state === 'RUNNING') return;
    for (const [fingerprint, request] of requests.current) {
      if (request.attemptId === observed.attemptId) requests.current.delete(fingerprint);
    }
  }, [source.data]);
  const mutation = useMutation({
    mutationFn: async (input: CollectionInput) => {
      const fingerprint = JSON.stringify([channelAccountId, input.from, input.to]);
      const request = requests.current.get(fingerprint) ?? { key: createSecureRandomUuid() };
      requests.current.set(fingerprint, request);
      return collectAndPersistRocketPurchaseOrders({
        ...input, channelAccountId, idempotencyKey: request.key,
        onAttempt: (attempt) => {
          request.attemptId = attempt.attemptId;
          if (attempt.state !== 'RUNNING') requests.current.delete(fingerprint);
        },
      });
    },
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.orders.rocketPoSource(channelAccountId) }),
  });
  return { ...source, collect: mutation.mutateAsync, isCollecting: mutation.isPending || source.data?.refreshing === true };
}
