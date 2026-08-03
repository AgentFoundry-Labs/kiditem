'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import type { ProductOperationsPeriodDays } from '@kiditem/shared/product-operations';
import { startProductProfitabilityRefreshAction } from '@/lib/manual-operation-actions';
import { queryKeys } from '@/lib/query-keys';
import { useProductOperationsDataStatus } from '../hooks/useProductOperationsDataStatus';
import { ProductOperationsDataStatusDialog } from './ProductOperationsDataStatusDialog';

export function ProductOperationsDataStatusAction({
  open,
  onOpenChange,
  displayDataAsOf,
  periodDays,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayDataAsOf: string | null;
  periodDays: ProductOperationsPeriodDays;
}) {
  const queryClient = useQueryClient();
  const status = useProductOperationsDataStatus(open, periodDays);
  const refresh = useMutation({
    mutationFn: () => startProductProfitabilityRefreshAction({ sourceSurface: 'domain_screen' }),
    onSuccess: async () => {
      onOpenChange(false);
      toast.success('수익성 데이터 갱신을 시작했습니다.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.products.operations.dataStatus(periodDays) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.operations.runs() }),
      ]);
    },
    onError: () => toast.error('수익성 데이터 갱신 요청에 실패했습니다.'),
  });

  return (
    <>
      <button type="button" onClick={() => onOpenChange(true)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3 text-[13px] font-bold text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]">
        <CalendarClock size={14} />
        {displayDataAsOf ? `데이터 기준 ${displayDataAsOf.replaceAll('-', '.')}` : '데이터 기준 없음'}
      </button>
      <ProductOperationsDataStatusDialog
        open={open}
        onOpenChange={onOpenChange}
        data={status.data}
        loading={status.isLoading}
        error={status.isError}
        refreshing={refresh.isPending}
        onRefresh={() => refresh.mutate()}
      />
    </>
  );
}
