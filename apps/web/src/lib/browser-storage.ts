export type BrowserStorageArea = 'local' | 'session';

function resolveStorage(area: BrowserStorageArea): Storage | null {
  if (typeof window === 'undefined') return null;
  return area === 'local' ? window.localStorage : window.sessionStorage;
}

export function safeStorageGet(area: BrowserStorageArea, key: string): string | null {
  try {
    return resolveStorage(area)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function safeStorageSet(area: BrowserStorageArea, key: string, value: string): boolean {
  try {
    resolveStorage(area)?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeStorageRemove(area: BrowserStorageArea, key: string): boolean {
  try {
    resolveStorage(area)?.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function safeStorageLength(area: BrowserStorageArea): number {
  try {
    return resolveStorage(area)?.length ?? 0;
  } catch {
    return 0;
  }
}

export function safeStorageKey(area: BrowserStorageArea, index: number): string | null {
  try {
    return resolveStorage(area)?.key(index) ?? null;
  } catch {
    return null;
  }
}
