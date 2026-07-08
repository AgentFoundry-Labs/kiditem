import {
  safeStorageGet,
  safeStorageRemove,
  safeStorageSet,
} from '@/lib/browser-storage';
import type { Search1688ImageResponse } from './1688-image-search-api';

const IMAGE_SEARCH_DAILY_CACHE_PREFIX = 'kiditem:sourcing-ai:1688-image-search:daily:';

export type CachedImageSearchState =
  | { status: 'success'; result: Search1688ImageResponse }
  | { status: 'error'; message: string };

export interface DailyImageSearchCache {
  dateKey: string;
  states: Record<string, CachedImageSearchState>;
}

export function loadDailyImageSearchCache(): DailyImageSearchCache {
  const dateKey = todayLocalDateKey();
  if (typeof window === 'undefined') return { dateKey, states: {} };

  try {
    const raw = safeStorageGet('local', dailyImageSearchCacheKey(dateKey));
    if (!raw) return { dateKey, states: {} };
    const parsed = JSON.parse(raw) as Partial<DailyImageSearchCache>;
    if (parsed.dateKey !== dateKey || !parsed.states || typeof parsed.states !== 'object') {
      return { dateKey, states: {} };
    }
    return {
      dateKey,
      states: Object.fromEntries(
        Object.entries(parsed.states).filter((entry): entry is [string, CachedImageSearchState] => {
          const state = entry[1] as Partial<CachedImageSearchState>;
          return state?.status === 'success' || state?.status === 'error';
        }),
      ),
    };
  } catch {
    return { dateKey, states: {} };
  }
}

export function saveDailyImageSearchState(matchId: string, state: CachedImageSearchState) {
  if (typeof window === 'undefined') return;
  const cache = loadDailyImageSearchCache();
  const nextCache: DailyImageSearchCache = {
    ...cache,
    states: {
      ...cache.states,
      [matchId]: state,
    },
  };

  safeStorageSet('local', dailyImageSearchCacheKey(cache.dateKey), JSON.stringify(nextCache));
}

export function clearDailyImageSearchCache() {
  if (typeof window === 'undefined') return;
  safeStorageRemove('local', dailyImageSearchCacheKey(todayLocalDateKey()));
}

export function todayLocalDateKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dailyImageSearchCacheKey(dateKey: string): string {
  return `${IMAGE_SEARCH_DAILY_CACHE_PREFIX}${dateKey}`;
}
