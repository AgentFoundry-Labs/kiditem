import { getLocalDateKey } from './readiness-modal-model';

export const SESSION_DISMISSED_KEY = 'kiditem.readiness.dismissed';
export const TODAY_DISMISSED_KEY = 'kiditem.readiness.dismissedDate';

export function isDismissedForToday(): boolean {
  try {
    return window.localStorage.getItem(TODAY_DISMISSED_KEY) === getLocalDateKey();
  } catch {
    return false;
  }
}

export function markDismissedForToday() {
  try {
    window.localStorage.setItem(TODAY_DISMISSED_KEY, getLocalDateKey());
  } catch {
    // Storage can be unavailable in private/browser-restricted contexts.
  }
  markDismissedForSession();
}

export function isDismissedForSession(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markDismissedForSession() {
  try {
    window.sessionStorage.setItem(SESSION_DISMISSED_KEY, '1');
  } catch {
    // Storage can be unavailable in private/browser-restricted contexts.
  }
}
