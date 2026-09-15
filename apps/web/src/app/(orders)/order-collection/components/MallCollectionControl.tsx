'use client';

import { useMemo } from 'react';
import type { OrderCollectionSourceStatus } from '@kiditem/shared/order-collection-source';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import {
  useCollectionSourceControl,
  type CollectionSourceAdapter,
} from '@/hooks/use-collection-source-control';
import type { MallOrderCollectionStartInput } from '../lib/mall-order-collection-source';
import type { OrderCollectionMallAccount } from '../lib/order-mall-account-api';

export type MallCollectionAdapter = CollectionSourceAdapter<
  OrderCollectionSourceStatus,
  MallOrderCollectionStartInput
>;

/**
 * One mall card's start control. Every mall is its own collection source, so
 * each card hosts its own control rather than a shared one reading a list:
 * start, the owner-reported running collection and stop are the same in every
 * browser showing this mall.
 */
export function MallCollectionControl({
  account,
  buildAdapter,
  startBlockedReason = null,
}: {
  account: OrderCollectionMallAccount;
  buildAdapter: (account: OrderCollectionMallAccount) => MallCollectionAdapter;
  startBlockedReason?: string | null;
}) {
  const adapter = useMemo(() => buildAdapter(account), [account, buildAdapter]);
  const control = useCollectionSourceControl(adapter);

  return (
    <CollectionStartControl
      control={control}
      startLabel={`${account.name} 수집`}
      startTitle={`${account.name} 개별 수집`}
      startBlockedReason={startBlockedReason}
      onStart={() => control.start({})}
      onStop={control.stop}
      className="w-full items-stretch"
    />
  );
}
