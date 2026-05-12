'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { consumeSignOutReason } from '@/lib/supabase/refresh';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

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
 *   - 그 외 (INITIAL_SESSION/SIGNED_IN/USER_UPDATED/PASSWORD_RECOVERY): state 업데이트만.
 *
 * QueryProvider 내부에서 mount 되어야 한다 (`useQueryClient()` 의존).
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthContextValue>({ session: null, isLoading: true });
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setState({ session: data.session, isLoading: false });
    });

    function handle(event: AuthChangeEvent, next: Session | null) {
      setState({ session: next, isLoading: false });

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
        case 'INITIAL_SESSION':
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

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
    // queryClient 와 router 는 referentially stable. 매 render 마다 unsubscribe/resubscribe
    // 하지 않기 위해 deps 를 비워둔다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
