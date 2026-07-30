'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { clearAuthSession } from '@/lib/auth/session';
import { useAuthSession } from '@/components/providers/AuthProvider';
import type { AuthUserPublic } from '@kiditem/shared/auth';

export type AuthStatus = 'loading' | 'anonymous' | 'ready' | 'no_organization' | 'error';

/**
 * 현재 로그인된 사용자 (`GET /api/auth/me` 결과) + 로그아웃 헬퍼.
 *
 * `useAuthSession()` 의 session 이 있을 때만 query 활성화. session 이 null 이면
 * (만료/로그아웃) query 도 비활성화되어 stale user 객체를 노출하지 않는다.
 *
 * `logout()` 은 현재 서버 세션만 revoke하고 로컬 세션 이벤트를 발행한다.
 * AuthProvider가 확장 토큰 삭제와 `/login` redirect를 단독 소유한다.
 */
export function useAuth() {
  const queryClient = useQueryClient();
  const { session, isLoading: sessionLoading } = useAuthSession();

  const query = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiClient.get<AuthUserPublic>('/api/auth/me'),
    enabled: !!session,
    retry: false,
    staleTime: 5 * 60_000,
  });

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/api/auth/logout');
    } finally {
      clearAuthSession('manual');
      queryClient.removeQueries({ queryKey: ['auth', 'me'] });
    }
  }, [queryClient]);

  const status = getAuthStatus({
    sessionLoading,
    hasSession: !!session,
    user: query.data ?? null,
    isQueryLoading: query.isLoading,
    error: query.error,
  });

  return {
    user: query.data ?? null,
    status,
    error: query.error ?? null,
    isLoading: status === 'loading',
    logout,
  };
}

function getAuthStatus(input: {
  sessionLoading: boolean;
  hasSession: boolean;
  user: AuthUserPublic | null;
  isQueryLoading: boolean;
  error: unknown;
}): AuthStatus {
  if (input.sessionLoading) return 'loading';
  if (!input.hasSession) return 'anonymous';
  if (input.user) {
    return input.user.organizationId ? 'ready' : 'no_organization';
  }
  if (input.isQueryLoading) return 'loading';
  if (isApiError(input.error) && input.error.code === 'no_organization_context') {
    return 'no_organization';
  }
  if (isApiError(input.error) && input.error.code === 'auth_required') {
    return 'anonymous';
  }
  if (input.error) return 'error';
  return 'loading';
}
