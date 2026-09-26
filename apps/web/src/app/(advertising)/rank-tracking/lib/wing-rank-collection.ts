'use client';

import { useMemo } from 'react';
import { WING_RANK_KIND } from '@kiditem/shared/advertising-operations';
import type { OperationListResponse, OperationView } from '@kiditem/shared/operation';
import {
  useCollectionSourceControl,
  type CollectionSourceAdapter,
} from '@/hooks/use-collection-source-control';
import { advertisingOperationCollection } from '@/lib/advertising-operation-collection';
import { queryKeys } from '@/lib/query-keys';
import { requireWingSearchAccount, useWingSearchAccountRead, type WingAccountRead } from '@/lib/wing-search-account';

/** 진행: 처리한 키워드 / 계획한 키워드. */
export function wingRankProgressLabel(operation: OperationView): string | null {
  const current = operation.progress?.current;
  const total = operation.progress?.total;
  if (typeof current === 'number' && typeof total === 'number') return `${current}/${total}개 키워드`;
  const planned = operation.plan?.keywords;
  return Array.isArray(planned) ? `0/${planned.length}개 키워드` : null;
}

/**
 * Wing 판매순위(실행 kind `advertising.wing_rank`, KID-362)를 공용 컨트롤에 건다. 시작은 조직의 대표 쿠팡 계정만 scope로
 * 보내고 키워드는 서버가 고른다(오늘 아직 안 본 대표 키워드 먼저). 실행 하나가 키워드 전부를 돌고, 중단도 실행 하나다.
 * 완료는 순위·대시보드·트래픽·readiness 읽기를 다시 읽는다.
 */
export function wingRankCollection(accountRead: WingAccountRead): CollectionSourceAdapter<OperationListResponse> {
  return advertisingOperationCollection<void>({
    kind: WING_RANK_KIND,
    sourceKey: WING_RANK_KIND,
    label: 'Wing 판매순위 수집',
    queryKey: queryKeys.ads.wingRankOperations(),
    scope: () => ({ channelAccountId: requireWingSearchAccount(accountRead).id }),
    scopeLabel: wingRankProgressLabel,
    onNewComplete: (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ads.keywordRank() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      void queryClient.invalidateQueries({ queryKey: ['traffic'] });
      void queryClient.invalidateQueries({ queryKey: ['readiness'] });
    },
  });
}

/** 이 화면의 Wing 판매순위 컨트롤(순위 추적 화면·readiness 카드가 같은 실행을 본다). */
export function useWingRankCollection() {
  const account = useWingSearchAccountRead();
  const adapter = useMemo(() => wingRankCollection(account), [account]);
  return useCollectionSourceControl(adapter);
}
