'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LineChart, RefreshCw } from 'lucide-react';
import { queryKeys } from '@/lib/query-keys';
import BatchRankCheck from './BatchRankCheck';
import ProductKeywordRankOverview from './ProductKeywordRankOverview';

export default function RankTrackingPage() {
  const queryClient = useQueryClient();
  const invalidateRankData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.ads.keywordRank() });
  }, [queryClient]);

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LineChart size={20} className="text-purple-600" />
          <h1 className="page-title">쿠팡 순위추적</h1>
          <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
            Wing 판매량순 · 자사 상품 전체
          </span>
        </div>
        <div className="flex items-center gap-2">
          <BatchRankCheck onCompleted={invalidateRankData} />
          <button
            type="button"
            onClick={invalidateRankData}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw size={14} />
            새로고침
          </button>
        </div>
      </div>

      {/* 자사 상품 × 대표 키워드 현재 순위와 변동 */}
      <ProductKeywordRankOverview />
    </div>
  );
}
