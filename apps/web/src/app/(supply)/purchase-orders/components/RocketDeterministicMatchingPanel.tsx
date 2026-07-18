'use client';

import { useState } from 'react';
import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  applyChannelRecipeAutomation,
  getChannelRecipeAutomationPreview,
} from '@/lib/channel-recipe-automation-api';
import { friendlyError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';

export function RocketDeterministicMatchingPanel({
  channelAccountId,
  onApplied,
}: {
  channelAccountId: string;
  onApplied: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = useQuery({
    queryKey: queryKeys.channelProductMappings.recipeAutomationPreview(channelAccountId),
    queryFn: () => getChannelRecipeAutomationPreview(channelAccountId),
    enabled: Boolean(channelAccountId),
    staleTime: 0,
  });
  const apply = useMutation({
    mutationFn: applyChannelRecipeAutomation,
  });
  const data = preview.data;
  const unresolved = (data?.summary.operatorReview ?? 0) + (data?.summary.blocked ?? 0);

  const confirm = async () => {
    if (!data) return;
    setError(null);
    try {
      await apply.mutateAsync({
        channelAccountId,
        proposalVersion: data.proposalVersion,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.channelProductMappings.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.channelSkuAvailability.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.products.operations.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
      ]);
      await onApplied();
      await preview.refetch();
      setDialogOpen(false);
    } catch (cause) {
      setError(friendlyError(cause) ?? '확정 기준 매칭을 적용하지 못했습니다.');
    }
  };

  return (
    <section aria-label="로켓 Sellpia 구성 매칭" className="rounded-xl border border-purple-200 bg-purple-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-900">Sellpia 구성 매칭</h3>
          <p className="mt-1 text-sm text-slate-600">
            정확 코드·고유 바코드·엄격한 상품명+옵션 일치만 중앙 구성표에 적용합니다.
          </p>
        </div>
        <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
          <Dialog.Trigger asChild>
            <button
              type="button"
              disabled={!data || data.summary.autoApply === 0 || apply.isPending}
              className="rounded-lg bg-purple-700 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300"
            >
              확정 기준 매칭 적용
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-[120] bg-slate-950/45" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-[130] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl">
              <Dialog.Title className="text-lg font-extrabold text-slate-900">
                확정 가능한 구성만 적용
              </Dialog.Title>
              <Dialog.Description className="mt-3 text-sm leading-6 text-slate-600">
                기존 구성표는 덮어쓰지 않습니다. 묶음·수량·중복·충돌 항목은 운영자 검토에 남습니다.
              </Dialog.Description>
              <div className="mt-5 flex justify-end gap-2">
                <Dialog.Close asChild>
                  <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">
                    취소
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  onClick={() => void confirm()}
                  disabled={apply.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-purple-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  {apply.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                  {data?.summary.autoApply ?? 0}개 구성 적용
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>

      {preview.isLoading ? (
        <p className="mt-3 inline-flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" /> 매칭 근거 계산 중
        </p>
      ) : data ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="자동 적용 가능" value={data.summary.autoApply} />
          <Metric label="운영자 검토" value={data.summary.operatorReview} />
          <Metric label="매칭 정보 없음" value={data.summary.blocked} />
          <Metric label="구성 완료" value={data.summary.alreadyConfigured} />
        </div>
      ) : null}
      {unresolved > 0 ? (
        <Link href="/product-hub/matching?level=options" className="mt-3 inline-flex text-sm font-bold text-purple-700 underline underline-offset-2">
          검토 대상 확인
        </Link>
      ) : null}
      {preview.error || error ? (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {error ?? friendlyError(preview.error) ?? '매칭 정보를 불러오지 못했습니다.'}
        </p>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-purple-100 bg-white px-3 py-2 text-sm font-bold text-slate-700">
      {label} {value.toLocaleString('ko-KR')}
    </div>
  );
}
