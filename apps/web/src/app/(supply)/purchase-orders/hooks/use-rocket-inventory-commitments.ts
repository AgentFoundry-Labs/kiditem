'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listRocketInventoryCommitments,
  releaseRocketFinalOrderCommitments,
  settleRocketFinalOrderCommitments,
} from '../lib/rocket-inventory-commitment-api';

export function useRocketInventoryCommitments(channelAccountId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['rocket-inventory-commitments', channelAccountId] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => listRocketInventoryCommitments({
      channelAccountId,
      limit: 50,
    }),
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
