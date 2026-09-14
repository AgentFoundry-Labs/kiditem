'use client';

import { useCollectionSourceControl } from '@/hooks/use-collection-source-control';
import { sourcingWingCatalogCollection } from '../lib/sourcing-wing-source-owner';
import type { SourcingWingCatalogBatchInput } from '@kiditem/shared/sourcing';

/**
 * One sourcing screen's view of the shared Wing catalog collection control.
 * Every screen shows the same running collection and stop; the screen supplies
 * its own keywords and purpose.
 */
export function useWingCatalogSource({ input }: { input: SourcingWingCatalogBatchInput }) {
  const control = useCollectionSourceControl(sourcingWingCatalogCollection);
  return {
    control,
    attempt: control.status ?? null,
    start: () => control.start(input),
  };
}

export type WingCatalogSource = ReturnType<typeof useWingCatalogSource>;
