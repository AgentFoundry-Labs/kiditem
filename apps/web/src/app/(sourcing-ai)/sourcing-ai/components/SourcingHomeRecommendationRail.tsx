'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, ShoppingCart } from 'lucide-react';
import { formatKRW, formatNumber } from '@/lib/utils';
import { useSourcingRecommendations } from '../hooks/use-sourcing-workspace';
import { toTodayRecommendationRows } from '../lib/sourcing-recommendation-presenter';
import { resolveCoupangCatalogImageUrl } from '../wing-catalog/lib/wing-catalog-extension';
import type { TodayRecommendationRow } from '../recommendations/lib/today-recommendations';
import { SourcingReadState } from './SourcingReadState';

/** 소싱 홈 · 오늘의 추천 실시간 후보 상품 — 한 줄 가로 스크롤 컴팩트 레일. */
export function SourcingHomeRecommendationRail() {
  const recommendationsQuery = useSourcingRecommendations('home', { limit: 40 });

  const recommendationRows = useMemo(() => {
    const source = toTodayRecommendationRows(recommendationsQuery.data?.data?.items ?? []);
    const seen = new Set<string>();

    return [...source]
      .filter((row) => {
        const key = recommendationRowKey(row);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 40);
  }, [recommendationsQuery.data]);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-slate-900">오늘의 추천</h2>
          <span className="text-xs font-medium text-slate-500">실시간 후보 상품</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-purple-100 px-2.5 py-1 text-[11px] font-semibold text-purple-700">
            {recommendationRows.length > 0 ? `${formatNumber(recommendationRows.length)}개` : '검증 대기'}
          </span>
          <Link
            href="/sourcing-ai/recommendations"
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-purple-600 transition-colors hover:text-purple-700"
          >
            전체
            <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      <div className="p-4">
        <SourcingReadState
          envelope={recommendationsQuery.data}
          isLoading={recommendationsQuery.isLoading}
          error={recommendationsQuery.error}
          emptyLabel="오늘의 추천에서 Wing 검증을 실행하면 후보 상품이 레일로 표시됩니다."
        >
          {recommendationRows.length > 0 ? (
            <div className="grid max-h-[30rem] grid-cols-4 gap-3 overflow-y-auto [scrollbar-width:thin] sm:grid-cols-6 xl:grid-cols-8">
              {recommendationRows.map((row) => (
                <RecommendationCard key={recommendationRowKey(row)} row={row} />
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-4 py-7 text-center text-xs font-medium text-slate-400">
              오늘의 추천에서 Wing 검증을 실행하면 후보 상품이 레일로 표시됩니다.
            </p>
          )}
        </SourcingReadState>
      </div>
    </section>
  );
}

function RecommendationCard({ row }: { row: TodayRecommendationRow }) {
  const imageUrl = resolveCoupangCatalogImageUrl(row.imagePath);

  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-colors hover:border-purple-300">
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-slate-50">
        {imageUrl ? (
          <img src={imageUrl} alt={row.productName} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <ShoppingCart size={24} className="text-slate-300" />
        )}
        <span className="absolute left-1.5 top-1.5 rounded-md bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-purple-700 shadow-sm ring-1 ring-purple-100">
          {row.grade}
        </span>
      </div>
      <div className="space-y-1 p-2.5">
        <p className="line-clamp-2 min-h-9 text-[13px] font-semibold leading-[1.1rem] text-slate-900">{row.productName}</p>
        <div className="flex items-center justify-between gap-1 text-xs font-medium text-slate-500">
          <span className="truncate">{row.primaryKeyword}</span>
          <span className="shrink-0 font-bold text-purple-600">{formatNumber(row.score)}점</span>
        </div>
        <p className="text-[15px] font-bold text-slate-900">{formatKRW(row.salePrice)}원</p>
      </div>
    </article>
  );
}

function recommendationRowKey(
  row: Pick<TodayRecommendationRow, 'productId' | 'itemId' | 'vendorItemId' | 'productName'>,
): string {
  return [row.productId, row.itemId, row.vendorItemId, row.productName].filter(Boolean).join(':');
}
