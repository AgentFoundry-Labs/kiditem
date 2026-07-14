'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  findBrowserCollectionSession,
  preferBrowserCollectionSession,
} from '@/lib/browser-collection-session';
import { queryKeys } from '@/lib/query-keys';

export function useBrowserCollectionSession(runId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.browserCollection.session(runId ?? ''),
    queryFn: async () => {
      const candidate = await findBrowserCollectionSession(runId!);
      const current = queryClient.getQueryData(
        queryKeys.browserCollection.session(runId!),
      );
      return preferBrowserCollectionSession(current, candidate);
    },
    enabled: Boolean(runId),
    refetchInterval: (query) =>
      query.state.data?.status === 'running' ? 2_000 : false,
  });
}
