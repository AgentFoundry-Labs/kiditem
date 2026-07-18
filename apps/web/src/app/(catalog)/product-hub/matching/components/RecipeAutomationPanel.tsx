'use client';

import { useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/api-error';
import {
  useApplyChannelRecipeAutomation,
  useChannelRecipeAutomationPreview,
} from '../hooks/useChannelSkuMappings';

export function RecipeAutomationPanel({ channelAccountId }: {
  channelAccountId?: string;
}) {
  const [open, setOpen] = useState(false);
  const preview = useChannelRecipeAutomationPreview(channelAccountId);
  const apply = useApplyChannelRecipeAutomation();
  const data = preview.data;
  const automaticOptionCount = useMemo(() => data?.items
    .filter((item) => item.decision === 'auto_apply')
    .reduce((sum, item) => sum + item.channelListingOptionIds.length, 0) ?? 0, [data]);
  const disabled = !channelAccountId
    || !data
    || data.summary.autoApply === 0
    || preview.isLoading
    || preview.isFetching
    || apply.isPending;

  const confirm = async () => {
    if (!data || !channelAccountId) return;
    try {
      const result = await apply.mutateAsync({
        channelAccountId,
        proposalVersion: data.proposalVersion,
      });
      toast.success(
        `자동 매칭 ${result.appliedVariants}개 상품 옵션, ${result.affectedOptions}개 운영 옵션에 적용했습니다.`,
      );
      setOpen(false);
      await preview.refetch();
    } catch (error) {
      toast.error(friendlyError(error) ?? '자동 매칭을 적용하지 못했습니다. 미리보기를 새로 확인해 주세요.');
    }
  };

  return (
    <section aria-label="재고 자동 매칭" className="rounded-xl border border-purple-200 bg-purple-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">Sellpia 재고 자동 매칭</h2>
          <p className="mt-1 text-sm text-slate-600">
            코드·고유 바코드·상품명+옵션이 하나의 Sellpia SKU로 일치하는 항목만 수량 1로 적용합니다.
          </p>
        </div>
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <button
              type="button"
              disabled={disabled}
              className="inline-flex items-center gap-2 rounded-xl bg-purple-700 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {apply.isPending ? <Loader2 size={15} className="animate-spin" /> : null}
              확정 기준 자동 매칭
            </button>
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-[120] bg-slate-950/45" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-[130] w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-2xl">
              <Dialog.Title className="text-lg font-extrabold text-slate-900">
                확정 기준 자동 매칭
              </Dialog.Title>
              <Dialog.Description className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                <span className="block">코드·고유 바코드·상품명+옵션이 하나의 Sellpia SKU로 일치하는 항목만 수량 1로 적용합니다.</span>
                <span className="block">기존 레시피는 덮어쓰지 않으며 묶음·중복·충돌 항목은 검토 큐에 남습니다.</span>
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
                  className="rounded-lg bg-purple-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  {automaticOptionCount.toLocaleString('ko-KR')}개 운영 옵션 적용
                </button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </div>

      {preview.isLoading ? (
        <p className="mt-4 inline-flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" /> 자동 매칭 미리보기를 계산하는 중입니다.
        </p>
      ) : preview.error ? (
        <p role="alert" className="mt-4 text-sm text-rose-700">
          {friendlyError(preview.error) ?? '자동 매칭 미리보기를 불러오지 못했습니다.'}
        </p>
      ) : data ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="자동 적용 가능" value={data.summary.autoApply} tone="emerald" />
          <Metric label="수량·상품 검토" value={data.summary.operatorReview} tone="amber" />
          <Metric label="매칭 정보 없음" value={data.summary.blocked} tone="slate" />
          <Metric label="구성 완료" value={data.summary.alreadyConfigured} tone="purple" />
        </div>
      ) : null}
      {data ? (
        <p className="mt-3 text-xs text-slate-500">
          중앙 상품 옵션 {data.summary.variants.toLocaleString('ko-KR')}개 · 선택 계정 운영 옵션 {data.summary.affectedOptions.toLocaleString('ko-KR')}개
        </p>
      ) : null}
    </section>
  );
}

function Metric({ label, value, tone }: {
  label: string;
  value: number;
  tone: 'emerald' | 'amber' | 'slate' | 'purple';
}) {
  const toneClass = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    slate: 'border-slate-200 bg-white text-slate-700',
    purple: 'border-purple-200 bg-white text-purple-800',
  }[tone];
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm font-bold ${toneClass}`}>
      {label} {value.toLocaleString('ko-KR')}
    </div>
  );
}
