import { getAuthSession } from './auth/session';

/**
 * Browser-only sourcing caches are accelerators, never organization data.
 * A login token changes on every sign-in, so making the key session-scoped
 * prevents a previous account's rows from becoming input for the next one.
 */
export function sessionScopedCacheKey(baseKey: string): string {
  const token = getAuthSession()?.token;
  return `${baseKey}:session-${token ? token.slice(-12) : 'anonymous'}`;
}

export function sessionScopedDailyCacheKey(baseKey: string, now = new Date()): string {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return sessionScopedCacheKey(`${baseKey}:${year}-${month}-${day}`);
}
