'use client';
import type { ReviewListItem as ReviewProduct } from '@kiditem/shared';
import { Star } from 'lucide-react';
import { Pagination } from '@/components/ui/Pagination';
import { getGradeColor } from '@/lib/utils';

export type FilterTab = 'all' | 'new' | 'needs-response';

function getReviewStatus(d: ReviewProduct): string {
  if (d.totalReviews < 5) return 'insufficient';
  if (d.avgRating < 3.5) return 'low-rating';
  if (d.avgRating < 4.0) return 'average';
  return 'good';
}

interface Props {
  filteredData: ReviewProduct[];
  loading: boolean;
  activeFilter: FilterTab;
  page: number;
  total: number;
  PAGE_SIZE: number;
  onPageChange: (p: number) => void;
}

export function ReviewTable({ filteredData, loading, activeFilter, page, total, PAGE_SIZE, onPageChange }: Props) {
  if (loading) {
    return (
      <div className="animate-pulse space-y-2 py-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 bg-slate-100 rounded" />
        ))}
      </div>
    );
  }

  if (filteredData.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
        {activeFilter === 'all' ? '리뷰 데이터가 없습니다.' : '해당 필터에 맞는 데이터가 없습니다.'}
      </div>
    );
  }

  return (
    <div className="table-card">
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>등급</th>
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
                  <td>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${getGradeColor(d.grade)}`}>
                      {d.grade}
                    </span>
                  </td>
                  <td className="font-medium text-slate-900">{d.productName}</td>
                  <td className="text-slate-500 text-xs">{d.company}</td>
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
                      <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-800">리뷰 부족</span>
                    )}
                    {status === 'low-rating' && (
                      <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-800">평점 낮음</span>
                    )}
                    {status === 'average' && (
                      <span className="px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800">보통</span>
                    )}
                    {status === 'good' && (
                      <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-800">양호</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {activeFilter === 'all' && (
        <Pagination page={page} limit={PAGE_SIZE} total={total} onPageChange={onPageChange} />
      )}
    </div>
  );
}
