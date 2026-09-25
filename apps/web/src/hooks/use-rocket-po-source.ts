'use client';

import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCollectionSourceControl } from '@/hooks/use-collection-source-control';
import { rocketPoCollection, rocketPoOperationsQueryOptions, rocketPoSourceView } from '@/lib/rocket-po-collection';
import { queryKeys } from '@/lib/query-keys';

/** 한 계정의 로켓 PO 원천 보기(실행 reader를 계정으로 나눈다). 읽기만 하고 수집을 시작하지 않는다. */
export function useRocketPoSource(channelAccountId: string, enabled = true) {
  const client = useQueryClient();
  const source = useQuery({
    ...rocketPoOperationsQueryOptions(),
    enabled: enabled && Boolean(channelAccountId),
    select: (response) => rocketPoSourceView(response, channelAccountId),
  });
  const latestCompleteId = source.data?.latestComplete?.attemptId;
  useEffect(() => {
    if (latestCompleteId) void client.invalidateQueries({ queryKey: queryKeys.orders.rocketSavedPoLists() });
  }, [client, latestCompleteId]);
  return source;
}

/** 계정의 로켓 PO 수집 컨트롤. 같은 계정의 모든 컨트롤이 상태를 나눈다. */
export function useRocketPoCollection(channelAccountId: string) {
  const adapter = useMemo(() => rocketPoCollection(channelAccountId), [channelAccountId]);
  return useCollectionSourceControl(adapter);
}
