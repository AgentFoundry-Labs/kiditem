'use client';

import { safeStorageRemove } from '../browser-storage';

export const AUTH_ME_QUERY_KEY = ['auth', 'me'] as const;
export const AUTH_REQUIRED_EVENT = 'kiditem:auth-required';

const AUTH_CHANGE_CHANNEL = 'kiditem:auth-change';
const LEGACY_BROWSER_SESSION_KEY = 'kiditem.auth.session.v1';

export type BrowserAuthChangeReason = 'login' | 'logout';

/** Notify the mounted auth owner that Nest rejected the HttpOnly cookie. */
export function notifyAuthRequired(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
}

/**
 * Cross-tab invalidation only. The message contains no credential and is not
 * an authentication source; every receiver confirms state through `/auth/me`.
 */
export function publishAuthChanged(reason: BrowserAuthChangeReason): void {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(AUTH_CHANGE_CHANNEL);
    channel.postMessage({ reason });
    channel.close();
  } catch {
    // Focus/visibility revalidation still converges when unavailable.
  }
}

export function subscribeAuthChanged(
  listener: (reason: BrowserAuthChangeReason) => void,
): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => undefined;
  try {
    const channel = new BroadcastChannel(AUTH_CHANGE_CHANNEL);
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const reason = (event.data as { reason?: unknown } | null)?.reason;
      if (reason === 'login' || reason === 'logout') listener(reason);
    };
    return () => channel.close();
  } catch {
    return () => undefined;
  }
}

/** Remove the former JS-readable bearer token if an older build left one. */
export function purgePersistedBrowserCredential(): void {
  safeStorageRemove('local', LEGACY_BROWSER_SESSION_KEY);
}
