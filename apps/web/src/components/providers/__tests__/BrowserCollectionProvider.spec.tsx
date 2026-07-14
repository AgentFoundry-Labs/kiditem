import type { BrowserCollectionSessionView } from '@kiditem/shared/browser-collection-session';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';

const RUN_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const mockListSessions = vi.hoisted(() => vi.fn());
const mockSyncAlert = vi.hoisted(() => vi.fn());

vi.mock('@/lib/browser-collection-session', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/browser-collection-session')
  >()),
  listBrowserCollectionSessions: mockListSessions,
  syncBrowserCollectionAlert: mockSyncAlert,
}));

import {
  BROWSER_COLLECTION_SESSION_EVENT,
  BrowserCollectionProvider,
} from '../BrowserCollectionProvider';

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
    mockSyncAlert.mockResolvedValue(undefined);
    localStorage.clear();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  it('reconciles extension sessions on the initial authenticated mount', async () => {
    const current = session();
    mockListSessions.mockResolvedValue([current]);

    renderProvider();

    await waitFor(() => expect(mockListSessions).toHaveBeenCalledTimes(1));
    expect(mockSyncAlert).toHaveBeenCalledWith(current);
  });

  it('synchronizes a schema-valid custom session event', async () => {
    const current = session({ status: 'succeeded', finishedAt: 1_700_000_002_000 });
    const { queryClient } = renderProvider();
    await waitFor(() => expect(mockListSessions).toHaveBeenCalledTimes(1));
    mockSyncAlert.mockClear();

    act(() => {
      window.dispatchEvent(
        new CustomEvent(BROWSER_COLLECTION_SESSION_EVENT, { detail: current }),
      );
    });

    await waitFor(() => expect(mockSyncAlert).toHaveBeenCalledWith(current));
    expect(
      queryClient.getQueryData(
        queryKeys.browserCollection.session(current.runId),
      ),
    ).toEqual(current);
  });

  it('rejects malformed custom session events before alert synchronization', async () => {
    renderProvider();
    await waitFor(() => expect(mockListSessions).toHaveBeenCalledTimes(1));
    mockSyncAlert.mockClear();

    act(() => {
      window.dispatchEvent(
        new CustomEvent(BROWSER_COLLECTION_SESSION_EVENT, {
          detail: { runId: RUN_ID, status: 'running', tabId: 42 },
        }),
      );
    });

    expect(mockSyncAlert).not.toHaveBeenCalled();
  });

  it.each(['online', 'focus'] as const)(
    'reconciles all sessions after the browser %s event',
    async (eventName) => {
      const current = session();
      renderProvider();
      await waitFor(() => expect(mockListSessions).toHaveBeenCalledTimes(1));
      mockListSessions.mockClear();
      mockListSessions.mockResolvedValue([current]);
      mockSyncAlert.mockClear();

      act(() => window.dispatchEvent(new Event(eventName)));

      await waitFor(() => expect(mockListSessions).toHaveBeenCalledTimes(1));
      expect(mockSyncAlert).toHaveBeenCalledWith(current);
    },
  );

  it('reconciles on visibility recovery only when the page is visible', async () => {
    const current = session();
    renderProvider();
    await waitFor(() => expect(mockListSessions).toHaveBeenCalledTimes(1));
    mockListSessions.mockClear();
    mockListSessions.mockResolvedValue([current]);
    mockSyncAlert.mockClear();

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
    expect(mockSyncAlert).toHaveBeenCalledWith(current);
  });

  it('keeps duplicate session events idempotent through the same run identity', async () => {
    const current = session();
    renderProvider();
    await waitFor(() => expect(mockListSessions).toHaveBeenCalledTimes(1));
    mockSyncAlert.mockClear();

    act(() => {
      window.dispatchEvent(
        new CustomEvent(BROWSER_COLLECTION_SESSION_EVENT, { detail: current }),
      );
      window.dispatchEvent(
        new CustomEvent(BROWSER_COLLECTION_SESSION_EVENT, { detail: current }),
      );
    });

    await waitFor(() => expect(mockSyncAlert).toHaveBeenCalledTimes(1));
    expect(mockSyncAlert).toHaveBeenCalledWith(current);
  });

  it('serializes duplicate providers and ignores an older attempt with a later timestamp', async () => {
    const firstClient = new QueryClient();
    const secondClient = new QueryClient();
    renderProvider({ queryClient: firstClient });
    renderProvider({ queryClient: secondClient });
    await waitFor(() => expect(mockListSessions).toHaveBeenCalledTimes(2));
    mockSyncAlert.mockClear();

    const newerAttempt = session({
      status: 'attention_required',
      attempt: 2,
      updatedAt: 1_700_000_002_000,
      attention: {
        reason: 'marketplace_login',
        message: '로그인이 필요합니다.',
        canOpenTab: true,
      },
    });
    const staleAttempt = session({
      attempt: 1,
      updatedAt: 1_700_000_009_000,
    });

    act(() => {
      window.dispatchEvent(
        new CustomEvent(BROWSER_COLLECTION_SESSION_EVENT, {
          detail: newerAttempt,
        }),
      );
      window.dispatchEvent(
        new CustomEvent(BROWSER_COLLECTION_SESSION_EVENT, {
          detail: staleAttempt,
        }),
      );
    });

    await waitFor(() => expect(mockSyncAlert).toHaveBeenCalledTimes(1));
    expect(mockSyncAlert).toHaveBeenCalledWith(newerAttempt);
    expect(
      firstClient.getQueryData(queryKeys.browserCollection.session(RUN_ID)),
    ).toEqual(newerAttempt);
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
    expect(mockSyncAlert).not.toHaveBeenCalled();
  });
});
