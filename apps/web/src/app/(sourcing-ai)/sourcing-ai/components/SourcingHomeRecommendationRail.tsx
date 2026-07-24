'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ShoppingCart } from 'lucide-react';
import { formatKRW, formatNumber } from '@/lib/utils';
import { getTodaySourcingWorkspaceSnapshot } from '../lib/sourcing-workspace-snapshot-api';
import { useTodayRecommendationRows } from '../lib/use-today-recommendation-rows';
import { resolveCoupangCatalogImageUrl } from '../wing-catalog/lib/wing-catalog-extension';
import type { TodayRecommendationRow } from '../recommendations/lib/today-recommendations';

type TodayRecommendationSnapshotPayload = {
  result?: {
    rows?: TodayRecommendationRow[];
  };
};

/** 소싱 홈 · 오늘의 추천 실시간 후보 상품 — 한 줄 가로 스크롤 컴팩트 레일. */
export function SourcingHomeRecommendationRail() {
  const localRows = useTodayRecommendationRows();
  // 히어로와 동일한 쿼리 키를 재사용해 스냅샷 요청을 한 번만 보낸다(실시간 폴링 포함).
  const { data: snapshotRows = [] } = useQuery({
    queryKey: ['sourcing', 'home', 'today-rec-snapshot'],
    queryFn: async () => {
      const { snapshot } =
        await getTodaySourcingWorkspaceSnapshot<TodayRecommendationSnapshotPayload>('today_recommendations');
      return snapshot?.payload?.result?.rows ?? [];
    },
    refetchInterval: 60_000,
  });

  const recommendationRows = useMemo(() => {
    const source = localRows.length > 0 ? localRows : snapshotRows;
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
  }, [localRows, snapshotRows]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-bold text-slate-900">오늘의 추천</h2>
          <span className="text-xs font-semibold text-slate-400">실시간 후보 상품</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-bold text-violet-700">
            {recommendationRows.length > 0 ? `${formatNumber(recommendationRows.length)}개` : '검증 대기'}
          </span>
          <Link
            href="/sourcing-ai/recommendations"
            className="inline-flex items-center gap-0.5 text-xs font-bold text-violet-600 hover:underline"
          >
            전체
            <ArrowRight size={12} />
          </Link>
        </div>
      </div>

      {recommendationRows.length > 0 ? (
        <div className="grid max-h-[30rem] grid-cols-4 gap-3 overflow-y-auto p-3 [scrollbar-width:thin] sm:grid-cols-6 xl:grid-cols-8">
          {recommendationRows.map((row) => (
            <RecommendationCard key={recommendationRowKey(row)} row={row} />
          ))}
        </div>
      ) : (
        <p className="m-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs font-semibold text-slate-400">
          오늘의 추천에서 Wing 검증을 실행하면 후보 상품이 레일로 표시됩니다.
        </p>
      )}
    </section>
  );
}

function RecommendationCard({ row }: { row: TodayRecommendationRow }) {
  const imageUrl = resolveCoupangCatalogImageUrl(row.imagePath);

  return (
    <article className="overflow-hidden rounded-xl border border-violet-100 bg-violet-50/60">
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-white">
        {imageUrl ? (
          <img src={imageUrl} alt={row.productName} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <ShoppingCart size={24} className="text-slate-300" />
        )}
        <span className="absolute left-1.5 top-1.5 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700 ring-1 ring-violet-100">
          {row.grade}
        </span>
      </div>
      <div className="space-y-1 p-2.5">
        <p className="line-clamp-2 min-h-9 text-[13px] font-bold leading-[1.1rem] text-slate-900">{row.productName}</p>
        <div className="flex items-center justify-between gap-1 text-xs font-semibold text-slate-500">
          <span className="truncate">{row.primaryKeyword}</span>
          <span className="shrink-0 font-extrabold text-violet-600">{formatNumber(row.score)}점</span>
        </div>
        <p className="text-[15px] font-extrabold text-slate-900">{formatKRW(row.salePrice)}원</p>
      </div>
    </article>
  );
}

function recommendationRowKey(
  row: Pick<TodayRecommendationRow, 'productId' | 'itemId' | 'vendorItemId' | 'productName'>,
): string {
  return [row.productId, row.itemId, row.vendorItemId, row.productName].filter(Boolean).join(':');
}
