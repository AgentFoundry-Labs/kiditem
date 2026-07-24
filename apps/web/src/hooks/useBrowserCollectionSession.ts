'use client';

import { BrowserCollectionSessionViewSchema } from '@kiditem/shared/browser-collection-session';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  findBrowserCollectionSession,
  preferBrowserCollectionSession,
} from '@/lib/browser-collection-session';
import { queryKeys } from '@/lib/query-keys';

export function useBrowserCollectionSession(
  runId: string | null | undefined,
  options: { enabled?: boolean } = {},
) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.browserCollection.session(runId ?? ''),
    queryFn: async () => {
      const candidate = await findBrowserCollectionSession(runId!);
      const cached = queryClient.getQueryData(
        queryKeys.browserCollection.session(runId!),
      );
      const parsedCurrent = BrowserCollectionSessionViewSchema.safeParse(cached);
      const current = parsedCurrent.success ? parsedCurrent.data : null;
      return preferBrowserCollectionSession(current, candidate);
    },
    enabled: Boolean(runId) && options.enabled !== false,
    refetchInterval: (query) =>
      query.state.data?.status === 'running' ? 2_000 : false,
  });
}
