'use client';

import {
  safeStorageGet,
  safeStorageRemove,
  safeStorageSet,
} from '../browser-storage';

export const AUTH_SESSION_STORAGE_KEY = 'kiditem.auth.session.v1';
export const AUTH_SESSION_CHANGED_EVENT = 'kiditem:auth-session-changed';

export type AuthSignOutReason = 'manual' | 'session_expired';

export interface BrowserAuthSession {
  token: string;
  expiresAt: string;
}

interface AuthSessionEventDetail {
  session: BrowserAuthSession | null;
  reason: AuthSignOutReason | null;
}

export function getAuthSession(now = Date.now()): BrowserAuthSession | null {
  const raw = safeStorageGet('local', AUTH_SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isBrowserAuthSession(parsed, now)) {
      safeStorageRemove('local', AUTH_SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    safeStorageRemove('local', AUTH_SESSION_STORAGE_KEY);
    return null;
  }
}

export function setAuthSession(session: BrowserAuthSession): void {
  if (!isBrowserAuthSession(session, Date.now())) {
    throw new RangeError('auth session must contain a valid token and future expiry');
  }
  if (!safeStorageSet('local', AUTH_SESSION_STORAGE_KEY, JSON.stringify(session))) {
    throw new Error('브라우저에 로그인 세션을 저장하지 못했습니다. 저장소 설정을 확인해주세요.');
  }
  dispatchAuthSessionChange({ session, reason: null });
}

export function clearAuthSession(reason: AuthSignOutReason = 'manual'): void {
  safeStorageRemove('local', AUTH_SESSION_STORAGE_KEY);
  dispatchAuthSessionChange({ session: null, reason });
}

export function subscribeAuthSession(
  listener: (
    session: BrowserAuthSession | null,
    reason: AuthSignOutReason | null,
  ) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const handleLocal = (event: Event) => {
    const detail = (event as CustomEvent<AuthSessionEventDetail>).detail;
    listener(detail.session, detail.reason);
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== AUTH_SESSION_STORAGE_KEY) return;
    const session = getAuthSession();
    listener(session, session ? null : 'manual');
  };
  window.addEventListener(AUTH_SESSION_CHANGED_EVENT, handleLocal);
  window.addEventListener('storage', handleStorage);
  return () => {
    window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, handleLocal);
    window.removeEventListener('storage', handleStorage);
  };
}

function isBrowserAuthSession(value: unknown, now: number): value is BrowserAuthSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(record.token)) {
    return false;
  }
  if (typeof record.expiresAt !== 'string') return false;
  const expiry = Date.parse(record.expiresAt);
  return Number.isFinite(expiry) && expiry > now;
}

function dispatchAuthSessionChange(detail: AuthSessionEventDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AuthSessionEventDetail>(AUTH_SESSION_CHANGED_EVENT, {
    detail,
  }));
}
