'use client';

import { useMemo } from 'react';
import { useCollectionSourceControl } from '@/hooks/use-collection-source-control';
import { coupangCatalogCollection } from '../lib/coupang-catalog-collection';

/** One store account's 상품 받기 control; every mounted copy for the account shares its state. */
export function useCoupangCatalogCollection(channelAccountId: string, accountName: string | null) {
  const adapter = useMemo(
    () => coupangCatalogCollection({ id: channelAccountId, name: accountName }),
    [channelAccountId, accountName],
  );
  return useCollectionSourceControl(adapter);
}
