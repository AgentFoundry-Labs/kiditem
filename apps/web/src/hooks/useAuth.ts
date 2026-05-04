'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { AuthUserPublic } from '@kiditem/shared/auth';

/**
 * 현재 로그인된 사용자 (`GET /api/auth/me` 결과) + 로그아웃 헬퍼.
 * Supabase 세션 쿠키가 있으면 SupabaseAuthMiddleware 가 검증해 200 응답을 준다.
 */
export function useAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiClient.get<AuthUserPublic>('/api/auth/me'),
    retry: false,
    staleTime: 5 * 60_000,
  });

  const logout = useCallback(async () => {
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } finally {
      queryClient.removeQueries({ queryKey: ['auth', 'me'] });
      router.replace('/login');
      router.refresh();
    }
  }, [queryClient, router]);

  return { user: query.data ?? null, isLoading: query.isLoading, logout };
}
