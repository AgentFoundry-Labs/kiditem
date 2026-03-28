"use client";
import { API_BASE } from "@/lib/api";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { formatKRW, formatPercent, getProfitColor } from "@/lib/utils";

interface Product {
  id: string; name: string; sku: string; company: string; abcGrade: string;
  adTier: string | null; revenue: number; netProfit: number; profitRate: number;
  adRate: number; currentStock: number; reviewCount: number; thumbnailCTR: number;
  sellPrice: number; costPrice: number;
}

export default function CoreProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/products?grade=A`)
      .then((r) => r.json())
      .then((data) => setProducts(data.items ?? data))
      .catch((err) => console.error("핵심상품 데이터 로딩 실패:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-500">로딩 중...</div>;

  const totalRevenue = products.reduce((s, p) => s + p.revenue, 0);
  const totalProfit = products.reduce((s, p) => s + p.netProfit, 0);
  const totalAdSpend = products.reduce((s, p) => s + (p.adRate > 0 ? p.revenue * (p.adRate / 100) : 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">
          <Star size={24} className="inline mr-2 text-yellow-500" />
          핵심상품 관리 (A등급 {products.length}개)
        </h1>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
          <div className="text-sm text-blue-600">A등급 총 매출</div>
          <div className="text-2xl font-bold text-blue-800 mt-1">{formatKRW(totalRevenue)}원</div>
        </div>
        <div className="bg-green-50 rounded-xl p-5 border border-green-200">
          <div className="text-sm text-green-600">A등급 총 순이익</div>
          <div className="text-2xl font-bold text-green-800 mt-1">{formatKRW(totalProfit)}원</div>
        </div>
        <div className="bg-purple-50 rounded-xl p-5 border border-purple-200">
          <div className="text-sm text-purple-600">A등급 총 광고비 (추정)</div>
          <div className="text-2xl font-bold text-purple-800 mt-1">
            {formatKRW(Math.round(totalAdSpend))}원
          </div>
        </div>
      </div>

      {/* Product Cards */}
      {products.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          A등급 상품이 없습니다.
        </div>
      ) : (
      <div className="grid grid-cols-2 gap-4">
        {products.map((p) => (
          <div key={p.id} className="bg-white rounded-xl p-5 border border-slate-200 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-slate-900">{p.name}</h3>
                <span className="text-xs text-slate-500">{p.sku} | {p.company}</span>
              </div>
              {p.adTier && (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">{p.adTier}</span>
              )}
            </div>

            <div className="grid grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-slate-500 text-xs">매출</div>
                <div className="font-semibold">{formatKRW(p.revenue)}</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs">순이익</div>
                <div className={`font-semibold ${getProfitColor(p.profitRate)}`}>{formatKRW(p.netProfit)}</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs">이익률</div>
                <div className={`font-semibold ${getProfitColor(p.profitRate)}`}>{formatPercent(p.profitRate)}</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs">광고비율</div>
                <div className={`font-semibold ${p.adRate > 15 ? "text-red-600" : "text-slate-700"}`}>
                  {p.adRate > 0 ? formatPercent(p.adRate) : "-"}
                </div>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-4 text-xs text-slate-500">
              <span>재고: <strong className={p.currentStock < 20 ? "text-red-600" : "text-slate-700"}>{p.currentStock}개</strong></span>
              <span>리뷰: <strong>{p.reviewCount}개</strong></span>
              <span>CTR: <strong>{p.thumbnailCTR}%</strong></span>
              <span>판매가: {formatKRW(p.sellPrice)}원</span>
            </div>

            {/* Strategy Checklist */}
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="text-xs text-slate-500 mb-1">전략 체크</div>
              <div className="flex gap-2 flex-wrap">
                <CheckItem label="가격 경쟁력" checked={p.sellPrice > 0} />
                <CheckItem label="묶음/세트" checked={false} />
                <CheckItem label="썸네일" checked={p.thumbnailCTR > 2} />
                <CheckItem label="리뷰 관리" checked={p.reviewCount > 10} />
                <CheckItem label="광고 효율" checked={p.adRate <= 15} />
              </div>
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

function CheckItem({ label, checked }: { label: string; checked: boolean }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs ${checked ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
      {checked ? "\u2713" : "\u2717"} {label}
    </span>
  );
}
