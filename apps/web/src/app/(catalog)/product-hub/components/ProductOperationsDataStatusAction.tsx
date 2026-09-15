'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import type { ProductOperationsPeriodDays } from '@kiditem/shared/product-operations';
import { useProductAbcRecalculation } from '@/hooks/useProductAbcRecalculation';
import { queryKeys } from '@/lib/query-keys';
import { useProductOperationsDataStatus } from '../hooks/useProductOperationsDataStatus';
import {
  ProductOperationsDataStatusDialog,
  type ProductOperationsDataStatusFeedback,
} from './ProductOperationsDataStatusDialog';
import { ProductOperationsSourceCollections } from './ProductOperationsSourceCollections';

export function ProductOperationsDataStatusAction({
  open,
  onOpenChange,
  onProductsRefetch,
  periodDays,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProductsRefetch: () => Promise<unknown>;
  periodDays: ProductOperationsPeriodDays;
}) {
  const queryClient = useQueryClient();
  const status = useProductOperationsDataStatus(open, periodDays);
  const [feedback, setFeedback] = useState<ProductOperationsDataStatusFeedback | null>(null);
  const refetchReads = () => Promise.all([
    onProductsRefetch(),
    queryClient.refetchQueries({
      queryKey: queryKeys.products.operations.dataStatuses(),
      type: 'all',
    }),
    queryClient.refetchQueries({
      queryKey: queryKeys.products.operations.details(),
      type: 'all',
    }),
  ]);
  const refresh = useProductAbcRecalculation({ onFeedback: setFeedback, refetchReads });

  return (
    <>
      <ProductOperationsSourceCollections />
      <button type="button" onClick={() => onOpenChange(true)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3 text-[13px] font-bold text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]">
        <CalendarClock size={14} />
        ABC 등급 현황
      </button>
      <ProductOperationsDataStatusDialog
        open={open}
        onOpenChange={onOpenChange}
        data={status.data}
        loading={status.isLoading}
        error={status.isError}
        refreshing={refresh.isPending}
        feedback={feedback}
        onRefresh={() => {
          setFeedback(null);
          refresh.mutate();
        }}
      />
    </>
  );
}
