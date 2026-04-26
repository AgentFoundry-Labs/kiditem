'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, Star, RefreshCw } from 'lucide-react';
import { ReviewListResponseSchema } from '@kiditem/shared';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatNumber } from '@/lib/utils';
import { ReviewTable, type FilterTab } from './components/ReviewTable';

const PAGE_SIZE = 50;

export default function ReviewsPage() {
  const [page, setPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  const queryParams = { page: String(page), limit: String(PAGE_SIZE) };
  const { data, isLoading: loading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.reviews.list(queryParams),
    queryFn: () => {
      const params = new URLSearchParams(queryParams);
      return apiClient.getParsed(`/api/reviews?${params}`, ReviewListResponseSchema);
    },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const summary = data?.summary ?? {
    totalReviewCount: 0,
    weightedAvgRating: 0,
    needsAttentionCount: 0,
  };

  const filteredData = items.filter((d) => {
    if (activeFilter === 'new') return d.totalReviews < 5;
    if (activeFilter === 'needs-response') return d.avgRating < 3.5 && d.totalReviews >= 5;
    return true;
  });

  const filterTabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: '전체', count: items.length },
    { key: 'new', label: '신규', count: items.filter((d) => d.totalReviews < 5).length },
    {
      key: 'needs-response',
      label: '응답필요',
      count: items.filter((d) => d.avgRating < 3.5 && d.totalReviews >= 5).length,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-green-500" />
          리뷰 관리
        </h1>
        <button
          onClick={() => refetch()}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          새로고침
        </button>
      </div>

      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          리뷰 데이터를 불러오지 못했어요. {isApiError(error) ? error.detail : ''}
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        <div className="card">
          <div className="card-label">전체 상품 (listing)</div>
          <div className="card-value">{formatNumber(total)}개</div>
        </div>
        <div className="card">
          <div className="card-label">총 리뷰</div>
          <div className="card-value">{formatNumber(summary.totalReviewCount)}개</div>
        </div>
        <div className="card">
          <div className="card-label">평균 평점</div>
          <div className="card-value flex items-center gap-1">
            <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
            {summary.weightedAvgRating.toFixed(1)}
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-red-200 bg-red-50">
          <div className="text-sm text-red-600">리뷰 집중 필요</div>
          <div className="text-xl font-bold text-red-700">
            {formatNumber(summary.needsAttentionCount)}개
          </div>
          <div className="text-xs text-red-500 mt-0.5">
            평점 3.5 미만 또는 리뷰 5건 미만 listing
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveFilter(tab.key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
              activeFilter === tab.key
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {tab.label}
            <span
              className={cn(
                'px-1.5 py-0.5 rounded-full text-[10px] font-medium',
                activeFilter === tab.key
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-slate-100 text-slate-500',
              )}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      <ReviewTable
        filteredData={filteredData}
        loading={loading}
        activeFilter={activeFilter}
        page={page}
        total={total}
        PAGE_SIZE={PAGE_SIZE}
        onPageChange={setPage}
      />

      <p className="text-xs text-slate-400 px-1">
        주문 수 컬럼은 R3 범위에서 산출하지 않으며, listing × order line item 조인이 추가될 때 별도 PR 로 채웁니다 (현재는 모든 row 가 0).
      </p>
    </div>
  );
}
