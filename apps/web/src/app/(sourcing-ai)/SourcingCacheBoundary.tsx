'use client';

import { useEffect, type ReactNode } from 'react';
import { purgeLegacySourcingCache } from './sourcing-ai/lib/purge-legacy-sourcing-cache';

/**
 * The normalized workspace endpoints are now the dashboard source of truth.
 * Clear only old display/cache keys once so an earlier browser session cannot
 * override the active organization's server-owned recommendations or review
 * selections. Browser collection/session credentials are intentionally left
 * untouched.
 */
export function SourcingCacheBoundary({ children }: { children: ReactNode }) {
  useEffect(() => {
    purgeLegacySourcingCache(window.localStorage);
  }, []);

  return <>{children}</>;
}
