const LEGACY_SOURCING_CACHE_PREFIXES = [
  'kiditem:sourcing-ai:today-recommendation:',
  'kiditem:sourcing-ai:1688-image-search:daily:',
  'kiditem:sourcing-ai:final-selection:',
  'kiditem:sourcing-ai:keyword-analysis:ranked-keyword-pool:',
  'kiditem:sourcing-ai:keyword-analysis:trend-keyword-agent:',
  'kiditem:sourcing-ai:workspace-snapshot:',
];

const LEGACY_SOURCING_CACHE_KEYS = new Set(['kiditem_keyword_exclude']);
const SOURCING_CACHE_SCHEMA_KEY = 'kiditem:sourcing-cache-schema';
const SOURCING_CACHE_SCHEMA_VERSION = '3';

export function isLegacySourcingCacheKey(key: string): boolean {
  return LEGACY_SOURCING_CACHE_KEYS.has(key)
    || LEGACY_SOURCING_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * Remove only browser-owned sourcing presentation state from the old model.
 * Auth and extension session identity deliberately stay outside this list.
 */
export function purgeLegacySourcingCache(storage: Storage): void {
  try {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter((key): key is string => key !== null);
    for (const key of keys) {
      if (isLegacySourcingCacheKey(key)) storage.removeItem(key);
    }
    storage.setItem(SOURCING_CACHE_SCHEMA_KEY, SOURCING_CACHE_SCHEMA_VERSION);
  } catch {
    // Browser privacy modes may reject localStorage access. Server data remains
    // authoritative, so failing to purge only forfeits this one-time cleanup.
  }
}
