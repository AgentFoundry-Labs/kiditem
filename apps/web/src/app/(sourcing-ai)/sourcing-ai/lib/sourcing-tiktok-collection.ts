'use client';

import { SOURCING_OPERATION_KINDS } from '@kiditem/shared/sourcing-operation';
import { queryKeys } from '@/lib/query-keys';
import { sourcingOperationCollection } from './sourcing-operations';

/**
 * 틱톡 크리에이티브 센터 수집(`sourcing.tiktok_creative`, KID-360). 대상은 트렌드 시드에서 서버가 정하고, 이
 * 화면은 상한·지역을 고르지 않으므로 scope는 비어 있다. 끝나면 주어진 창의 틱톡 트렌드 읽기를 다시 읽는다.
 */
export function sourcingTiktokCcCollection(days: number) {
  const snapshotQueryKey = queryKeys.sourcing.trendTiktokCc(days);
  return sourcingOperationCollection({
    kind: SOURCING_OPERATION_KINDS.tiktokCreative,
    sourceKey: SOURCING_OPERATION_KINDS.tiktokCreative,
    label: '틱톡 트렌드 수집',
    scope: () => ({}),
    onNewComplete: (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: snapshotQueryKey });
    },
  });
}
