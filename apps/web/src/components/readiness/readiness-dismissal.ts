import { safeStorageGet, safeStorageSet } from '@/lib/browser-storage';
import { getLocalDateKey } from './readiness-modal-model';

export const SESSION_DISMISSED_KEY = 'kiditem.readiness.dismissed';
export const TODAY_DISMISSED_KEY = 'kiditem.readiness.dismissedDate';

export function isDismissedForToday(): boolean {
  return safeStorageGet('local', TODAY_DISMISSED_KEY) === getLocalDateKey();
}

export function markDismissedForToday() {
  safeStorageSet('local', TODAY_DISMISSED_KEY, getLocalDateKey());
  markDismissedForSession();
}

export function isDismissedForSession(): boolean {
  return safeStorageGet('session', SESSION_DISMISSED_KEY) === '1';
}

export function markDismissedForSession() {
  safeStorageSet('session', SESSION_DISMISSED_KEY, '1');
}
