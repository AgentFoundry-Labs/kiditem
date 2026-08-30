import { afterEach, describe, expect, it } from 'vitest';
import {
  isLegacySourcingCacheKey,
  purgeLegacySourcingCache,
} from './purge-legacy-sourcing-cache';

describe('purgeLegacySourcingCache', () => {
  afterEach(() => localStorage.clear());

  it('purges only legacy sourcing ownership keys and preserves auth and extension identity', () => {
    localStorage.setItem('kiditem:sourcing-ai:today-recommendation:rows:v2:2026-08-10', 'old');
    localStorage.setItem('kiditem:sourcing-ai:1688-image-search:daily:2026-08-10', 'old');
    localStorage.setItem('kiditem:sourcing-ai:workspace-snapshot:today', 'old');
    localStorage.setItem('kiditem_keyword_exclude', 'old');
    localStorage.setItem('kiditem:auth:session', 'keep');
    localStorage.setItem('kiditem-extension-id', 'keep');

    purgeLegacySourcingCache(localStorage);

    expect([...Array(localStorage.length)].map((_, index) => localStorage.key(index))
      .filter((key): key is string => key !== null)
      .filter(isLegacySourcingCacheKey)).toEqual([]);
    expect(localStorage.getItem('kiditem:auth:session')).toBe('keep');
    expect(localStorage.getItem('kiditem-extension-id')).toBe('keep');
    expect(localStorage.getItem('kiditem:sourcing-cache-schema')).toBe('3');
  });
});
