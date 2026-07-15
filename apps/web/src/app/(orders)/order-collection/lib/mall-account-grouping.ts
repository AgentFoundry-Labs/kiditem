import { isBrowserCollectableMall } from './order-collection-page-model';
import type { MallCollectionStat } from './order-collection-stats';
import type { OrderCollectionMallAccount } from './order-mall-account-api';

export type MallAccountGroup = 'action' | 'collectable' | 'setup';

export const MALL_ACCOUNT_GROUPS: ReadonlyArray<{
  id: MallAccountGroup;
  label: string;
}> = [
  { id: 'action', label: '조치 필요' },
  { id: 'collectable', label: '수집 가능' },
  { id: 'setup', label: '설정 필요' },
];

export function classifyMallAccount(
  account: OrderCollectionMallAccount,
  collectionStat: MallCollectionStat | undefined,
  collectionActive = false,
): MallAccountGroup {
  if (!account.enabled || !isBrowserCollectableMall(account)) return 'setup';
  if (collectionActive || (collectionStat?.newRows ?? 0) > 0) return 'action';
  return 'collectable';
}
