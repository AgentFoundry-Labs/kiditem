'use client';

import { useQuery } from '@tanstack/react-query';
import { findBrowserCollectionSession } from '@/lib/browser-collection-session';
import { queryKeys } from '@/lib/query-keys';

export function useBrowserCollectionSession(runId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.browserCollection.session(runId ?? ''),
    queryFn: () => findBrowserCollectionSession(runId!),
    enabled: Boolean(runId),
    refetchInterval: (query) =>
      query.state.data?.status === 'running' ? 2_000 : false,
  });
}
