'use client';

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
  const preview = useChannelRecipeAutomationPreview(channelAccountId);
  const apply = useApplyChannelRecipeAutomation();
  const data = preview.data;
  const disabled = !channelAccountId
    || !data
    || data.summary.autoApply === 0
    || preview.isLoading
    || preview.isFetching
    || apply.isPending;

  const runAutomation = async () => {
    if (!data || !channelAccountId) return;
    try {
      const result = await apply.mutateAsync({
        channelAccountId,
        proposalVersion: data.proposalVersion,
      });
      toast.success(
        `상품 ${result.appliedProducts}개, 운영 옵션 ${result.affectedOptions}개에 재고 연결을 적용했습니다.`,
      );
      await preview.refetch();
    } catch (error) {
      toast.error(friendlyError(error) ?? '자동 매칭을 적용하지 못했습니다. 미리보기를 새로 확인해 주세요.');
    }
  };

  return (
    <section aria-label="재고 자동 매칭" className="rounded-xl border border-purple-200 bg-purple-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-extrabold text-slate-900">상품·재고 자동 매칭</h2>
          <p className="mt-1 text-sm text-slate-600">
            코드·바코드·완전일치·유일한 고신뢰 상품명과 검증된 구성 수량만 자동 연결합니다. 애매한 하위 옵션은 상품별 검토로 남습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runAutomation()}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-xl bg-purple-700 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {apply.isPending ? <Loader2 size={15} className="animate-spin" /> : null}
          상품·재고 자동 매칭
        </button>
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
          <Metric label="자동 적용 대상" value={data.summary.autoApplyProducts} tone="emerald" />
          <Metric label="운영자 검토" value={data.summary.operatorReviewProducts} tone="amber" />
          <Metric label="연결·매칭 필요" value={data.summary.blockedProducts} tone="slate" />
          <Metric label="구성 완료" value={data.summary.alreadyConfiguredProducts} tone="purple" />
        </div>
      ) : null}
      {data ? (
        <p className="mt-3 text-xs text-slate-500">
          채널 상품 {data.summary.products.toLocaleString('ko-KR')}개 · 중앙 상품 옵션 {data.summary.variants.toLocaleString('ko-KR')}개 · 선택 계정 운영 옵션 {data.summary.affectedOptions.toLocaleString('ko-KR')}개
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
