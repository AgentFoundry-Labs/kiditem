'use client';

import { useCollectionSourceControl } from '@/hooks/use-collection-source-control';
import type { TrendSourceCollectionResult } from '@/lib/source-trend-api';
import { DEFAULT_TREND_SOURCES, trendSourceCollection } from '@/lib/trend-source-collection';

/**
 * One screen's view of the shared trend collection control. Every screen shows
 * the same running state and refusal; the server runs the collection, so it
 * has no stop.
 */
export function useTrendSourceCollection({
  sources = DEFAULT_TREND_SOURCES,
}: { sources?: readonly string[] } = {}) {
  const control = useCollectionSourceControl(trendSourceCollection);
  const selected = sources.flatMap((source) => {
    const row = control.status?.[source];
    return row ? [row] : [];
  });

  return {
    control,
    start: (onSettled?: (result: TrendSourceCollectionResult) => void) =>
      control.start({ sources, onSettled }),
    isCollecting: control.state === 'starting' || control.state === 'running',
    error: selected.find((row) => row.latestAttempt?.state === 'FAILED')?.latestAttempt?.errorMessage ?? null,
    actualCutoffAt: selected
      .map((row) => row.actualCutoffAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null,
  };
}

export type TrendSourceCollection = ReturnType<typeof useTrendSourceCollection>;
