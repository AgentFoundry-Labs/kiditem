'use client';

import { useMemo, type ReactNode } from 'react';
import type { OrderCollectionSourceStatus } from '@kiditem/shared/order-collection-source';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import {
  useCollectionSourceControl,
  type CollectionSourceAdapter,
} from '@/hooks/use-collection-source-control';
import type { MallCardCollection } from './MallAccountGroups';
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
 *
 * The card renders through `children`, so its own actions read the same
 * owner-reported running this control shows instead of a second screen-local
 * flag: a collection started in another tab closes them too (KID-189).
 */
export function MallCollectionControl({
  account,
  buildAdapter,
  startBlockedReason = null,
  children = (card) => card.control,
}: {
  account: OrderCollectionMallAccount;
  buildAdapter: (account: OrderCollectionMallAccount) => MallCollectionAdapter;
  startBlockedReason?: string | null;
  children?: (card: MallCardCollection) => ReactNode;
}) {
  const adapter = useMemo(() => buildAdapter(account), [account, buildAdapter]);
  const control = useCollectionSourceControl(adapter);

  return (
    <>
      {children({
        control: (
          <CollectionStartControl
            control={control}
            startLabel={`${account.name} 수집`}
            startTitle={`${account.name} 개별 수집`}
            startBlockedReason={startBlockedReason}
            onStart={() => control.start({})}
            onStop={control.stop}
            className="w-full items-stretch"
          />
        ),
        // 시작 요청 중·중단 요청 중도 이 몰이 수집을 붙들고 있는 시간이다.
        running: control.state === 'starting'
          || control.state === 'running'
          || control.state === 'stopping',
      })}
    </>
  );
}
