"use client";
import { API_BASE } from "@/lib/api";

import { useEffect, useState, useCallback } from "react";
import { MessageSquare, Star } from "lucide-react";
import { formatKRW } from "@/lib/utils";
import { Pagination } from "@/components/ui/Pagination";

interface ReviewSummary {
  productId: string; productName: string; sku: string; company: string;
  grade: string; totalReviews: number; avgRating: number;
  recentReviews: number; orderCount: number;
}

export default function ReviewsPage() {
  const [data, setData] = useState<ReviewSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const fetchReviews = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        limit: String(PAGE_SIZE),
      });
      const res = await fetch(`${API_BASE}/api/reviews?${params}`);
      const json = await res.json();
      setData(json.items);
      setTotal(json.total);
    } catch (err) {
      console.error("리뷰 데이터 로딩 실패:", err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchReviews();
  }, [page]);

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-500">로딩 중...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">
        <MessageSquare size={24} className="inline mr-2 text-green-500" />
        리뷰 관리
      </h1>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <div className="text-sm text-slate-500">전체 상품</div>
          <div className="text-xl font-bold">{total}개</div>
        </div>
        <div className="bg-orange-50 rounded-xl p-4 border border-orange-200">
          <div className="text-sm text-orange-600">리뷰 집중 필요</div>
          <div className="text-xl font-bold text-orange-700">
            {data.filter((d) => d.totalReviews < 10 || d.avgRating < 4).length}개
          </div>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          리뷰 데이터가 없습니다.
        </div>
      ) : (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
        <table>
          <thead>
            <tr className="bg-slate-50">
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
            {data.map((d) => (
              <tr key={d.productId} className={d.avgRating < 3.5 ? "bg-red-50/30" : d.totalReviews < 5 ? "bg-orange-50/30" : ""}>
                <td className="font-medium text-slate-900">{d.productName}</td>
                <td className="text-slate-500 text-xs">{d.company}</td>
                <td className="text-right">{d.totalReviews}</td>
                <td className="text-right">
                  <span className="flex items-center justify-end gap-1">
                    <Star size={12} className={`${d.avgRating >= 4 ? "text-yellow-500 fill-yellow-500" : d.avgRating >= 3 ? "text-orange-400 fill-orange-400" : "text-red-400 fill-red-400"}`} />
                    {d.avgRating.toFixed(1)}
                  </span>
                </td>
                <td className="text-right">{d.recentReviews}</td>
                <td className="text-right">{d.orderCount}</td>
                <td>
                  {d.totalReviews < 5 && <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-800">리뷰 부족</span>}
                  {d.avgRating < 3.5 && d.totalReviews >= 5 && <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-800">평점 낮음</span>}
                  {d.totalReviews >= 5 && d.avgRating >= 3.5 && d.avgRating < 4.0 && <span className="px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800">보통</span>}
                  {d.totalReviews >= 5 && d.avgRating >= 4.0 && <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-800">양호</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <Pagination page={page} limit={PAGE_SIZE} total={total} onPageChange={setPage} />
      </div>
      )}
    </div>
  );
}
