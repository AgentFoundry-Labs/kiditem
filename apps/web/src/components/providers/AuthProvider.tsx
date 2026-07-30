'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import {
  clearAuthSession,
  getAuthSession,
  subscribeAuthSession,
  type AuthSignOutReason,
  type BrowserAuthSession,
} from '@/lib/auth/session';
import {
  EXTENSION_AUTH_REQUIRED_EVENT,
  syncExtensionAuth,
} from '@/lib/extension-auth';
import { BrowserCollectionProvider } from './BrowserCollectionProvider';
import { SellpiaInventorySyncProvider } from './SellpiaInventorySyncProvider';

type AuthContextValue = {
  session: BrowserAuthSession | null;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextValue>({ session: null, isLoading: true });
const MAX_TIMER_DELAY_MS = 2_147_000_000;

export function useAuthSession(): AuthContextValue {
  return useContext(AuthContext);
}

/**
 * Single owner for local session lifecycle, cross-tab changes, expiry redirect,
 * query cache clearing, and Chrome extension token synchronization.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthContextValue>({ session: null, isLoading: true });
  const queryClient = useQueryClient();
  const router = useRouter();
  const extensionAuthSyncRef = useRef({ revision: 0, queue: Promise.resolve() });

  useEffect(() => {
    let cancelled = false;

    const enqueueExtensionAuthSync = (session: BrowserAuthSession | null) => {
      const syncState = extensionAuthSyncRef.current;
      const revision = ++syncState.revision;
      syncState.queue = syncState.queue
        .then(async () => {
          if (cancelled || revision !== syncState.revision) return;
          await syncExtensionAuth(session);
        })
        .catch(() => undefined);
      return syncState.queue;
    };

    const redirectAfterSignOut = (reason: AuthSignOutReason) => {
      if (typeof window === 'undefined') return;
      const here = window.location.pathname + window.location.search;
      if (here.startsWith('/login')) return;
      if (reason === 'session_expired') {
        router.replace(`/login?reason=session_expired&next=${encodeURIComponent(here)}`);
      } else {
        router.replace('/login');
      }
    };

    const applySession = (
      session: BrowserAuthSession | null,
      reason: AuthSignOutReason | null,
      shouldRedirect: boolean,
    ) => {
      if (cancelled) return;
      setState({ session, isLoading: false });
      void enqueueExtensionAuthSync(session);
      if (!session && reason) {
        queryClient.clear();
        if (shouldRedirect) redirectAfterSignOut(reason);
      }
    };

    applySession(getAuthSession(), null, false);
    const unsubscribe = subscribeAuthSession((session, reason) => {
      applySession(session, reason, true);
    });

    const recoverStoredSession = () => {
      const session = getAuthSession();
      setState((current) => {
        if (current.session && !session) {
          clearAuthSession('session_expired');
          return current;
        }
        if (current.session?.token !== session?.token) {
          void enqueueExtensionAuthSync(session);
          return { session, isLoading: false };
        }
        return current;
      });
    };
    const handleVisibilityRecovery = () => {
      if (document.visibilityState === 'visible') recoverStoredSession();
    };
    const handleExtensionAuthRequired = async () => {
      const session = getAuthSession();
      if (!session) {
        await enqueueExtensionAuthSync(null);
        return;
      }
      try {
        await apiClient.get('/api/auth/me');
        if (!cancelled) await enqueueExtensionAuthSync(getAuthSession());
      } catch {
        // apiClient owns auth_required clearing. Network errors preserve the token.
      }
    };

    window.addEventListener('online', recoverStoredSession);
    window.addEventListener('focus', recoverStoredSession);
    document.addEventListener('visibilitychange', handleVisibilityRecovery);
    window.addEventListener(EXTENSION_AUTH_REQUIRED_EVENT, handleExtensionAuthRequired);

    return () => {
      cancelled = true;
      extensionAuthSyncRef.current.revision += 1;
      unsubscribe();
      window.removeEventListener('online', recoverStoredSession);
      window.removeEventListener('focus', recoverStoredSession);
      document.removeEventListener('visibilitychange', handleVisibilityRecovery);
      window.removeEventListener(EXTENSION_AUTH_REQUIRED_EVENT, handleExtensionAuthRequired);
    };
    // QueryClient and Next router are app-level singletons. Re-subscribing on
    // render would duplicate storage and extension listeners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const expiresAt = state.session ? Date.parse(state.session.expiresAt) : Number.NaN;
    if (!Number.isFinite(expiresAt)) return;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        clearAuthSession('session_expired');
        return;
      }
      timeoutId = setTimeout(schedule, Math.min(remaining, MAX_TIMER_DELAY_MS));
    };
    schedule();
    return () => {
      if (timeoutId !== null) clearTimeout(timeoutId);
    };
  }, [state.session]);

  return (
    <AuthContext.Provider value={state}>
      <SellpiaInventorySyncProvider>
        <BrowserCollectionProvider enabled={Boolean(state.session)}>
          {children}
        </BrowserCollectionProvider>
      </SellpiaInventorySyncProvider>
    </AuthContext.Provider>
  );
}
