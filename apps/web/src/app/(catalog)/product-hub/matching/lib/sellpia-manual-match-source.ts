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
import { queryKeys } from '@/lib/query-keys';
import { readSellpiaManualMatchSourceCurrent } from './channel-sku-matching-api';

const PATH = '/api/channels/product-mappings/sellpia-manual-match';

/** The owner's operator stop, without the extension's fence token (KID-159). */
export function cancelSellpiaManualMatchAttempt(attemptId: string) {
  return apiClient.post(`${PATH}/attempts/${encodeURIComponent(attemptId)}/cancel`);
}

/**
 * Sellpia manual-match collection for the shared control. Matching still starts
 * it itself, because the run that follows consumes the collected snapshot; what
 * the control adds is the running collection every browser can see and the
 * operator stop the screen never had.
 *
 * While that screen-owned run is in flight the owner is read at the running
 * cadence, so the control names the attempt within seconds instead of after
 * the next idle read — a short collection otherwise ends before the operator
 * is ever offered a stop (KID-170 D3).
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
      queryFn: readSellpiaManualMatchSourceCurrent,
      refetchInterval: localStartInFlight ? COLLECTION_RUNNING_POLL_MS : COLLECTION_IDLE_POLL_MS,
      refetchIntervalInBackground: false,
      meta: { suppressGlobalErrorToast: true },
    }),
    // 임대가 지난 RUNNING 행은 아무도 돌리고 있지 않다. 다른 owner 읽기와 같은 규칙이다.
    readRunning: (status) => {
      const attempt = status.latestAttempt;
      if (attempt?.state !== 'RUNNING') return null;
      if (new Date(attempt.expiresAt).getTime() <= Date.now()) return null;
      return { attemptId: attempt.attemptId, scopeLabel: null };
    },
    cancelOnServer: cancelSellpiaManualMatchAttempt,
    readCompleteId: (status) =>
      status.latestAttempt?.state === 'COMPLETE' ? status.latestAttempt.attemptId : null,
    // 새 스냅샷이 매칭 큐와 후보를 다시 그린다.
    onNewComplete: (queryClient) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.channelSkuMappings.all });
    },
  };
}
