'use client';

import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useQuery } from '@tanstack/react-query';
import type { ReviewListItem as ReviewProduct } from '@kiditem/shared';
import { useState } from 'react';
import { MessageSquare, Star, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ReviewTable, type FilterTab } from './components/ReviewTable';

interface ReviewSummaryData {
  totalReviewCount: number;
  weightedAvgRating: number;
  needsAttentionCount: number;
}

export default function ReviewsPage() {
  const [page, setPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const PAGE_SIZE = 50;

  const { data: reviewData, isLoading: loading, refetch } = useQuery({
    queryKey: queryKeys.reviews.list({ page: String(page), limit: String(PAGE_SIZE) }),
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      return apiClient.get<{ items: ReviewProduct[]; total: number; summary?: ReviewSummaryData }>(`/api/reviews?${params}`);
    },
  });

  const data = reviewData?.items ?? [];
  const total = reviewData?.total ?? 0;
  const summary = reviewData?.summary ?? null;

  const filteredData = data.filter((d) => {
    if (activeFilter === 'new') return d.totalReviews < 5;
    if (activeFilter === 'needs-response') return d.avgRating < 3.5 && d.totalReviews >= 5;
    return true;
  });

  const totalReviews = summary?.totalReviewCount ?? 0;
  const avgRating = summary?.weightedAvgRating ?? 0;
  const needsAttention = summary?.needsAttentionCount ?? 0;

  const filterTabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: '전체', count: data.length },
    { key: 'new', label: '신규', count: data.filter((d) => d.totalReviews < 5).length },
    { key: 'needs-response', label: '응답필요', count: data.filter((d) => d.avgRating < 3.5 && d.totalReviews >= 5).length },
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

      <div className="grid grid-cols-4 gap-4">
        <div className="card">
          <div className="card-label">전체 상품</div>
          <div className="card-value">{total.toLocaleString()}개</div>
        </div>
        <div className="card">
          <div className="card-label">총 리뷰</div>
          <div className="card-value">{totalReviews.toLocaleString()}개</div>
        </div>
        <div className="card">
          <div className="card-label">평균 평점</div>
          <div className="card-value flex items-center gap-1">
            <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
            {avgRating.toFixed(1)}
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-red-200 bg-red-50">
          <div className="text-sm text-red-600">리뷰 집중 필요</div>
          <div className="text-xl font-bold text-red-700">{needsAttention.toLocaleString()}개</div>
          <div className="text-xs text-red-500 mt-0.5">리뷰 5건 미만 또는 평점 3.0 미만</div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveFilter(tab.key); }}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
              activeFilter === tab.key
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            {tab.label}
            <span className={cn(
              'px-1.5 py-0.5 rounded-full text-[10px] font-medium',
              activeFilter === tab.key
                ? 'bg-blue-100 text-blue-700'
                : 'bg-slate-100 text-slate-500'
            )}>
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
    </div>
  );
}
