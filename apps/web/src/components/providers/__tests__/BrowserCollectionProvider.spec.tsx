import type { BrowserCollectionSessionView } from '@kiditem/shared/browser-collection-session';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';

const ATTEMPT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const mockListSessions = vi.hoisted(() => vi.fn());

vi.mock('@/lib/browser-collection-session', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/browser-collection-session')
  >()),
  listBrowserCollectionSessions: mockListSessions,
}));

import {
  BROWSER_COLLECTION_SESSION_EVENT,
  BrowserCollectionProvider,
} from '../BrowserCollectionProvider';

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

function renderProvider({
  enabled = true,
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
}: {
  enabled?: boolean;
  queryClient?: QueryClient;
} = {}) {
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <BrowserCollectionProvider enabled={enabled}>
          <div>provider child</div>
        </BrowserCollectionProvider>
      </QueryClientProvider>,
    ),
  };
}

describe('BrowserCollectionProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListSessions.mockResolvedValue([]);
    localStorage.clear();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  it('reconciles strict extension sessions on the initial authenticated mount', async () => {
    const current = session();
    mockListSessions.mockResolvedValue([current]);

    const { queryClient } = renderProvider();

    await waitFor(() => expect(mockListSessions).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(
      queryClient.getQueryData(queryKeys.browserCollection.session(ATTEMPT_ID)),
    ).toEqual(current));
  });

  it('synchronizes a strict custom session event', async () => {
    const current = session({
      progress: {
        current: 3,
        total: 3,
        completed: 3,
        failed: 0,
        label: 'Wing 매출 수집 완료',
      },
    });
    const { queryClient } = renderProvider();
    await waitFor(() => expect(mockListSessions).toHaveBeenCalledTimes(1));

    act(() => {
      window.dispatchEvent(
        new CustomEvent(BROWSER_COLLECTION_SESSION_EVENT, { detail: current }),
      );
    });

    await waitFor(() => expect(
      queryClient.getQueryData(
        queryKeys.browserCollection.session(current.attemptId),
      ),
    ).toEqual(current));
  });

  it('leaves inventory-owned sessions to the inventory owner', async () => {
    const sellpia = session({ producer: 'inventory.sellpia' });
    mockListSessions.mockResolvedValue([sellpia]);
    const { queryClient } = renderProvider();

    await waitFor(() => expect(mockListSessions).toHaveBeenCalledTimes(1));
    expect(
      queryClient.getQueryData(queryKeys.browserCollection.session(ATTEMPT_ID)),
    ).toBeUndefined();

    act(() => {
      window.dispatchEvent(
        new CustomEvent(BROWSER_COLLECTION_SESSION_EVENT, { detail: sellpia }),
      );
    });
    await Promise.resolve();
    expect(
      queryClient.getQueryData(queryKeys.browserCollection.session(ATTEMPT_ID)),
    ).toBeUndefined();
  });

  it('rejects malformed custom session events before caching', async () => {
    const { queryClient } = renderProvider();
    await waitFor(() => expect(mockListSessions).toHaveBeenCalledTimes(1));

    act(() => {
      window.dispatchEvent(
        new CustomEvent(BROWSER_COLLECTION_SESSION_EVENT, {
          detail: { runId: ATTEMPT_ID, status: 'running', tabId: 42 },
        }),
      );
    });

    expect(queryClient.getQueryData(queryKeys.browserCollection.session(ATTEMPT_ID))).toBeUndefined();
  });

  it('accepts same-count attention, disappearance, and reappearance events in delivery order', async () => {
    const { queryClient } = renderProvider();
    await waitFor(() => expect(mockListSessions).toHaveBeenCalledTimes(1));
    const attention = session({
      attention: {
        reason: 'marketplace_login',
        message: '로그인이 필요합니다.',
        canOpenTab: true,
      },
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent(BROWSER_COLLECTION_SESSION_EVENT, { detail: attention }),
      );
    });
    await waitFor(() => expect(
      queryClient.getQueryData(queryKeys.browserCollection.session(ATTEMPT_ID)),
    ).toEqual(attention));

    act(() => {
      window.dispatchEvent(
        new CustomEvent(BROWSER_COLLECTION_SESSION_EVENT, { detail: session() }),
      );
    });
    await waitFor(() => expect(
      queryClient.getQueryData(queryKeys.browserCollection.session(ATTEMPT_ID)),
    ).toEqual(session()));

    act(() => {
      window.dispatchEvent(
        new CustomEvent(BROWSER_COLLECTION_SESSION_EVENT, { detail: attention }),
      );
    });
    await waitFor(() => expect(
      queryClient.getQueryData(queryKeys.browserCollection.session(ATTEMPT_ID)),
    ).toEqual(attention));
  });

  it.each(['online', 'focus'] as const)(
    'reconciles all sessions after the browser %s event',
    async (eventName) => {
      const current = session();
      renderProvider();
      await waitFor(() => expect(mockListSessions).toHaveBeenCalledTimes(1));
      mockListSessions.mockClear();
      mockListSessions.mockResolvedValue([current]);

      act(() => window.dispatchEvent(new Event(eventName)));

      await waitFor(() => expect(mockListSessions).toHaveBeenCalledTimes(1));
    },
  );

  it('reconciles on visibility recovery only when the page is visible', async () => {
    const current = session();
    renderProvider();
    await waitFor(() => expect(mockListSessions).toHaveBeenCalledTimes(1));
    mockListSessions.mockClear();
    mockListSessions.mockResolvedValue([current]);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(mockListSessions).not.toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    act(() => document.dispatchEvent(new Event('visibilitychange')));

    await waitFor(() => expect(mockListSessions).toHaveBeenCalledTimes(1));
  });

  it('does not listen or reconcile while signed out', async () => {
    renderProvider({ enabled: false });

    act(() => {
      window.dispatchEvent(new Event('online'));
      window.dispatchEvent(
        new CustomEvent(BROWSER_COLLECTION_SESSION_EVENT, { detail: session() }),
      );
    });
    await Promise.resolve();

    expect(mockListSessions).not.toHaveBeenCalled();
  });
});
