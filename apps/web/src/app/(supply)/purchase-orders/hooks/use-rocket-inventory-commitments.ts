'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listRocketInventoryCommitments,
  releaseRocketFinalOrderCommitments,
  settleRocketFinalOrderCommitments,
} from '../lib/rocket-inventory-commitment-api';

export function useRocketInventoryCommitments(channelAccountId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['rocket-inventory-commitments', channelAccountId] as const;
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => listRocketInventoryCommitments({
      channelAccountId,
      ...(pageParam ? { cursor: pageParam } : {}),
      limit: 50,
    }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(channelAccountId),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey });
  const settle = useMutation({
    mutationFn: settleRocketFinalOrderCommitments,
    onSuccess: invalidate,
  });
  const release = useMutation({
    mutationFn: releaseRocketFinalOrderCommitments,
    onSuccess: invalidate,
  });
  return { query, settle, release, invalidate };
}
