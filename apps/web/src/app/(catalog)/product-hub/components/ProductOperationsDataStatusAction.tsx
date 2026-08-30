'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import type { ProductOperationsPeriodDays } from '@kiditem/shared/product-operations';
import { startProductProfitabilityRefreshAction } from '@/lib/manual-operation-actions';
import { queryKeys } from '@/lib/query-keys';
import { useCancelOperationRun } from '@/hooks/useOperationRun';
import { useProductOperationsDataStatus } from '../hooks/useProductOperationsDataStatus';
import { ProductOperationsDataStatusDialog } from './ProductOperationsDataStatusDialog';

export function ProductOperationsDataStatusAction({
  open,
  onOpenChange,
  periodDays,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  periodDays: ProductOperationsPeriodDays;
}) {
  const queryClient = useQueryClient();
  const status = useProductOperationsDataStatus(open, periodDays);
  const cancelRun = useCancelOperationRun();
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
  const cancelRefresh = async () => {
    const activeRun = status.data?.activeRun;
    if (!activeRun) return;
    try {
      await cancelRun.mutateAsync(activeRun.id);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.products.operations.dataStatus(periodDays),
      });
      toast.success('수익성 데이터 갱신을 중단했습니다.');
    } catch (error) {
      toast.error('수익성 데이터 갱신 중단에 실패했습니다.');
      throw error;
    }
  };

  return (
    <>
      <button type="button" onClick={() => onOpenChange(true)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3 text-[13px] font-bold text-[var(--text-secondary)] hover:border-[var(--primary)] hover:text-[var(--primary)]">
        <CalendarClock size={14} />
        데이터 갱신
      </button>
      <ProductOperationsDataStatusDialog
        open={open}
        onOpenChange={onOpenChange}
        data={status.data}
        loading={status.isLoading}
        error={status.isError}
        refreshing={refresh.isPending}
        cancelling={cancelRun.isPending}
        onRefresh={() => refresh.mutate()}
        onCancel={cancelRefresh}
      />
    </>
  );
}
