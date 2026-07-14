'use client';

import { BrowserCollectionSessionViewSchema } from '@kiditem/shared/browser-collection-session';
import { useEffect } from 'react';
import {
  listBrowserCollectionSessions,
  syncBrowserCollectionAlert,
} from '@/lib/browser-collection-session';

export const BROWSER_COLLECTION_SESSION_EVENT =
  'kiditem:browser-collection-session';

export function BrowserCollectionProvider({
  children,
  enabled,
}: {
  children: React.ReactNode;
  enabled: boolean;
}) {
  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    let recoveryInFlight: Promise<void> | null = null;

    const synchronize = async (value: unknown) => {
      const parsed = BrowserCollectionSessionViewSchema.safeParse(value);
      if (!parsed.success || disposed) return;
      await syncBrowserCollectionAlert(parsed.data);
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
      void synchronize((event as CustomEvent<unknown>).detail);
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
  }, [enabled]);

  return children;
}
