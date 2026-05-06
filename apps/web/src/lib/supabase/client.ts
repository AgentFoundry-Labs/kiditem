'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * 브라우저용 Supabase 클라이언트.
 * Supabase SSR auth-token 쿠키를 자동 관리한다.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 가 .env.local 에 필요합니다.',
    );
  }
  return createBrowserClient(url, publishableKey);
}
