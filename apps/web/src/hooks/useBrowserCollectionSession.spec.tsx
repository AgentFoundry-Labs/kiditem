import type { BrowserCollectionSessionView } from '@kiditem/shared/browser-collection-session';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';

const ATTEMPT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const mockFindSession = vi.hoisted(() => vi.fn());

vi.mock('@/lib/browser-collection-session', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/browser-collection-session')
  >()),
  findBrowserCollectionSession: mockFindSession,
}));

import { useBrowserCollectionSession } from './useBrowserCollectionSession';

function session(
  overrides: Partial<BrowserCollectionSessionView> = {},
): BrowserCollectionSessionView {
  return {
    attemptId: ATTEMPT_ID,
    producer: 'advertising.ad_keyword',
    progress: {
      current: 1,
      total: 3,
      completed: 0,
      failed: 0,
      label: 'Wing 매출 수집',
    },
    attention: null,
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

  it('does not query extensions without an owner attempt ID', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderHook(() => useBrowserCollectionSession(null), {
      wrapper: wrapper(queryClient),
    });
    await Promise.resolve();

    expect(mockFindSession).not.toHaveBeenCalled();
  });

  it('does not start a second observer when the caller disables polling', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderHook(() => useBrowserCollectionSession(ATTEMPT_ID, { enabled: false }), {
      wrapper: wrapper(queryClient),
    });
    await Promise.resolve();

    expect(mockFindSession).not.toHaveBeenCalled();
  });

  it('loads the owner attempt through the shared browser collection query key', async () => {
    const current = session();
    mockFindSession.mockResolvedValue(current);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useBrowserCollectionSession(ATTEMPT_ID), {
      wrapper: wrapper(queryClient),
    });

    await waitFor(() => expect(result.current.data).toEqual(current));
    expect(mockFindSession).toHaveBeenCalledWith(ATTEMPT_ID);
    expect(
      queryClient.getQueryData(queryKeys.browserCollection.session(ATTEMPT_ID)),
    ).toEqual(current);
  });

  it('polls while local progress is active and stops after local progress completes', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useBrowserCollectionSession(ATTEMPT_ID), {
      wrapper: wrapper(queryClient),
    });
    await waitFor(() => expect(result.current.data?.progress.current).toBe(1));

    const query = queryClient.getQueryCache().find({
      queryKey: queryKeys.browserCollection.session(ATTEMPT_ID),
    });
    const interval = query?.options.refetchInterval;
    expect(typeof interval).toBe('function');
    expect(
      typeof interval === 'function' ? interval(query!) : interval,
    ).toBe(2_000);

    queryClient.setQueryData(
      queryKeys.browserCollection.session(ATTEMPT_ID),
      session({
        progress: {
          current: 3,
          total: 3,
          completed: 3,
          failed: 0,
          label: 'Wing 매출 수집 완료',
        },
      }),
    );
    expect(
      typeof interval === 'function' ? interval(query!) : interval,
    ).toBe(false);
  });

  it('accepts a same-progress attention update because transport has no revision field', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const attention = session({
      attention: {
        reason: 'marketplace_login',
        message: '로그인이 필요합니다.',
        canOpenTab: true,
      },
    });
    queryClient.setQueryData(
      queryKeys.browserCollection.session(ATTEMPT_ID),
      session(),
    );
    mockFindSession.mockResolvedValue(attention);

    const { result } = renderHook(() => useBrowserCollectionSession(ATTEMPT_ID), {
      wrapper: wrapper(queryClient),
    });

    await waitFor(() => expect(result.current.data).toEqual(attention));
    expect(
      queryClient.getQueryData(queryKeys.browserCollection.session(ATTEMPT_ID)),
    ).toEqual(attention);
  });

  it('ignores malformed cached data before returning the strict owner session', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(
      queryKeys.browserCollection.session(ATTEMPT_ID),
      { runId: ATTEMPT_ID, status: 'running', updatedAt: Number.MAX_SAFE_INTEGER },
    );
    const current = session();
    mockFindSession.mockResolvedValueOnce(current);

    const { result } = renderHook(() => useBrowserCollectionSession(ATTEMPT_ID), {
      wrapper: wrapper(queryClient),
    });

    await waitFor(() => expect(result.current.data).toEqual(current));
  });
});
