"use client";

import { useEffect, useState } from "react";
import { Package, AlertTriangle, Truck, Download } from "lucide-react";
import { formatKRW } from "@/lib/utils";
import { API_BASE } from "@/lib/api";

interface InventoryItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  company: string;
  grade: string;
  currentStock: number;
  safetyStock: number;
  reorderPoint: number;
  leadTimeDays: number;
  avgDailySales: number;
  optimalStock: number;
  daysRemaining: number;
  recommendedOrder: number;
  status: string; // normal, warning, critical, overstock
}

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetch(`${API_BASE}/api/inventory`)
      .then((r) => r.json())
      .then(setItems)
      .catch((err) => console.error("재고 데이터 로딩 실패:", err))
      .finally(() => setLoading(false));
  }, []);

  const filtered = items.filter((i) => {
    if (filter === "reorder") return i.status === "critical" || i.status === "warning";
    if (filter === "overstock") return i.status === "overstock";
    return true;
  });

  const needReorder = items.filter((i) => i.status === "critical" || i.status === "warning").length;
  const outOfStock = items.filter((i) => i.currentStock === 0).length;
  const overstock = items.filter((i) => i.status === "overstock").length;

  const handleExcel = () => {
    import("xlsx").then((XLSX) => {
      const ws = XLSX.utils.json_to_sheet(
        filtered.map((d) => ({
          등급: d.grade, 상품명: d.productName, SKU: d.sku, 회사: d.company,
          현재고: d.currentStock, 안전재고: d.safetyStock, 발주점: d.reorderPoint,
          "일평균판매": d.avgDailySales, 적정재고: d.optimalStock,
          "남은일수": d.daysRemaining, 추천발주량: d.recommendedOrder, 상태: d.status,
        }))
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "재고현황");
      XLSX.writeFile(wb, `재고현황_${new Date().toISOString().slice(0, 10)}.xlsx`);
    });
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-500">로딩 중...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">재고/발주 관리</h1>
        <button onClick={handleExcel} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
          <Download size={16} /> 엑셀 다운로드
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200 flex items-center gap-3">
          <Package size={20} className="text-blue-600" />
          <div><div className="text-sm text-slate-500">전체 상품</div><div className="text-xl font-bold">{items.length}개</div></div>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-200 flex items-center gap-3">
          <AlertTriangle size={20} className="text-red-600" />
          <div><div className="text-sm text-red-600">발주 필요</div><div className="text-xl font-bold text-red-700">{needReorder}개</div></div>
        </div>
        <div className="bg-orange-50 rounded-xl p-4 border border-orange-200 flex items-center gap-3">
          <Package size={20} className="text-orange-600" />
          <div><div className="text-sm text-orange-600">품절</div><div className="text-xl font-bold text-orange-700">{outOfStock}개</div></div>
        </div>
        <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200 flex items-center gap-3">
          <Truck size={20} className="text-yellow-600" />
          <div><div className="text-sm text-yellow-600">과재고</div><div className="text-xl font-bold text-yellow-700">{overstock}개</div></div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {[
          { key: "all", label: "전체" },
          { key: "reorder", label: `발주 필요 (${needReorder})` },
          { key: "overstock", label: `과재고 (${overstock})` },
        ].map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={`px-4 py-2 rounded-lg text-sm font-medium ${filter === f.key ? "bg-blue-600 text-white" : "bg-white border border-slate-200 hover:bg-slate-50"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
          재고 데이터가 없습니다.
        </div>
      ) : (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table>
          <thead>
            <tr className="bg-slate-50">
              <th>상품명</th>
              <th>SKU</th>
              <th>회사</th>
              <th className="text-right">현재고</th>
              <th className="text-right">적정재고</th>
              <th className="text-right">일평균판매</th>
              <th className="text-right">남은일수</th>
              <th className="text-right">추천발주량</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((i) => (
              <tr key={i.id} className={i.status === "critical" ? "bg-red-50/50" : i.status === "warning" ? "bg-orange-50/30" : ""}>
                <td className="font-medium text-slate-900">{i.productName}</td>
                <td className="text-slate-500 text-xs font-mono">{i.sku}</td>
                <td className="text-slate-500 text-xs">{i.company}</td>
                <td className={`text-right font-semibold ${i.currentStock === 0 ? "text-red-600" : i.currentStock <= i.reorderPoint ? "text-orange-600" : ""}`}>
                  {formatKRW(i.currentStock)}
                </td>
                <td className="text-right text-slate-500">{formatKRW(i.optimalStock)}</td>
                <td className="text-right">{i.avgDailySales}</td>
                <td className={`text-right font-semibold ${i.daysRemaining <= 7 ? "text-red-600" : i.daysRemaining <= 14 ? "text-orange-500" : ""}`}>
                  {i.daysRemaining}일
                </td>
                <td className="text-right font-semibold text-blue-600">
                  {i.recommendedOrder > 0 ? `${formatKRW(i.recommendedOrder)}개` : "-"}
                </td>
                <td>
                  <StatusBadge status={i.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 text-sm text-blue-800">
        다음 정기 재고 점검: <strong>2개월 주기</strong> | 적정재고 = 일평균판매량 x (리드타임 + 안전일수7일)
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    normal: "bg-green-100 text-green-800",
    warning: "bg-orange-100 text-orange-800",
    critical: "bg-red-100 text-red-800",
    overstock: "bg-yellow-100 text-yellow-800",
  };
  const labels: Record<string, string> = {
    normal: "정상",
    warning: "발주필요",
    critical: "긴급발주",
    overstock: "과재고",
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status]}`}>{labels[status]}</span>;
}
