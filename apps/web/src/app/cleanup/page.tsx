"use client";
import { API_BASE } from "@/lib/api";

import { useEffect, useState, useCallback } from "react";
import { Trash2, AlertTriangle, MinusCircle } from "lucide-react";
import { formatKRW, formatPercent, getProfitColor, getGradeColor } from "@/lib/utils";
import { Pagination } from "@/components/ui/Pagination";

interface Product {
  id: string; name: string; sku: string; company: string; abcGrade: string;
  revenue: number; netProfit: number; profitRate: number; adRate: number;
  costPrice: number; sellPrice: number; commissionRate: number; shippingCost: number;
  status?: string;
}

export default function CleanupPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const fetchProducts = useCallback(async (p = page) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        maxProfitRate: "3",
        page: String(p),
        limit: String(PAGE_SIZE),
      });
      const res = await fetch(`${API_BASE}/api/products?${params}`);
      const data = await res.json();
      // Filter out sourcing products (draft/processing status)
      const filtered = (data.items || []).filter((p: Product) => p.status !== 'draft' && p.status !== 'processing');
      setProducts(filtered);
      setTotal(filtered.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "정리 대상 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchProducts(1);
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [page]);

  const minusCount = products.filter((p) => p.profitRate < 0).length;
  const lowCount = products.filter((p) => p.profitRate >= 0).length;

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-500">로딩 중...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">
          <Trash2 size={24} className="inline mr-2 text-red-500" />
          정리 대상 (순이익 3% 이하)
        </h1>
      </div>

      {error && <div className="text-center py-8 text-red-500">{error}</div>}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-red-50 rounded-xl p-5 border border-red-200">
          <div className="flex items-center gap-2 text-red-600"><MinusCircle size={18} /> 적자 상품</div>
          <div className="text-3xl font-bold text-red-700 mt-2">{minusCount}개</div>
          <div className="text-xs text-red-500 mt-1">즉시 아웃 검토 필요</div>
        </div>
        <div className="bg-orange-50 rounded-xl p-5 border border-orange-200">
          <div className="flex items-center gap-2 text-orange-600"><AlertTriangle size={18} /> 순이익 0~3%</div>
          <div className="text-3xl font-bold text-orange-700 mt-2">{lowCount}개</div>
          <div className="text-xs text-orange-500 mt-1">개선 또는 정리 판단 필요</div>
        </div>
        <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
          <div className="text-slate-600">전체 정리 대상</div>
          <div className="text-3xl font-bold text-slate-900 mt-2">{total}개</div>
        </div>
      </div>

      {/* Cleanup Flow */}
      <div className="bg-white rounded-xl p-5 border border-slate-200">
        <h3 className="font-semibold text-sm text-slate-700 mb-3">정리 판단 플로우</h3>
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span className="px-3 py-1.5 bg-red-100 text-red-800 rounded-lg font-medium">순이익 3% 이하 감지</span>
          <span>&rarr;</span>
          <span className="px-3 py-1.5 bg-orange-100 text-orange-800 rounded-lg font-medium">원인 분석 (광고? 가격? 수수료?)</span>
          <span>&rarr;</span>
          <span className="px-3 py-1.5 bg-blue-100 text-blue-800 rounded-lg font-medium">판단 (개선 / 정리)</span>
          <span>&rarr;</span>
          <span className="px-3 py-1.5 bg-green-100 text-green-800 rounded-lg font-medium">처리</span>
        </div>
      </div>

      {/* Table */}
      {products.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          정리 대상 상품이 없습니다.
        </div>
      ) : (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
        <table>
          <thead>
            <tr className="bg-slate-50">
              <th>등급</th>
              <th>상품명</th>
              <th>회사</th>
              <th className="text-right">판매가</th>
              <th className="text-right">매입가</th>
              <th className="text-right">매출</th>
              <th className="text-right">순이익</th>
              <th className="text-right">이익률</th>
              <th className="text-right">광고비율</th>
              <th>원인 추정</th>
              <th>권장 액션</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const margin = p.sellPrice > 0 ? ((p.sellPrice - p.costPrice) / p.sellPrice) * 100 : 0;
              let cause = "복합";
              let action = "검토 필요";
              if (p.adRate > 15) { cause = "광고비 과다"; action = "광고 조정"; }
              else if (margin < 30) { cause = "마진 부족"; action = "가격/소싱 재검토"; }
              else if (p.commissionRate > 10) { cause = "수수료 높음"; action = "카테고리 확인"; }
              if (p.profitRate < -5) { action = "즉시 정리(아웃)"; }

              return (
                <tr key={p.id} className={p.sellPrice === 0 && p.revenue === 0 ? "bg-amber-50/30" : p.profitRate < 0 ? "bg-red-50/60" : "bg-orange-50/30"}>
                  <td>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${getGradeColor(p.abcGrade)}`}>{p.abcGrade}</span>
                    {p.sellPrice === 0 && p.revenue === 0 && (
                      <span className="ml-1 px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-700">데이터 불완전</span>
                    )}
                  </td>
                  <td className="font-medium text-slate-900">{p.name}</td>
                  <td className="text-slate-500 text-xs">{p.company}</td>
                  <td className="text-right">{formatKRW(p.sellPrice)}</td>
                  <td className="text-right text-slate-500">{formatKRW(p.costPrice)}</td>
                  <td className="text-right">{formatKRW(p.revenue)}</td>
                  <td className={`text-right font-semibold ${getProfitColor(p.profitRate)}`}>{formatKRW(p.netProfit)}</td>
                  <td className={`text-right font-semibold ${getProfitColor(p.profitRate)}`}>{formatPercent(p.profitRate)}</td>
                  <td className={`text-right ${p.adRate > 15 ? "text-red-600 font-semibold" : ""}`}>{p.adRate > 0 ? formatPercent(p.adRate) : "-"}</td>
                  <td><span className="text-xs text-slate-600">{cause}</span></td>
                  <td><span className={`px-2 py-0.5 rounded text-xs font-medium ${p.profitRate < -5 ? "bg-red-100 text-red-800" : "bg-orange-100 text-orange-800"}`}>{action}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        <Pagination page={page} limit={PAGE_SIZE} total={total} onPageChange={setPage} />
      </div>
      )}
    </div>
  );
}
