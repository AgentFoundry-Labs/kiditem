import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Next.js Server Component / proxy 용 Supabase 클라이언트.
 * `next/headers` 의 cookies() 로 세션 쿠키에 접근.
 */
export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 가 필요합니다.',
    );
  }
  const cookieStore = await cookies();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
        try {
          toSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Component 에서는 쓰기 불가 — proxy / Route Handler 에서만 유효.
        }
      },
    },
  });
}
