import type { BrowserCollectionSessionView } from '@kiditem/shared/browser-collection-session';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';

const RUN_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const mockFindSession = vi.hoisted(() => vi.fn());

vi.mock('@/lib/browser-collection-session', () => ({
  findBrowserCollectionSession: mockFindSession,
}));

import { useBrowserCollectionSession } from './useBrowserCollectionSession';

function session(
  overrides: Partial<BrowserCollectionSessionView> = {},
): BrowserCollectionSessionView {
  return {
    runId: RUN_ID,
    producer: 'dashboard.wing_sales',
    classification: 'background_preferred',
    status: 'running',
    attempt: 1,
    restartStrategy: 'web',
    progress: {
      current: 1,
      total: 3,
      completed: 0,
      failed: 0,
      label: 'Wing 매출 수집',
    },
    inputIdentity: { trigger: 'dashboard_traffic' },
    attention: null,
    startedAt: 1_700_000_000_000,
    updatedAt: 1_700_000_001_000,
    finishedAt: null,
    ...overrides,
  };
}

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('useBrowserCollectionSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindSession.mockResolvedValue(session());
  });

  it('does not query extensions without a run ID', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderHook(() => useBrowserCollectionSession(null), {
      wrapper: wrapper(queryClient),
    });
    await Promise.resolve();

    expect(mockFindSession).not.toHaveBeenCalled();
  });

  it('loads the run through the shared browser collection query key', async () => {
    const current = session();
    mockFindSession.mockResolvedValue(current);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useBrowserCollectionSession(RUN_ID), {
      wrapper: wrapper(queryClient),
    });

    await waitFor(() => expect(result.current.data).toEqual(current));
    expect(mockFindSession).toHaveBeenCalledWith(RUN_ID);
    expect(
      queryClient.getQueryData(queryKeys.browserCollection.session(RUN_ID)),
    ).toEqual(current);
  });

  it('polls every two seconds only while the latest session is running', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useBrowserCollectionSession(RUN_ID), {
      wrapper: wrapper(queryClient),
    });
    await waitFor(() => expect(result.current.data?.status).toBe('running'));

    const query = queryClient.getQueryCache().find({
      queryKey: queryKeys.browserCollection.session(RUN_ID),
    });
    const interval = query?.options.refetchInterval;
    expect(typeof interval).toBe('function');
    expect(
      typeof interval === 'function' ? interval(query!) : interval,
    ).toBe(2_000);

    queryClient.setQueryData(
      queryKeys.browserCollection.session(RUN_ID),
      session({
        status: 'attention_required',
        attention: {
          reason: 'marketplace_login',
          message: '로그인이 필요합니다.',
          canOpenTab: true,
        },
      }),
    );
    expect(
      typeof interval === 'function' ? interval(query!) : interval,
    ).toBe(false);
  });
});
