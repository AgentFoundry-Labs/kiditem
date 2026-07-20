'use client';

import {
  BrowserCollectionSessionViewSchema,
  type BrowserCollectionSessionView,
} from '@kiditem/shared/browser-collection-session';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  isBrowserCollectionOrderingNewer,
  listBrowserCollectionSessions,
  syncBrowserCollectionAlert,
  updateBrowserCollectionSessionCache,
} from '@/lib/browser-collection-session';

export const BROWSER_COLLECTION_SESSION_EVENT =
  'kiditem:browser-collection-session';

const ORDERING_STORAGE_PREFIX = 'kiditem:browser-collection-ordering:';
const ORDERING_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const runQueues = new Map<string, Promise<void>>();

type StoredOrdering = Pick<
  BrowserCollectionSessionView,
  'attempt' | 'updatedAt'
> & { processedAt: number };

function readStoredOrdering(runId: string): StoredOrdering | null {
  try {
    const raw = localStorage.getItem(`${ORDERING_STORAGE_PREFIX}${runId}`);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredOrdering>;
    if (
      !Number.isInteger(value.attempt) ||
      !Number.isInteger(value.updatedAt) ||
      !Number.isFinite(value.processedAt)
    ) {
      return null;
    }
    if (value.processedAt! < Date.now() - ORDERING_RETENTION_MS) {
      localStorage.removeItem(`${ORDERING_STORAGE_PREFIX}${runId}`);
      return null;
    }
    return value as StoredOrdering;
  } catch {
    return null;
  }
}

function writeStoredOrdering(session: BrowserCollectionSessionView): void {
  try {
    localStorage.setItem(
      `${ORDERING_STORAGE_PREFIX}${session.runId}`,
      JSON.stringify({
        attempt: session.attempt,
        updatedAt: session.updatedAt,
        processedAt: Date.now(),
      } satisfies StoredOrdering),
    );
  } catch {
    // The in-process run queue still preserves ordering when storage is blocked.
  }
}

function enqueueRun<T>(runId: string, operation: () => Promise<T>): Promise<T> {
  const previous = runQueues.get(runId) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(operation);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  runQueues.set(runId, tail);
  return result.finally(() => {
    if (runQueues.get(runId) === tail) runQueues.delete(runId);
  });
}

function serializeAcrossTabs<T>(
  runId: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks
      .request(`kiditem-browser-collection-${runId}`, operation)
      .then((result) => result);
  }
  return enqueueRun(runId, operation);
}

function synchronizeAlertOnce(
  session: BrowserCollectionSessionView,
): Promise<void> {
  return serializeAcrossTabs(session.runId, async () => {
    const current = readStoredOrdering(session.runId);
    if (!isBrowserCollectionOrderingNewer(session, current)) return;
    await syncBrowserCollectionAlert(session);
    writeStoredOrdering(session);
  });
}

export function BrowserCollectionProvider({
  children,
  enabled,
}: {
  children: React.ReactNode;
  enabled: boolean;
}) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    let recoveryInFlight: Promise<void> | null = null;

    const synchronize = async (value: unknown) => {
      const parsed = BrowserCollectionSessionViewSchema.safeParse(value);
      if (!parsed.success || disposed) return;
      if (parsed.data.producer === 'inventory.sellpia') return;
      const processed = readStoredOrdering(parsed.data.runId);
      if (
        processed &&
        isBrowserCollectionOrderingNewer(processed, parsed.data)
      ) {
        return;
      }
      updateBrowserCollectionSessionCache(queryClient, parsed.data);
      await synchronizeAlertOnce(parsed.data);
    };

    const reconcile = () => {
      if (recoveryInFlight) return recoveryInFlight;
      const operation = (async () => {
        const sessions = await listBrowserCollectionSessions();
        if (disposed) return;
        await Promise.allSettled(sessions.map(synchronize));
      })();
      recoveryInFlight = operation.finally(() => {
        recoveryInFlight = null;
      });
      return recoveryInFlight;
    };

    const handleSession = (event: Event) => {
      void synchronize((event as CustomEvent<unknown>).detail).catch((error) => {
        console.warn('[browser-collection] session synchronization failed', error);
      });
    };
    const handleRecovery = () => {
      void reconcile();
    };
    const handleVisibilityRecovery = () => {
      if (document.visibilityState === 'visible') handleRecovery();
    };

    window.addEventListener(BROWSER_COLLECTION_SESSION_EVENT, handleSession);
    window.addEventListener('online', handleRecovery);
    window.addEventListener('focus', handleRecovery);
    document.addEventListener('visibilitychange', handleVisibilityRecovery);
    void reconcile();

    return () => {
      disposed = true;
      window.removeEventListener(
        BROWSER_COLLECTION_SESSION_EVENT,
        handleSession,
      );
      window.removeEventListener('online', handleRecovery);
      window.removeEventListener('focus', handleRecovery);
      document.removeEventListener('visibilitychange', handleVisibilityRecovery);
    };
  }, [enabled, queryClient]);

  return children;
}
