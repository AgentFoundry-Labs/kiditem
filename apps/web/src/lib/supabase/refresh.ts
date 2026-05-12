'use client';

import { createSupabaseBrowserClient } from './client';

/**
 * `apiClient` 가 401 `auth_required` 를 받았을 때 호출하는 reactive refresh
 * 모듈. proxy.ts 가 navigation 시점 자동 갱신을 처리해 주지만 fetch caller
 * (특히 dev 환경에서 `NEXT_PUBLIC_API_URL=localhost:4000` 직결 path)는 proxy
 * 를 우회하므로 이 모듈이 단일 진입점이다.
 *
 * 다중 fetch 가 동시에 401 을 받아도 `refreshSession` 호출은 정확히 1회
 * (`inflight` 모듈 mutex). signOut path 도 `SIGNED_OUT` 이벤트로 단일화하여
 * AuthProvider 가 redirect 를 단독 소유한다.
 */

let inflight: Promise<boolean> | null = null;

/**
 * 동시에 호출된 caller 들은 같은 Promise 를 await. 반환:
 * - `true`  — refresh 성공, 새 access_token 으로 retry 가능
 * - `false` — refresh 실패 (refresh_token 만료/네트워크/세션 null), signOut 필요
 */
export async function refreshOrFail(): Promise<boolean> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.refreshSession();
      return !error && !!data.session;
    } catch {
      return false;
    } finally {
      // 동기 클리어. 다음 만료 cycle에서 새 refresh 시도가 가능해야 한다.
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * AuthProvider 의 `SIGNED_OUT` 핸들러가 어떤 reason 으로 redirect 할지 결정.
 * - `'manual'`           : 사용자 의도 로그아웃 / 다른 탭에서 전파된 signOut (토스트 X)
 * - `'session_expired'`  : apiClient 가 refresh 실패로 강제 signOut (토스트 O)
 */
export type SignOutReason = 'manual' | 'session_expired';

let _pendingReason: SignOutReason = 'manual';

/**
 * `signOut` 을 호출하기 직전에 다음 `SIGNED_OUT` 이벤트의 reason 을 미리
 * 등록한다. 등록 → `signOut` → SDK 가 `onAuthStateChange('SIGNED_OUT')` 발화
 * → AuthProvider 가 `consumeSignOutReason` 으로 reason 읽고 분기.
 */
export async function triggerSignOut(reason: SignOutReason = 'manual'): Promise<void> {
  _pendingReason = reason;
  const supabase = createSupabaseBrowserClient();
  await supabase.auth.signOut();
}

/**
 * 호출 시점에 등록된 reason 을 읽고 기본값 `'manual'` 로 reset.
 * AuthProvider 의 `SIGNED_OUT` 핸들러 안에서 1회 호출.
 */
export function consumeSignOutReason(): SignOutReason {
  const r = _pendingReason;
  _pendingReason = 'manual';
  return r;
}

/**
 * 테스트 격리용. `NODE_ENV=test` 외부에서 호출 시 throw.
 */
export function __resetRefreshInflightForTests(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__resetRefreshInflightForTests is test-only');
  }
  inflight = null;
  _pendingReason = 'manual';
}
