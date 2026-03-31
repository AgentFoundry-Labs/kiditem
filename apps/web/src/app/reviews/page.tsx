'use client';

import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { useEffect, useState, useCallback } from 'react';
import { MessageSquare, Star, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Pagination } from '@/components/ui/Pagination';

interface ReviewProduct {
  productId: string;
  productName: string;
  sku: string;
  company: string;
  grade: string;
  totalReviews: number;
  avgRating: number;
  recentReviews: number;
  orderCount: number;
}

interface ReviewSummaryData {
  totalReviewCount: number;
  weightedAvgRating: number;
  needsAttentionCount: number;
}

type FilterTab = 'all' | 'new' | 'needs-response';

function getReviewStatus(d: ReviewProduct): string {
  if (d.totalReviews < 5) return 'insufficient';
  if (d.avgRating < 3.5) return 'low-rating';
  if (d.avgRating < 4.0) return 'average';
  return 'good';
}

export default function ReviewsPage() {
  const [data, setData] = useState<ReviewProduct[]>([]);
  const [summary, setSummary] = useState<ReviewSummaryData | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const PAGE_SIZE = 50;

  const fetchReviews = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        limit: String(PAGE_SIZE),
      });
      const json = await apiClient.get<{ items: ReviewProduct[]; total: number; summary?: ReviewSummaryData }>(`/api/reviews?${params}`);
      setData(json.items ?? []);
      setTotal(json.total ?? 0);
      if (json.summary) setSummary(json.summary);
    } catch (err) {
      console.error('리뷰 데이터 로딩 실패:', isApiError(err) ? err.detail : err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchReviews();
  }, [page, fetchReviews]);

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
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-green-500" />
          리뷰 관리
        </h1>
        <button
          onClick={() => fetchReviews(page)}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          새로고침
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="text-sm text-gray-500">전체 상품</div>
          <div className="text-xl font-bold text-gray-900">{total.toLocaleString()}개</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="text-sm text-gray-500">총 리뷰</div>
          <div className="text-xl font-bold text-gray-900">{totalReviews.toLocaleString()}개</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200">
          <div className="text-sm text-gray-500">평균 평점</div>
          <div className="text-xl font-bold text-gray-900 flex items-center gap-1">
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

      <div className="flex gap-1 border-b border-gray-200">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveFilter(tab.key); }}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2',
              activeFilter === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            {tab.label}
            <span className={cn(
              'px-1.5 py-0.5 rounded-full text-[10px] font-medium',
              activeFilter === tab.key
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-500'
            )}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="animate-pulse space-y-2 py-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-gray-100 rounded" />
          ))}
        </div>
      ) : filteredData.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
          {activeFilter === 'all' ? '리뷰 데이터가 없습니다.' : '해당 필터에 맞는 데이터가 없습니다.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr className="bg-gray-50">
                  <th>상품명</th>
                  <th>회사</th>
                  <th className="text-right">리뷰 수</th>
                  <th className="text-right">평균 평점</th>
                  <th className="text-right">최근 30일</th>
                  <th className="text-right">주문 수</th>
                  <th>리뷰 상태</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((d) => {
                  const status = getReviewStatus(d);
                  return (
                    <tr
                      key={d.productId}
                      className={
                        status === 'low-rating'
                          ? 'bg-red-50/30'
                          : status === 'insufficient'
                            ? 'bg-orange-50/30'
                            : ''
                      }
                    >
                      <td className="font-medium text-gray-900">{d.productName}</td>
                      <td className="text-gray-500 text-xs">{d.company}</td>
                      <td className="text-right tabular-nums">{d.totalReviews}</td>
                      <td className="text-right tabular-nums">
                        <span className="flex items-center justify-end gap-1">
                          <Star
                            size={12}
                            className={
                              d.avgRating >= 4
                                ? 'text-yellow-500 fill-yellow-500'
                                : d.avgRating >= 3
                                  ? 'text-orange-400 fill-orange-400'
                                  : 'text-red-400 fill-red-400'
                            }
                          />
                          {d.avgRating.toFixed(1)}
                        </span>
                      </td>
                      <td className="text-right tabular-nums">{d.recentReviews}</td>
                      <td className="text-right tabular-nums">{d.orderCount}</td>
                      <td>
                        {status === 'insufficient' && (
                          <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-800">
                            리뷰 부족
                          </span>
                        )}
                        {status === 'low-rating' && (
                          <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-800">
                            평점 낮음
                          </span>
                        )}
                        {status === 'average' && (
                          <span className="px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800">
                            보통
                          </span>
                        )}
                        {status === 'good' && (
                          <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-800">
                            양호
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {activeFilter === 'all' && (
            <Pagination page={page} limit={PAGE_SIZE} total={total} onPageChange={setPage} />
          )}
        </div>
      )}
    </div>
  );
}
