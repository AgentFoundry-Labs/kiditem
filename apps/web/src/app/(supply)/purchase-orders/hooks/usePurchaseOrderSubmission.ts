'use client';

import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { useSellpiaInventorySourceOwner } from '@/app/(inventory)/_shared/sellpia-inventory-source-owner';
import {
  createPurchaseOrderSubmissionIdempotencyKey,
  submitPurchaseOrderWithFreshnessRecovery,
  type SubmitPurchaseOrderRequest,
} from '../lib/purchase-orders-api';

export function usePurchaseOrderSubmission() {
  const queryClient = useQueryClient();
  const { start: startSellpiaInventorySource } = useSellpiaInventorySourceOwner({ enabled: true });
  const mutation = useMutation({
    mutationFn: (input: SubmitPurchaseOrderRequest) =>
      submitPurchaseOrderWithFreshnessRecovery(input, {
        dependencies: {
          requestRefresh: async () => {
            const attempt = await startSellpiaInventorySource('purchase_preflight');
            return { requestedGeneration: attempt.generation };
          },
        },
        onRefreshRequested: () => queryClient.invalidateQueries({
          queryKey: queryKeys.inventory.freshness(),
        }),
      }),
    onSuccess: () => {
      toast.success('발주가 확정되었습니다.');
    },
    onError: (error) => {
      toast.error(friendlyError(error) ?? '발주 확정에 실패했습니다.');
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
    },
  });

  const submit = useCallback((purchaseOrderId: string) => {
    const idempotencyKey = createPurchaseOrderSubmissionIdempotencyKey();
    return mutation.mutateAsync({ purchaseOrderId, idempotencyKey });
  }, [mutation]);

  return {
    submit,
    submittingId: mutation.isPending
      ? mutation.variables?.purchaseOrderId ?? null
      : null,
  };
}
