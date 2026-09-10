'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import type { ProductOperationsPeriodDays } from '@kiditem/shared/product-operations';
import { isApiError } from '@/lib/api-error';
import {
  recalculateProductAbc,
  type ProductAbcRecalculationResponse,
} from '@/lib/product-abc-api';
import { queryKeys } from '@/lib/query-keys';
import { useProductOperationsDataStatus } from '../hooks/useProductOperationsDataStatus';
import {
  ProductOperationsDataStatusDialog,
  type ProductOperationsDataStatusFeedback,
} from './ProductOperationsDataStatusDialog';
import { ProductOperationsFullRefreshAction } from './ProductOperationsFullRefreshAction';

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
  const refresh = useMutation({
    mutationFn: recalculateProductAbc,
    retry: false,
    onSuccess: async (result: ProductAbcRecalculationResponse) => {
      if (result.outcome === 'SOURCE_NOT_READY') {
        const notReady = Object.entries(result.sources)
          .filter(([, source]) => source.status !== 'READY')
          .map(([source]) => source === 'sellpia' ? 'Sellpia' : '광고비')
          .join(', ');
        setFeedback({
          tone: 'warning',
          message: `원천이 준비되지 않아 기존 공식 등급을 유지합니다. 공식 등급 기준일 ${result.officialCutoff ?? '없음'} · 표시 데이터 기준일 ${result.actualCutoff ?? '없음'}${notReady ? ` · 준비 필요: ${notReady}` : ''}`,
        });
        return;
      }

      await refetchReads();
      setFeedback({
        tone: 'success',
        message: `ABC 등급을 발행했습니다. 공식 등급 기준일 ${result.officialCutoff}`,
      });
    },
    onError: async (error: unknown) => {
      if (isApiError(error) && error.status === 409) {
        await refetchReads();
        setFeedback({
          tone: 'error',
          message: '계산 중 입력이 변경되었습니다. 최신 상태를 확인한 뒤 다시 시도해 주세요.',
        });
        return;
      }
      setFeedback({
        tone: 'error',
        message: 'ABC 등급 새로고침에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      });
    },
  });

  return (
    <>
      <ProductOperationsFullRefreshAction />
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
