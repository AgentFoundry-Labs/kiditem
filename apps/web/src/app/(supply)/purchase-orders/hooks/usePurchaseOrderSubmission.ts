'use client';

import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import {
  createPurchaseOrderSubmissionIdempotencyKey,
  isSellpiaInventoryCollectionRequired,
  purchaseOrdersApi,
  type SubmitPurchaseOrderRequest,
} from '../lib/purchase-orders-api';

/**
 * `pending -> ordered` submission. A stale Sellpia generation asks the
 * operator to collect inventory; submission never starts a collection or
 * resubmits by itself.
 */
export function usePurchaseOrderSubmission() {
  const queryClient = useQueryClient();
  const [inventoryCollectionRequired, setInventoryCollectionRequired] = useState(false);
  const mutation = useMutation({
    mutationFn: (input: SubmitPurchaseOrderRequest) => purchaseOrdersApi.submit(input),
    onMutate: () => {
      setInventoryCollectionRequired(false);
    },
    onSuccess: () => {
      toast.success('발주가 확정되었습니다.');
    },
    onError: (error) => {
      if (isSellpiaInventoryCollectionRequired(error)) {
        setInventoryCollectionRequired(true);
        return;
      }
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
    inventoryCollectionRequired,
  };
}
