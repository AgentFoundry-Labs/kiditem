'use client';

import {
  OrderCollectionSourceStatusSchema,
  type OrderCollectionSourceStatus,
} from '@kiditem/shared/order-collection-source';
import type { QueryKey } from '@tanstack/react-query';
import type { CollectionSourceAdapter } from '@/hooks/use-collection-source-control';
import { apiClient } from '@/lib/api-client';
import { collectionSourceStatusQueryOptions } from '@/lib/collection-source-status-query';
import { queryKeys } from '@/lib/query-keys';

const PATH = '/api/orders/sellpia-shipment-tracking';
const SOURCE_IDLE_POLL_MS = 60_000;

export function readSellpiaShipmentTrackingSourceStatus(): Promise<OrderCollectionSourceStatus> {
  return apiClient.getParsed(`${PATH}/source`, OrderCollectionSourceStatusSchema);
}

/** The owner's operator stop, without the extension's fence token (KID-159). */
export function cancelSellpiaShipmentTrackingAttempt(attemptId: string) {
  return apiClient.post(`${PATH}/attempts/${encodeURIComponent(attemptId)}/cancel`);
}

/**
 * Sellpia shipment tracking for the shared control. The screen that asks for
 * tracking rows still opens the attempt itself, because it consumes the rows;
 * what the control adds is the running collection every browser can see and
 * the operator stop the screen never had.
 */
export function sellpiaShipmentTrackingCollectionSource():
CollectionSourceAdapter<OrderCollectionSourceStatus> {
  return {
    sourceKey: 'orders.sellpia_shipment_tracking',
    label: '셀피아 송장 조회',
    statusQuery: collectionSourceStatusQueryOptions<
      OrderCollectionSourceStatus,
      Error,
      OrderCollectionSourceStatus,
      QueryKey
    >({
      queryKey: queryKeys.orders.sellpiaShipmentTrackingSource(),
      queryFn: readSellpiaShipmentTrackingSourceStatus,
      refetchInterval: SOURCE_IDLE_POLL_MS,
      refetchIntervalInBackground: false,
      meta: { suppressGlobalErrorToast: true },
    }),
    readRunning: (status) =>
      status.running ? { attemptId: status.running.attemptId, scopeLabel: null } : null,
    cancelOnServer: cancelSellpiaShipmentTrackingAttempt,
    readCompleteId: (status) => status.lastComplete?.attemptId ?? null,
    // 완료분을 들고 있는 화면 조회가 없다. 송장 행은 조회를 부른 쪽이 그대로 받아 간다.
    onNewComplete: () => undefined,
  };
}
