'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OperationListResponse } from '@kiditem/shared/operation';
import { SELLPIA_INVENTORY_KIND } from '@kiditem/shared/sellpia-operations';
import type {
  SellpiaInventoryCollectionStatus,
  SellpiaInventoryCollectionStatusView,
} from '@kiditem/shared/sellpia-inventory-freshness';
import {
  COLLECTION_IDLE_POLL_MS,
  useCollectionSourceControl,
  type CollectionSourceAdapter,
} from '@/hooks/use-collection-source-control';
import { useAuth } from '@/hooks/useAuth';
import { attemptFailureText } from '@/lib/operator-error';
import { queryKeys } from '@/lib/query-keys';
import { sellpiaInventoryCollectionStatusApi } from '@/lib/sellpia-inventory-freshness-api';
import { sellpiaOperationControl, sellpiaOperationState } from '@/lib/sellpia-operations';
import { invalidateSellpiaInventory } from './invalidate-sellpia-inventory';

/** 공용 수집 컨트롤·브라우저 수집 세션이 이 원천을 부르는 이름. */
export const SELLPIA_INVENTORY_SOURCE_KEY = 'inventory.sellpia';

export type SellpiaInventorySourceOwnerState = {
  status: SellpiaInventoryCollectionStatus;
  lastCompletedAt: string | null;
  /** 지금 재고를 발행한 셀피아 재고 실행(`products.sellpia_inventory`). */
  lastCompletedOperationId: string | null;
  errorMessage: string | null;
  sourceBindingConfirmed: boolean;
  /** 마지막 실행을 운영자가 멈췄다 — 이전 재고가 그대로 쓰인다. */
  stopped: boolean;
};

/**
 * 셀피아 재고 수집(실행 kind `products.sellpia_inventory`, KID-361 J1). 화면은 확장에 `operation.start`만 보내고,
 * 도는 실행·중단·끝은 실행 reader로, 발행된 재고(계정 연결·완료 시각·실행 id)는 Products 상태 읽기로 본다.
 */
export function sellpiaInventoryCollection({
  organizationId,
}: Readonly<{ organizationId: string | null }>): CollectionSourceAdapter<OperationListResponse> {
  return sellpiaOperationControl({
    kind: SELLPIA_INVENTORY_KIND,
    sourceKey: SELLPIA_INVENTORY_SOURCE_KEY,
    label: '셀피아 재고 수집',
    scope: () => ({}),
    enabled: Boolean(organizationId),
    // 새 완료 실행은 모든 재고 화면이 읽는 스냅샷을 다시 발행했다.
    onNewComplete: (queryClient) => {
      void invalidateSellpiaInventory(queryClient);
    },
  });
}

/** 발행된 재고 상태와 최근 실행으로 화면 상태를 정한다. 도는 실행·실패는 실행이, 완료·미수집은 발행 상태가 말한다. */
export function sellpiaInventoryState(
  freshness: SellpiaInventoryCollectionStatusView,
  operations: OperationListResponse | undefined,
): SellpiaInventorySourceOwnerState {
  const { running, lastFinished } = sellpiaOperationState(operations);
  const failed = !running && lastFinished?.status === 'failed';
  const stopped = !running && lastFinished?.status === 'cancelled';
  const completed = freshness.verifiedGeneration !== '0' && freshness.lastCompletedAt !== null;
  return {
    status: running ? 'running' : failed ? 'failed' : completed ? 'complete' : 'not_collected',
    lastCompletedAt: freshness.lastCompletedAt,
    lastCompletedOperationId: freshness.lastCompletedAttemptId,
    errorMessage: failed ? attemptFailureText(lastFinished, 'sellpia_inventory') : null,
    sourceBindingConfirmed: freshness.sourceBinding.confirmed,
    stopped,
  };
}

/**
 * 셀피아 재고 수집 컨트롤과 화면이 보여 줄 상태. 마운트된 모든 사본이 시작·중단·도는 상태를 나눠 쓴다.
 */
export function useSellpiaInventoryCollection({ enabled = true }: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const organizationId = enabled ? user?.organizationId ?? null : null;
  const adapter = useMemo(() => sellpiaInventoryCollection({ organizationId }), [organizationId]);
  const control = useCollectionSourceControl(adapter);
  const statusQueryKey = queryKeys.inventory.sellpiaCollectionStatus(organizationId ?? '');
  const freshness = useQuery({
    queryKey: statusQueryKey,
    queryFn: () => sellpiaInventoryCollectionStatusApi.getState(),
    enabled: Boolean(organizationId),
    refetchInterval: COLLECTION_IDLE_POLL_MS,
    refetchIntervalInBackground: false,
    meta: { suppressGlobalErrorToast: true },
  });
  const binding = useMutation({
    mutationFn: sellpiaInventoryCollectionStatusApi.confirmSourceBinding,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: statusQueryKey, exact: true }),
  });
  const state = freshness.data ? sellpiaInventoryState(freshness.data, control.status) : null;

  return {
    control,
    state,
    confirmSourceBinding: binding.mutateAsync,
    isConfirming: binding.isPending,
  };
}
