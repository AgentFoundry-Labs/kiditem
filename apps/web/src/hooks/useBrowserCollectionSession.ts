'use client';

import { BrowserCollectionSessionViewSchema } from '@kiditem/shared/browser-collection-session';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  findBrowserCollectionSession,
  isBrowserCollectionSessionLocallyRunning,
  preferBrowserCollectionSession,
} from '@/lib/browser-collection-session';
import { queryKeys } from '@/lib/query-keys';

export function useBrowserCollectionSession(
  attemptId: string | null | undefined,
  options: { enabled?: boolean } = {},
) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.browserCollection.session(attemptId ?? ''),
    queryFn: async () => {
      const candidate = await findBrowserCollectionSession(attemptId!);
      const cached = queryClient.getQueryData(
        queryKeys.browserCollection.session(attemptId!),
      );
      const parsedCurrent = BrowserCollectionSessionViewSchema.safeParse(cached);
      const current = parsedCurrent.success ? parsedCurrent.data : null;
      return preferBrowserCollectionSession(current, candidate);
    },
    enabled: Boolean(attemptId) && options.enabled !== false,
    refetchInterval: (query) =>
      query.state.data && isBrowserCollectionSessionLocallyRunning(query.state.data)
        ? 2_000
        : false,
  });
}
