"use client";
import { API_BASE } from "@/lib/api";

import { useEffect, useState } from "react";
import { ImageIcon, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";

interface ThumbnailItem {
  id: string; productId: string; productName: string; sku: string;
  company: string; grade: string; imageUrl: string; clickRate: number;
  prevClickRate: number; status: string; strategy: string;
  changePercent: number;
}

export default function ThumbnailsPage() {
  const [items, setItems] = useState<ThumbnailItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetch(`${API_BASE}/api/thumbnails`)
      .then((r) => r.json())
      .then(setItems)
      .catch((err) => console.error("썸네일 데이터 로딩 실패:", err))
      .finally(() => setLoading(false));
  }, []);

  const warnings = items.filter((i) => i.status === "warning" || i.status === "critical");
  const filtered = filter === "warning" ? warnings : items;

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-500">로딩 중...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">
          <ImageIcon size={24} className="inline mr-2 text-purple-500" />
          썸네일 관리
        </h1>
        <span className="text-sm text-slate-500">클릭률(CTR) 전주 대비 20% 이상 하락 시 자동 알림</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <div className="text-sm text-slate-500">전체 상품</div>
          <div className="text-xl font-bold">{items.length}개</div>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-200">
          <div className="flex items-center gap-1 text-sm text-red-600"><AlertTriangle size={14} /> 점검 필요</div>
          <div className="text-xl font-bold text-red-700">{warnings.length}개</div>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-200">
          <div className="text-sm text-green-600">정상</div>
          <div className="text-xl font-bold text-green-700">{items.length - warnings.length}개</div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        <button onClick={() => setFilter("all")} className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === "all" ? "bg-blue-600 text-white" : "bg-white border hover:bg-slate-50"}`}>전체</button>
        <button onClick={() => setFilter("warning")} className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === "warning" ? "bg-red-600 text-white" : "bg-white border hover:bg-slate-50 text-red-600"}`}>점검 필요 ({warnings.length})</button>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          썸네일 데이터가 없습니다.
        </div>
      ) : (
      <div className="grid grid-cols-4 gap-4">
        {filtered.map((item) => (
          <div key={item.id} className={`bg-white rounded-xl border overflow-hidden hover:shadow-md transition-shadow ${item.status === "warning" ? "border-orange-300" : item.status === "critical" ? "border-red-300" : "border-slate-200"}`}>
            <div className="h-40 bg-slate-100 flex items-center justify-center">
              {item.imageUrl && item.imageUrl.startsWith("http") ? (
                <img src={item.imageUrl} alt={item.productName} className="h-full w-full object-cover" />
              ) : (
                <ImageIcon size={48} className="text-slate-300" />
              )}
            </div>
            <div className="p-4">
              <h3 className="font-medium text-sm text-slate-900 truncate">{item.productName}</h3>
              <span className="text-xs text-slate-500">{item.sku} | {item.company}</span>

              <div className="mt-3 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500">CTR</div>
                  <div className="text-lg font-bold text-slate-900">{item.clickRate}%</div>
                </div>
                <div className={`flex items-center gap-1 text-sm font-semibold ${item.changePercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {item.changePercent >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                  {item.changePercent >= 0 ? "+" : ""}{item.changePercent.toFixed(1)}%
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between text-xs">
                <span className={`px-2 py-0.5 rounded font-medium ${item.strategy === "premium" ? "bg-purple-100 text-purple-800" : "bg-slate-100 text-slate-600"}`}>
                  {item.strategy === "premium" ? "프리미엄" : "표준"}
                </span>
                <span className={`px-2 py-0.5 rounded font-medium ${item.status === "normal" ? "bg-green-100 text-green-800" : item.status === "warning" ? "bg-orange-100 text-orange-800" : "bg-red-100 text-red-800"}`}>
                  {item.status === "normal" ? "정상" : item.status === "warning" ? "점검필요" : "심각"}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
