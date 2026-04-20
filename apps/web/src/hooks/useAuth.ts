'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { AuthUserPublic } from '@kiditem/shared';

export function useAuth() {
  const router = useRouter();

  const query = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiClient.get<AuthUserPublic>('/api/auth/me'),
    retry: false,
    staleTime: 5 * 60_000,
  });

  const logout = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }, [router]);

  return { user: query.data ?? null, isLoading: query.isLoading, logout };
}
