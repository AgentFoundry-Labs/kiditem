'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  EXTENSION_AUTH_REQUIRED_EVENT,
  syncExtensionAuth,
} from '@/lib/extension-auth';
import { consumeSignOutReason, refreshOrFail } from '@/lib/supabase/refresh';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { BrowserCollectionProvider } from './BrowserCollectionProvider';
import { SellpiaInventorySyncProvider } from './SellpiaInventorySyncProvider';

type AuthContextValue = {
  /** 현재 Supabase 세션. null = 로그아웃 상태 또는 초기 로딩. */
  session: Session | null;
  /** 첫 `getSession()` 응답 전 true. consumer 가 깜빡임 방지에 사용. */
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextValue>({ session: null, isLoading: true });

/**
 * 컴포넌트 안에서 현재 Supabase 세션 상태를 읽는다.
 * `useAuth()` 가 user record 까지 제공하므로 대부분 그쪽을 쓴다.
 */
export function useAuthSession(): AuthContextValue {
  return useContext(AuthContext);
}

/**
 * `onAuthStateChange` 단일 소유자.
 *   - SIGNED_OUT: queryClient 캐시 클리어 + `consumeSignOutReason()` 결과로
 *     `/login` redirect (reason='session_expired' 면 query param 부착,
 *     reason='manual' 이면 깨끗한 `/login`).
 *   - TOKEN_REFRESHED: session state 만 업데이트. user record (`/api/auth/me`)
 *     는 token rotation 으로 바뀌지 않으므로 invalidate 안 함.
 *   - INITIAL_SESSION: 오류를 구분할 수 있는 명시적 `getSession()`이 소유하므로 무시.
 *   - 그 외 (SIGNED_IN/USER_UPDATED/PASSWORD_RECOVERY): state 업데이트만.
 *
 * QueryProvider 내부에서 mount 되어야 한다 (`useQueryClient()` 의존).
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthContextValue>({ session: null, isLoading: true });
  const queryClient = useQueryClient();
  const router = useRouter();
  const extensionAuthSyncRef = useRef<{
    revision: number;
    queue: Promise<void>;
  }>({
    revision: 0,
    queue: Promise.resolve(),
  });

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    let refreshInFlight: Promise<void> | null = null;
    let authRevision = 0;

    // Extension detection/handshake is asynchronous. Serialize writes and skip
    // superseded work that has not started yet. If a token write is already in
    // flight when SIGNED_OUT arrives, the queued clear always runs after it.
    const enqueueExtensionAuthSync = (session: Session | null) => {
      const syncState = extensionAuthSyncRef.current;
      const revision = ++syncState.revision;
      syncState.queue = syncState.queue
        .then(async () => {
          if (revision !== syncState.revision) return;
          await syncExtensionAuth(session);
        })
        .catch(() => {
          // Extension auth sync is best-effort. Keep the queue usable after a
          // transient extension/runtime failure.
        });
      return syncState.queue;
    };

    // `getSession()` waits for Supabase initialization. A null session without
    // an error is therefore authoritative and must clear persisted extension
    // credentials. Only a failed read preserves the last extension token.
    const syncCurrentSession = async () => {
      const requestedRevision = authRevision;
      const { data, error } = await supabase.auth.getSession();
      if (cancelled || requestedRevision !== authRevision || error) return;
      await enqueueExtensionAuthSync(data.session);
    };

    const refreshAndSyncSession = () => {
      if (refreshInFlight) return refreshInFlight;
      const requestedRevision = authRevision;
      const operation = (async () => {
        // 확장이 토큰을 요구할 때 회전(rotation)을 시도하되, 회전 실패가
        // 곧 "세션 없음"은 아니다. Supabase 는 refresh token 을 회전시키므로
        // 다른 탭이 먼저 소비했거나 apiClient 의 갱신과 경합하면 이 호출은
        // 정상 사용 중에도 흔히 실패한다. 그때도 메모리에는 유효한
        // access_token 이 남아 있으므로, 회전 결과와 무관하게 현재 세션을
        // 다시 읽어 있으면 넘긴다. `refreshOrFail` 은 apiClient 와 같은
        // 모듈 mutex 를 쓰므로 서로의 회전 토큰을 태우지 않는다.
        await refreshOrFail();
        const { data, error } = await supabase.auth.getSession();
        if (cancelled || requestedRevision !== authRevision || error) return;
        await enqueueExtensionAuthSync(data.session);
      })();
      refreshInFlight = operation.finally(() => {
        refreshInFlight = null;
      });
      return refreshInFlight;
    };

    const handleSessionRecovery = () => {
      void syncCurrentSession();
    };
    const handleVisibilityRecovery = () => {
      if (document.visibilityState === 'visible') handleSessionRecovery();
    };
    const handleExtensionAuthRequired = () => {
      void refreshAndSyncSession();
    };

    const initialRevision = authRevision;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!cancelled && initialRevision === authRevision) {
        setState({ session: data.session, isLoading: false });
        if (!error) void enqueueExtensionAuthSync(data.session);
      }
    });

    function handle(event: AuthChangeEvent, next: Session | null) {
      // Supabase는 초기 세션 읽기가 실패해도 `INITIAL_SESSION(null)`을 발행한다.
      // 이 이벤트만으로는 "정상 로그아웃"과 "스토리지 읽기 실패"를 구분할 수
      // 없으므로, 초기 상태와 확장 토큰 동기화는 위의 명시적 getSession()만
      // 소유한다. 실제 후속 로그아웃은 SIGNED_OUT에서 별도로 처리된다.
      if (event === 'INITIAL_SESSION') return;

      authRevision += 1;
      setState({ session: next, isLoading: false });
      if (next) void enqueueExtensionAuthSync(next);
      else if (event === 'SIGNED_OUT') {
        void enqueueExtensionAuthSync(null);
      }

      switch (event) {
        case 'SIGNED_OUT': {
          queryClient.clear();
          // 항상 reason 을 소비해야 다음 cycle 의 default 가 'manual' 로 복귀.
          const reason = consumeSignOutReason();
          if (typeof window === 'undefined') return;
          const here = window.location.pathname + window.location.search;
          if (here.startsWith('/login') || here.startsWith('/auth')) return;

          if (reason === 'session_expired') {
            router.replace(
              `/login?reason=session_expired&next=${encodeURIComponent(here)}`,
            );
          } else {
            router.replace('/login');
          }
          break;
        }
        case 'SIGNED_IN':
        case 'TOKEN_REFRESHED':
        case 'USER_UPDATED':
        case 'PASSWORD_RECOVERY':
          // session state 만 업데이트 (위에서 처리됨). user record invalidate 불필요.
          break;
        default:
          break;
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(handle);

    window.addEventListener('online', handleSessionRecovery);
    window.addEventListener('focus', handleSessionRecovery);
    document.addEventListener('visibilitychange', handleVisibilityRecovery);
    window.addEventListener(
      EXTENSION_AUTH_REQUIRED_EVENT,
      handleExtensionAuthRequired,
    );

    return () => {
      cancelled = true;
      authRevision += 1;
      subscription.unsubscribe();
      window.removeEventListener('online', handleSessionRecovery);
      window.removeEventListener('focus', handleSessionRecovery);
      document.removeEventListener('visibilitychange', handleVisibilityRecovery);
      window.removeEventListener(
        EXTENSION_AUTH_REQUIRED_EVENT,
        handleExtensionAuthRequired,
      );
    };
    // queryClient 와 router 는 referentially stable. 매 render 마다 unsubscribe/resubscribe
    // 하지 않기 위해 deps 를 비워둔다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
