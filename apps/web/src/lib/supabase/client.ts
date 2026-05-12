'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

declare global {
  // eslint-disable-next-line no-var
  var __kiditemSupabaseClient: SupabaseClient | undefined;
}

/**
 * 브라우저용 Supabase 클라이언트 — 모듈 싱글톤.
 *
 * `@supabase/auth-js` 의 LockManager (refresh-token race 직렬화) 와
 * BroadcastChannel (다중탭 SIGNED_OUT/TOKEN_REFRESHED sync) 은 모두
 * client 인스턴스 단위로 동작한다. 매 호출마다 새 인스턴스를 만들면 두 기능
 * 모두 무력화되므로 `globalThis` 에 캐싱한다. Next dev HMR 후에도 같은
 * 인스턴스가 유지된다.
 *
 * SSR 경계에서는 캐싱하지 않는다 (요청별 격리 유지). 일반적으로 서버 코드는
 * `createSupabaseServerClient` 를 써야 하며 이 함수를 서버에서 호출하는 것은
 * 권장하지 않지만, 호환성을 위해 throw 하지는 않는다.
 */
export function createSupabaseBrowserClient(): SupabaseClient {
  if (typeof window !== 'undefined' && globalThis.__kiditemSupabaseClient) {
    return globalThis.__kiditemSupabaseClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 가 .env.local 에 필요합니다.',
    );
  }

  const client = createBrowserClient(url, publishableKey);
  if (typeof window !== 'undefined') {
    globalThis.__kiditemSupabaseClient = client;
  }
  return client;
}

/**
 * 테스트 격리용. `NODE_ENV=test` 외부에서 호출 시 throw.
 */
export function __resetSupabaseClientForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__resetSupabaseClientForTests is test-only');
  }
  globalThis.__kiditemSupabaseClient = undefined;
}
