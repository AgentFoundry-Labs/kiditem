'use client';

import { useMemo, type ReactNode } from 'react';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import {
  useCollectionSourceControl,
  type CollectionSourceAdapter,
} from '@/hooks/use-collection-source-control';
import type { MallCardCollection } from './MallAccountGroups';
import type {
  MallOrderCollectionSourceList,
  MallOrderCollectionStartInput,
} from '../lib/mall-order-collection-source';
import type { OrderCollectionMallAccount } from '../lib/order-mall-account-api';

/**
 * 카드가 들고 오는 어댑터. 몰은 화면 하나가 함께 읽는 목록을 보지만, 쿠팡 직배송은
 * 로켓 계정 하나의 원천 상태를 따로 읽는다. 카드가 읽는 상태 타입은 그 원천의 것
 * 그대로다 — 목록인 척 캐스팅해 넣으면 아무도 검사하지 않는다(KID-214).
 */
export type MallCollectionAdapter<TStatus = MallOrderCollectionSourceList> = CollectionSourceAdapter<
  TStatus,
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
export function MallCollectionControl<TStatus>({
  account,
  buildAdapter,
  startBlockedReason = null,
  children = (card) => card.control,
}: {
  account: OrderCollectionMallAccount;
  buildAdapter: (account: OrderCollectionMallAccount) => MallCollectionAdapter<TStatus>;
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
