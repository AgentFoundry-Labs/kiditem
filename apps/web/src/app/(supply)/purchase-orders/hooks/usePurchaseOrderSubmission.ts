'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { collectSellpiaInventoryBeforeCalculation } from '@/app/(inventory)/_shared/collect-sellpia-before-calculation';
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
  const { user } = useAuth();
  const organizationId = user?.organizationId ?? null;
  const [inventoryCollectionRequired, setInventoryCollectionRequired] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const activeSubmission = useRef<ActiveSubmission | null>(null);
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

  useEffect(() => {
    setSubmittingId(null);
    return () => {
      const active = activeSubmission.current;
      if (!active) return;
      active.controller.abort();
      activeSubmission.current = null;
    };
  }, [organizationId]);

  const submit = useCallback((purchaseOrderId: string) => {
    const active = activeSubmission.current;
    if (active) return active.promise;

    const next = {
      purchaseOrderId,
      controller: new AbortController(),
    };
    let resolvePromise!: (value: SubmissionResult) => void;
    let rejectPromise!: (reason?: unknown) => void;
    const promise = new Promise<SubmissionResult>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const activeSubmissionState: ActiveSubmission = { ...next, promise };
    activeSubmission.current = activeSubmissionState;
    setSubmittingId(purchaseOrderId);
    void (async () => {
      try {
        const inventoryAttemptId = await collectSellpiaInventoryBeforeCalculation(
          queryClient,
          organizationId,
          activeSubmissionState.controller.signal,
        );
        if (
          activeSubmissionState.controller.signal.aborted
          || activeSubmission.current !== activeSubmissionState
        ) {
          throw activeSubmissionState.controller.signal.reason instanceof Error
            ? activeSubmissionState.controller.signal.reason
            : new Error('Purchase submission cancelled.');
        }
        const idempotencyKey = createPurchaseOrderSubmissionIdempotencyKey();
        resolvePromise(await mutation.mutateAsync({
          purchaseOrderId: activeSubmissionState.purchaseOrderId,
          inventoryAttemptId,
          idempotencyKey,
        }));
      } catch (error) {
        rejectPromise(error);
      } finally {
        if (activeSubmission.current === activeSubmissionState) {
          activeSubmission.current = null;
          setSubmittingId(null);
        }
      }
    })();
    return promise;
  }, [mutation, organizationId, queryClient]);

  return {
    submit,
    submittingId,
    inventoryCollectionRequired,
  };
}

type ActiveSubmission = {
  purchaseOrderId: string;
  controller: AbortController;
  promise: Promise<SubmissionResult>;
};

type SubmissionResult = Awaited<ReturnType<typeof purchaseOrdersApi.submit>>;
