'use client';

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  MasterProductAbcPolicyResponseSchema,
  MasterProductAbcRecalculationResultSchema,
  type MasterProductAbcPolicy,
} from '@kiditem/shared/product-abc';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { formatDateTime } from '@/lib/utils';

const PERIOD_OPTIONS = [
  { value: 30, label: '최근 1개월 (완료 월)' },
  { value: 90, label: '최근 3개월 (완료 월)' },
  { value: 180, label: '최근 6개월 (완료 월)' },
  { value: 360, label: '최근 12개월 (완료 월)' },
] as const;

export function MasterProductAbcPolicyDialog({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const policyQuery = useQuery({
    queryKey: queryKeys.products.abcPolicy(),
    queryFn: () => apiClient.getParsed('/api/products/abc-policy', MasterProductAbcPolicyResponseSchema),
    enabled: open,
  });
  const [draft, setDraft] = useState<MasterProductAbcPolicy | null>(null);
  useEffect(() => {
    if (policyQuery.data) {
      const { lastCalculatedAt: _lastCalculatedAt, sourceCapturedAt: _sourceCapturedAt, ...policy } = policyQuery.data;
      setDraft(policy);
    }
  }, [policyQuery.data]);
  const invalidateDependentReads = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.products.abcPolicy() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.products.operations.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.productSalesAll() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.actionTasks.all }),
    ]);
  };
  const recalculate = useMutation({
    mutationFn: async () => MasterProductAbcRecalculationResultSchema.parse(
      await apiClient.post('/api/products/abc-grade/recalculate', {}),
    ),
    onSuccess: async (result) => {
      await invalidateDependentReads();
      toast.success(result.changedProductCount === 0 ? 'ABC 등급이 최신 상태입니다.' : `${result.changedProductCount}개 상품의 ABC 등급을 갱신했습니다.`);
    },
    onError: (error) => toast.error(isApiError(error) ? error.detail : 'ABC 등급을 계산하지 못했습니다.'),
  });
  const save = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error('ABC 정책을 불러오는 중입니다.');
      await apiClient.put('/api/products/abc-policy', draft);
    },
    onSuccess: async () => {
      await invalidateDependentReads();
      onOpenChange(false);
    },
    onError: (error) => toast.error(isApiError(error) ? error.detail : 'ABC 정책을 저장하지 못했습니다.'),
  });
  const busy = save.isPending || recalculate.isPending;
  const errorMessage = policyQuery.error
    ? (isApiError(policyQuery.error) ? policyQuery.error.detail : 'ABC 정책을 불러오지 못했습니다.')
    : null;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-slate-950/45 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[130] w-[min(94vw,560px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-6 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-extrabold text-[var(--text-primary)]">자동 ABC 정책</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-[var(--text-secondary)]">
                판매 수량 또는 매출을 완료된 월 단위로 집계해 자동 분류합니다. 수동 변경은 지원하지 않습니다.
              </Dialog.Description>
            </div>
            <Dialog.Close aria-label="닫기" className="rounded-lg p-2 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"><X size={18} /></Dialog.Close>
          </div>
          {errorMessage ? <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{errorMessage}</p> : null}
          {draft ? (
            <div className="mt-5 space-y-4">
              <label className="block text-sm font-semibold text-[var(--text-secondary)]">지표
                <select value={draft.metric} onChange={(event) => setDraft({ ...draft, metric: event.target.value as MasterProductAbcPolicy['metric'] })} className="mt-1.5 h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 text-[var(--text-primary)]">
                  <option value="SALES_QUANTITY">판매 수량</option><option value="SALES_AMOUNT">매출액</option>
                </select>
              </label>
              <label className="block text-sm font-semibold text-[var(--text-secondary)]">집계 기간
                <select value={draft.periodDays} onChange={(event) => setDraft({ ...draft, periodDays: Number(event.target.value) as MasterProductAbcPolicy['periodDays'] })} className="mt-1.5 h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 text-[var(--text-primary)]">
                  {PERIOD_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <NumberInput label="A 누적 비율" value={draft.aCumulativeThreshold} onChange={(aCumulativeThreshold) => setDraft({ ...draft, aCumulativeThreshold })} />
                <NumberInput label="B 누적 비율" value={draft.bCumulativeThreshold} onChange={(bCumulativeThreshold) => setDraft({ ...draft, bCumulativeThreshold })} />
              </div>
              <p className="rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-xs text-[var(--text-tertiary)]">마지막 계산: {policyQuery.data?.lastCalculatedAt ? formatDateTime(policyQuery.data.lastCalculatedAt) : '아직 계산하지 않음'}</p>
              <div className="flex justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
                <button type="button" onClick={() => recalculate.mutate()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-bold text-[var(--text-secondary)] disabled:opacity-50"><RefreshCw size={14} /> 지금 재계산</button>
                <button type="button" onClick={() => save.mutate()} disabled={busy || draft.aCumulativeThreshold >= draft.bCumulativeThreshold} className="rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50">저장 후 재계산</button>
              </div>
            </div>
          ) : <p className="mt-5 text-sm text-[var(--text-tertiary)]">정책을 불러오는 중입니다.</p>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="block text-sm font-semibold text-[var(--text-secondary)]">{label}<input aria-label={label} type="number" min={1} max={100} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1.5 h-10 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-3 text-[var(--text-primary)]" /></label>;
}
