import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_SESSION_CHANGED_EVENT,
  AUTH_SESSION_STORAGE_KEY,
  clearAuthSession,
  getAuthSession,
  setAuthSession,
  subscribeAuthSession,
} from './session';

const SESSION = {
  token: 'a'.repeat(43),
  expiresAt: '2026-08-29T03:00:00.000Z',
};

describe('browser auth session storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T03:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('persists and reads only a valid unexpired opaque session', () => {
    setAuthSession(SESSION);

    expect(JSON.parse(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)!)).toEqual(SESSION);
    expect(getAuthSession()).toEqual(SESSION);
  });

  it.each([
    ['malformed JSON', '{'],
    ['invalid token', JSON.stringify({ ...SESSION, token: 'short' })],
    [
      'expired session',
      JSON.stringify({ ...SESSION, expiresAt: '2026-07-30T02:59:59.999Z' }),
    ],
  ])('rejects and removes a %s', (_label, stored) => {
    window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, stored);

    expect(getAuthSession()).toBeNull();
    expect(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('notifies same-tab subscribers with the sign-out reason', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAuthSession(listener);
    const eventListener = vi.fn();
    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, eventListener);

    setAuthSession(SESSION);
    clearAuthSession('session_expired');

    expect(listener).toHaveBeenNthCalledWith(1, SESSION, null);
    expect(listener).toHaveBeenNthCalledWith(2, null, 'session_expired');
    expect(eventListener).toHaveBeenCalledTimes(2);

    unsubscribe();
    window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, eventListener);
  });
});
