'use client';

import { createContext, useCallback, useContext, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { AuthUserPublic } from '@kiditem/shared/auth';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import {
  AUTH_ME_QUERY_KEY,
  AUTH_REQUIRED_EVENT,
  publishAuthChanged,
  purgePersistedBrowserCredential,
  subscribeAuthChanged,
} from '@/lib/auth/browser-auth';
import {
  clearExtensionAuth,
  EXTENSION_AUTH_REQUIRED_EVENT,
  syncExtensionAuth,
} from '@/lib/extension-auth';
import { BrowserCollectionProvider } from './BrowserCollectionProvider';
import { SellpiaInventorySyncProvider } from './SellpiaInventorySyncProvider';

export type AuthStatus =
  | 'loading'
  | 'anonymous'
  | 'ready'
  | 'no_organization'
  | 'error';

export type AuthContextValue = {
  user: AuthUserPublic | null;
  status: AuthStatus;
  error: unknown;
  isLoading: boolean;
  logout(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthContext(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is missing');
  return value;
}

function statusFromQuery(input: {
  user: AuthUserPublic | null;
  isPending: boolean;
  error: unknown;
}): AuthStatus {
  if (input.user) return input.user.organizationId ? 'ready' : 'no_organization';
  if (input.isPending) return 'loading';
  if (isApiError(input.error) && input.error.code === 'auth_required') return 'anonymous';
  if (isApiError(input.error) && input.error.code === 'no_organization_context') {
    return 'no_organization';
  }
  return input.error ? 'error' : 'anonymous';
}

/** Cookie-backed browser auth owner. `/auth/me` is the only UI auth probe. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data, error, isPending, refetch } = useQuery<AuthUserPublic>({
    queryKey: AUTH_ME_QUERY_KEY,
    queryFn: () => apiClient.get<AuthUserPublic>('/api/auth/me', {
      suppressNetworkErrorLog: true,
    }),
    retry: false,
    staleTime: 5 * 60_000,
    meta: { suppressGlobalErrorToast: true },
  });
  const user = data ?? null;
  const status = statusFromQuery({ user, isPending, error });

  const redirectAfterExpiry = useCallback(() => {
    if (typeof window === 'undefined') return;
    const here = window.location.pathname + window.location.search;
    if (here.startsWith('/login')) return;
    router.replace(`/login?reason=session_expired&next=${encodeURIComponent(here)}`);
  }, [router]);

  const expireBrowserAuth = useCallback(() => {
    queryClient.clear();
    void clearExtensionAuth();
    redirectAfterExpiry();
  }, [queryClient, redirectAfterExpiry]);

  useEffect(() => {
    purgePersistedBrowserCredential();
    const recoverCookieState = () => { void refetch(); };
    const handleVisibilityRecovery = () => {
      if (document.visibilityState === 'visible') recoverCookieState();
    };
    const handleExtensionAuthRequired = () => {
      void refetch().then((result) => {
        if (result.data?.organizationId) return syncExtensionAuth();
        return clearExtensionAuth();
      });
    };
    const unsubscribeAuthChanges = subscribeAuthChanged((reason) => {
      if (reason === 'logout') {
        queryClient.clear();
        void clearExtensionAuth();
        router.replace('/login');
        return;
      }
      recoverCookieState();
    });

    window.addEventListener(AUTH_REQUIRED_EVENT, expireBrowserAuth);
    window.addEventListener('online', recoverCookieState);
    window.addEventListener('focus', recoverCookieState);
    document.addEventListener('visibilitychange', handleVisibilityRecovery);
    window.addEventListener(
      EXTENSION_AUTH_REQUIRED_EVENT,
      handleExtensionAuthRequired,
    );

    return () => {
      unsubscribeAuthChanges();
      window.removeEventListener(AUTH_REQUIRED_EVENT, expireBrowserAuth);
      window.removeEventListener('online', recoverCookieState);
      window.removeEventListener('focus', recoverCookieState);
      document.removeEventListener('visibilitychange', handleVisibilityRecovery);
      window.removeEventListener(
        EXTENSION_AUTH_REQUIRED_EVENT,
        handleExtensionAuthRequired,
      );
    };
  }, [expireBrowserAuth, queryClient, refetch, router]);

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/api/auth/logout');
    } finally {
      await clearExtensionAuth();
      queryClient.clear();
      publishAuthChanged('logout');
      router.replace('/login');
    }
  }, [queryClient, router]);

  const value: AuthContextValue = {
    user,
    status,
    error: error ?? null,
    isLoading: status === 'loading',
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      <SellpiaInventorySyncProvider>
        <BrowserCollectionProvider enabled={status === 'ready'}>
          {children}
        </BrowserCollectionProvider>
      </SellpiaInventorySyncProvider>
    </AuthContext.Provider>
  );
}
