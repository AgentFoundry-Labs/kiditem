'use client';

import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCollectionSourceControl } from '@/hooks/use-collection-source-control';
import { rocketPoCollection, rocketPoSourceQueryOptions } from '@/lib/rocket-po-collection';
import { queryKeys } from '@/lib/query-keys';

/** The account-scoped Rocket PO source read. Polling reads owner state and never starts work. */
export function useRocketPoSource(channelAccountId: string, enabled = true) {
  const client = useQueryClient();
  const source = useQuery({
    ...rocketPoSourceQueryOptions(channelAccountId),
    enabled: enabled && Boolean(channelAccountId),
  });
  const latestCompleteId = source.data?.latestComplete?.attemptId;
  useEffect(() => {
    if (latestCompleteId) void client.invalidateQueries({ queryKey: queryKeys.orders.rocketSavedPoLists() });
  }, [client, latestCompleteId]);
  return source;
}

/** The account's Rocket PO collection control; every mounted copy for the account shares its state. */
export function useRocketPoCollection(channelAccountId: string) {
  const adapter = useMemo(() => rocketPoCollection(channelAccountId), [channelAccountId]);
  return useCollectionSourceControl(adapter);
}
