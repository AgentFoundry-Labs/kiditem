import type { CoupangDirectPo } from './coupang-directship-api';

/**
 * 마지막으로 불러온 쿠팡직배송 발주 목록.
 *
 * 달력을 열 때마다 쿠팡을 다시 긁으면 매번 로딩을 봐야 한다. 메모리에만 두면 새로고침에
 * 날아가므로 브라우저에 남긴다. 조작자 편의를 위한 캐시일 뿐이고, 실제 수집·변환은 항상
 * 확장이 새로 받아온 값으로 한다.
 */
const LEGACY_KEY = 'kiditem-coupang-direct-pos';
const KEY_PREFIX = 'kiditem-coupang-direct-pos:v2';

export interface CoupangDirectPoCacheScope {
  organizationId: string;
  channelAccountId: string;
}

export interface CachedDirectshipPos {
  savedAt: number;
  pos: CoupangDirectPo[];
}

export type CoupangDirectPoMemoryCache = Map<string, CoupangDirectPo[]>;

export function createCoupangDirectPoMemoryCache(): CoupangDirectPoMemoryCache {
  return new Map();
}

export function readMemoryCachedDirectshipPos(
  cache: CoupangDirectPoMemoryCache,
  scope: CoupangDirectPoCacheScope,
): CoupangDirectPo[] | null {
  return cache.get(cacheKey(scope)) ?? null;
}

export function writeMemoryCachedDirectshipPos(
  cache: CoupangDirectPoMemoryCache,
  scope: CoupangDirectPoCacheScope,
  pos: readonly CoupangDirectPo[],
): void {
  cache.set(cacheKey(scope), [...pos]);
}

export function readCachedDirectshipPos(
  scope: CoupangDirectPoCacheScope,
): CachedDirectshipPos | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedDirectshipPos>;
    if (!Array.isArray(parsed?.pos)) return null;
    return { savedAt: Number(parsed.savedAt) || 0, pos: parsed.pos };
  } catch {
    return null;
  }
}

export function writeCachedDirectshipPos(
  scope: CoupangDirectPoCacheScope,
  pos: readonly CoupangDirectPo[],
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      cacheKey(scope),
      JSON.stringify({ savedAt: Date.now(), pos }),
    );
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // 용량 초과 등은 조용히 넘긴다. 캐시가 없으면 평소대로 다시 불러오면 된다.
  }
}

export function cacheKey(scope: CoupangDirectPoCacheScope): string {
  return [
    KEY_PREFIX,
    encodeURIComponent(scope.organizationId),
    encodeURIComponent(scope.channelAccountId),
  ].join(':');
}
