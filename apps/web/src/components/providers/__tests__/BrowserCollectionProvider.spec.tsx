import type { BrowserCollectionSessionView } from '@kiditem/shared/browser-collection-session';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const RUN_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const mockListSessions = vi.hoisted(() => vi.fn());
const mockSyncAlert = vi.hoisted(() => vi.fn());

vi.mock('@/lib/browser-collection-session', () => ({
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

describe('BrowserCollectionProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListSessions.mockResolvedValue([]);
    mockSyncAlert.mockResolvedValue(undefined);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  it('reconciles extension sessions on the initial authenticated mount', async () => {
    const current = session();
    mockListSessions.mockResolvedValue([current]);

    render(
      <BrowserCollectionProvider enabled>
        <div>authenticated</div>
      </BrowserCollectionProvider>,
    );

    await waitFor(() => expect(mockListSessions).toHaveBeenCalledTimes(1));
    expect(mockSyncAlert).toHaveBeenCalledWith(current);
  });

  it('synchronizes a schema-valid custom session event', async () => {
    const current = session({ status: 'succeeded', finishedAt: 1_700_000_002_000 });
    render(
      <BrowserCollectionProvider enabled>
        <div />
      </BrowserCollectionProvider>,
    );
    await waitFor(() => expect(mockListSessions).toHaveBeenCalledTimes(1));
    mockSyncAlert.mockClear();

    act(() => {
      window.dispatchEvent(
        new CustomEvent(BROWSER_COLLECTION_SESSION_EVENT, { detail: current }),
      );
    });

    await waitFor(() => expect(mockSyncAlert).toHaveBeenCalledWith(current));
  });

  it('rejects malformed custom session events before alert synchronization', async () => {
    render(
      <BrowserCollectionProvider enabled>
        <div />
      </BrowserCollectionProvider>,
    );
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
      render(
        <BrowserCollectionProvider enabled>
          <div />
        </BrowserCollectionProvider>,
      );
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
    render(
      <BrowserCollectionProvider enabled>
        <div />
      </BrowserCollectionProvider>,
    );
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
    render(
      <BrowserCollectionProvider enabled>
        <div />
      </BrowserCollectionProvider>,
    );
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

    await waitFor(() => expect(mockSyncAlert).toHaveBeenCalledTimes(2));
    expect(mockSyncAlert.mock.calls.map(([value]) => value.runId)).toEqual([
      RUN_ID,
      RUN_ID,
    ]);
  });

  it('does not listen or reconcile while signed out', async () => {
    render(
      <BrowserCollectionProvider enabled={false}>
        <div />
      </BrowserCollectionProvider>,
    );

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
