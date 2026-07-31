'use client';

import { CheckCircle2, DatabaseZap, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/api-error';
import { formatNumber } from '@/lib/utils';
import {
  useChannelRecipeAutomationPreviews,
  useRunChannelProductMatching,
} from '../hooks/useChannelSkuMappings';

export function RecipeAutomationPanel({
  channelAccountIds,
}: {
  channelAccountIds: string[];
}) {
  const previews = useChannelRecipeAutomationPreviews(channelAccountIds);
  const runMatching = useRunChannelProductMatching();
  const previewData = previews.flatMap((query) => query.data ? [query.data] : []);
  const previewLoading = previews.some((query) => query.isLoading);
  const previewError = previews.find((query) => query.error)?.error;
  const outcome = previewData.flatMap((preview) => preview.productGroups)
    .reduce((summary, group) => {
      if (group.decision === 'auto_apply' || group.decision === 'already_configured') {
        summary.matched += 1;
      } else if (group.decision === 'quantity_review') {
        summary.quantityReview += 1;
      } else {
        summary.unmatched += 1;
      }
      return summary;
    }, {
    matched: 0,
    quantityReview: 0,
    unmatched: 0,
  });
  const runAutomation = async () => {
    try {
      const result = await runMatching.mutateAsync({
        channelAccountIds,
      });
      if (result.appliedProducts > 0) {
        toast.success(
          `상품 ${result.appliedProducts}개, 운영 옵션 ${result.affectedOptions}개에 재고 구성을 적용했습니다.`,
        );
      } else {
        toast.success('상품 매칭 결과를 갱신했습니다.');
      }
    } catch (error) {
      toast.error(friendlyError(error) ?? (error instanceof Error ? error.message : '상품 매칭을 실행하지 못했습니다.'));
    }
  };

  return (
    <section aria-label="매칭 작업 현황" className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={18} className="text-emerald-600" />
          <h2 className="text-base font-extrabold text-slate-900">매칭 작업 현황</h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void runAutomation()}
            disabled={channelAccountIds.length === 0 || runMatching.isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-700 px-3.5 py-2.5 text-sm font-bold text-white hover:bg-purple-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {runMatching.isPending ? <Loader2 size={15} className="animate-spin" /> : <DatabaseZap size={15} />}
            상품 매칭 실행
          </button>
        </div>
      </div>

      <div className="grid gap-px bg-slate-200 sm:grid-cols-3" aria-label="매칭 상태 요약">
        <Outcome label="매칭 완료" value={previewLoading ? null : outcome.matched} tone="emerald" />
        <Outcome label="매칭 수량 검토" value={previewLoading ? null : outcome.quantityReview} tone="amber" />
        <Outcome label="미매칭 상품" value={previewLoading ? null : outcome.unmatched} tone="slate" />
      </div>

      {previewError ? (
        <div className="border-t border-slate-200 px-5 py-3">
          <p role="alert" className="text-sm text-rose-700">
            {friendlyError(previewError) ?? '자동 재고 구성 미리보기를 불러오지 못했습니다.'}
          </p>
        </div>
      ) : null}
    </section>
  );
}

function Outcome({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: 'emerald' | 'amber' | 'slate';
}) {
  const toneClass = {
    emerald: 'text-emerald-800',
    amber: 'text-amber-900',
    slate: 'text-slate-700',
  }[tone];
  return (
    <div className={`bg-white px-5 py-4 ${toneClass}`}>
      <p className="text-xs font-bold">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums">
        {value === null ? <Loader2 size={18} className="animate-spin" /> : formatNumber(value)}
      </p>
    </div>
  );
}
