'use client';

import { useMemo } from 'react';
import { useCollectionSourceControl } from '@/hooks/use-collection-source-control';
import { wingCatalogCollection } from '../lib/wing-catalog-collection';

/** 스토어 계정 하나의 상품 받기 컨트롤. 그 계정에 붙은 모든 컨트롤이 상태를 함께 본다. */
export function useWingCatalogCollection(channelAccountId: string, accountName: string | null) {
  const adapter = useMemo(
    () => wingCatalogCollection({ id: channelAccountId, name: accountName }),
    [channelAccountId, accountName],
  );
  return useCollectionSourceControl(adapter);
}
