'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Pencil, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatNumber, formatPercent } from '@/lib/utils';
import {
  resetProductRepresentativeKeyword,
  setProductRepresentativeKeyword,
  type ProductKeywordRankRow,
} from '../lib/rank-api';

const SOURCE_LABEL: Record<ProductKeywordRankRow['keywordSource'], string> = {
  manual_override: '직접 지정',
  wing_performance: 'Wing 추천',
  coupang_category: '쿠팡 카테고리',
  product_name: '상품명 후보',
};

export default function RepresentativeKeywordCell({
  row,
}: {
  row: ProductKeywordRankRow;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.keyword);
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.ads.keywordRank() });
  const saveMutation = useMutation({
    mutationFn: (keyword: string) =>
      setProductRepresentativeKeyword(row.vendorItemId, keyword),
    onSuccess: async () => {
      await invalidate();
      setEditing(false);
      toast.success('대표 키워드를 저장했습니다.');
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : '대표 키워드 저장에 실패했습니다.',
      ),
  });
  const resetMutation = useMutation({
    mutationFn: () => resetProductRepresentativeKeyword(row.vendorItemId),
    onSuccess: async () => {
      await invalidate();
      setEditing(false);
      toast.success('Wing 자동 추천으로 되돌렸습니다.');
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : '자동 추천 복원에 실패했습니다.',
      ),
  });
  const pending = saveMutation.isPending || resetMutation.isPending;

  if (editing) {
    return (
      <div className="min-w-[280px] space-y-2">
        <div className="flex items-center gap-1.5">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && draft.trim().length >= 2) {
                saveMutation.mutate(draft.trim());
              }
              if (event.key === 'Escape') setEditing(false);
            }}
            autoFocus
            maxLength={80}
            aria-label={`${row.productName ?? '상품'} 대표 키워드`}
            className="min-w-0 flex-1 rounded-md border border-purple-300 px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none ring-2 ring-purple-100"
          />
          <button
            type="button"
            onClick={() => saveMutation.mutate(draft.trim())}
            disabled={pending || draft.trim().length < 2}
            aria-label="대표 키워드 저장"
            className="rounded-md bg-purple-600 p-1.5 text-white disabled:opacity-40"
          >
            <Check size={13} />
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={pending}
            aria-label="대표 키워드 편집 취소"
            className="rounded-md border border-slate-200 p-1.5 text-slate-500"
          >
            <X size={13} />
          </button>
        </div>
        {row.candidates.length > 0 && (
          <div className="space-y-1 rounded-lg bg-slate-50 p-2">
            <p className="text-[10px] font-semibold text-slate-500">
              자동 추천 후보 · 판매 50% / 조회 30% / 전환 20%
            </p>
            <div className="flex flex-wrap gap-1">
              {row.candidates.map((candidate) => (
                <button
                  key={candidate.keyword}
                  type="button"
                  onClick={() => setDraft(candidate.keyword)}
                  className={cn(
                    'rounded-md border px-2 py-1 text-left text-[10px]',
                    draft === candidate.keyword
                      ? 'border-purple-300 bg-purple-50 text-purple-700'
                      : 'border-slate-200 bg-white text-slate-600',
                  )}
                  title={
                    candidate.observed
                      ? `판매 ${formatNumber(candidate.keywordSalesLast28d ?? 0)} · 조회 ${formatNumber(candidate.keywordViewsLast28d ?? 0)} · 전환 ${formatPercent((candidate.keywordConversionRate28d ?? 0) * 100)}`
                      : 'Wing 비교 수집 전'
                  }
                >
                  <span className="font-semibold">{candidate.keyword}</span>
                  <span className="ml-1 text-slate-400">
                    {candidate.score === null ? '수집 전' : `${candidate.score}점`}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
        {row.keywordSource === 'manual_override' && (
          <button
            type="button"
            onClick={() => resetMutation.mutate()}
            disabled={pending}
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-purple-700 disabled:opacity-40"
          >
            <RotateCcw size={11} /> 자동 추천 `{row.automaticKeyword}`로 되돌리기
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="min-w-[240px]">
      <div className="flex items-center gap-1.5">
        <span className="font-semibold text-purple-700">{row.keyword}</span>
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-semibold',
            row.keywordSource === 'manual_override'
              ? 'bg-purple-50 text-purple-700'
              : row.keywordSource === 'wing_performance'
                ? 'bg-green-50 text-green-700'
                : 'bg-slate-100 text-slate-500',
          )}
        >
          {SOURCE_LABEL[row.keywordSource]}
          {row.keywordScore !== null ? ` ${row.keywordScore}점` : ''}
        </span>
        <button
          type="button"
          onClick={() => {
            setDraft(row.keyword);
            setEditing(true);
          }}
          aria-label={`${row.keyword} 대표 키워드 수정`}
          className="rounded p-1 text-slate-400 hover:bg-purple-50 hover:text-purple-700"
        >
          <Pencil size={12} />
        </button>
      </div>
      <p className="mt-1 max-w-[300px] truncate text-[10px] text-slate-400" title={row.category ?? undefined}>
        {row.category ? `쿠팡 ${row.category}` : '쿠팡 카테고리 미수집'}
      </p>
      <p className="mt-0.5 text-[10px] text-slate-400">{row.recommendationReason}</p>
    </div>
  );
}
