'use client';

import type { SellpiaManualMatchSourceStatus } from '@kiditem/shared/sellpia-manual-match';
import type { QueryKey } from '@tanstack/react-query';
import {
  COLLECTION_IDLE_POLL_MS,
  COLLECTION_RUNNING_POLL_MS,
  type CollectionSourceAdapter,
} from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { requestOperationCancel } from '@/lib/operation-start';
import { queryKeys } from '@/lib/query-keys';
import { readSellpiaManualMatchSource } from './channel-sku-matching-api';

function running(status: SellpiaManualMatchSourceStatus | undefined): boolean {
  const operation = status?.latestOperation;
  return operation?.status === 'executing' || operation?.status === 'prepared';
}

/**
 * 셀피아 수동상품매칭(`channels.sellpia_manual_match`, KID-363)을 공용 컨트롤에 건다. 시작은 매칭 화면이 스스로 한다
 * (뒤이은 자동 매칭이 수집한 스냅샷을 쓰기 때문). 컨트롤은 어느 브라우저에서나 보이는 도는 실행과 중단을 맡는다 —
 * 중단은 이 브라우저의 실행을 멈추고(`operation.cancel`) 서버 실행을 취소한다. 화면이 시작한 실행이 도는 동안에는
 * 도는 주기로 읽어, 짧은 수집도 중단을 보일 틈이 있다(KID-170 D3).
 */
export function sellpiaManualMatchCollectionSource({
  localStartInFlight = false,
}: Readonly<{ localStartInFlight?: boolean }> = {}):
CollectionSourceAdapter<SellpiaManualMatchSourceStatus> {
  return {
    sourceKey: 'channels.sellpia_manual_match',
    label: '셀피아 수동상품매칭 수집',
    statusQuery: collectionSourceStatusQueryOptions<
      SellpiaManualMatchSourceStatus,
      Error,
      SellpiaManualMatchSourceStatus,
      QueryKey
    >({
      queryKey: queryKeys.channelSkuMappings.sellpiaManualMatchSource(),
      queryFn: readSellpiaManualMatchSource,
      refetchInterval: (query) => (localStartInFlight || running(query.state.data) ? COLLECTION_RUNNING_POLL_MS : COLLECTION_IDLE_POLL_MS),
      refetchIntervalInBackground: false,
      meta: { suppressGlobalErrorToast: true },
    }),
    readRunning: (status) => {
      const operation = status.latestOperation;
      return operation && running(status) ? { attemptId: operation.id, scopeLabel: null } : null;
    },
    cancelInExtension: (operationId) => requestOperationCancel(operationId),
    cancelOnServer: (operationId) => apiClient.post(`/api/operations/${encodeURIComponent(operationId)}/cancel`),
    readCompleteId: (status) =>
      status.latestOperation?.status === 'succeeded' ? status.latestOperation.id : null,
    // 새 스냅샷이 매칭 큐와 후보를 다시 그린다.
    onNewComplete: (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.channelSkuMappings.all });
    },
  };
}
