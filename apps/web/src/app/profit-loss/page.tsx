"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";
import { isApiError } from "@/lib/api-error";
import { queryKeys } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";
import PageSkeleton from "@/components/ui/PageSkeleton";
import type { PLData, SyncInfo } from '@kiditem/shared';
import ProfitLossSummaryCards from "./components/ProfitLossSummaryCards";
import ProfitLossTable from "./components/ProfitLossTable";

export default function ProfitLossPage() {
  // 동적 기간 생성 (최근 6개월)
  const getRecentPeriods = () => {
    const periods = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
      periods.push({ value: val, label });
    }
    return periods;
  };
  const periodOptions = getRecentPeriods();
  const [period, setPeriod] = useState(periodOptions[0].value);
  const [filter, setFilter] = useState("all");

  const { data: syncInfo } = useQuery({
    queryKey: queryKeys.syncInfo(),
    queryFn: async () => {
      try {
        const data = await apiClient.get<{ lastSyncedAt: string | null }>('/api/coupang-dashboard');
        return { lastSyncedAt: data.lastSyncedAt } as SyncInfo;
      } catch {
        return { lastSyncedAt: null } as SyncInfo;
      }
    },
  });

  const { data = [], isLoading: loading, error: queryError } = useQuery({
    queryKey: queryKeys.profitLoss.list(period),
    queryFn: async () => {
      const d = await apiClient.get<PLData[]>(`/api/profit-loss?period=${period}`);
      if (!Array.isArray(d)) throw new Error("데이터 형식 오류");
      return d;
    },
  });
  const error = queryError ? (isApiError(queryError) ? queryError.detail : queryError instanceof Error ? queryError.message : "조회 실패") : null;

  const filtered = data.filter((d) => {
    if (filter === "minus") return d.profitRate < 0;
    if (filter === "low") return d.profitRate >= 0 && d.profitRate <= 3;
    if (filter === "normal") return d.profitRate > 3;
    return true;
  });

  const totalRevenue = filtered.reduce((s, d) => s + d.revenue, 0);
  const totalProfit = filtered.reduce((s, d) => s + d.netProfit, 0);
  const totalAdCost = filtered.reduce((s, d) => s + d.adCost, 0);
  const overallRate = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  const handleExcel = () => {
    import("xlsx").then((XLSX) => {
      const ws = XLSX.utils.json_to_sheet(
        filtered.map((d) => ({
          등급: d.grade, 상품명: d.productName, SKU: d.sku, 회사: d.company,
          매출: d.revenue, 매입원가: d.costOfGoods, 수수료: d.commission,
          배송비: d.shippingCost, 광고비: d.adCost, 기타비용: d.otherCost,
          순이익: d.netProfit, "이익률(%)": d.profitRate, 주문수: d.orderCount,
        }))
      );
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "손익표");
      XLSX.writeFile(wb, `손익표_${period}.xlsx`);
    });
  };

  if (loading) return <PageSkeleton variant="table" />;
  if (error) return <div className="flex items-center justify-center h-64 text-red-500">{error}</div>;
  if (data.length === 0) return <div className="flex items-center justify-center h-64 text-slate-400">해당 기간 데이터가 없습니다.</div>;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">상품별 손익표</h1>
          <div className="flex gap-2">
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
              {periodOptions.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <button onClick={handleExcel} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
              <Download size={16} /> 엑셀 다운로드
            </button>
          </div>
        </div>
        {syncInfo && (
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-2">
            <div className={`w-1.5 h-1.5 rounded-full ${syncInfo.lastSyncedAt ? 'bg-green-400' : 'bg-amber-400'}`} />
            {syncInfo.lastSyncedAt 
              ? `최근 동기화: ${timeAgo(syncInfo.lastSyncedAt)}`
              : '동기화 기록 없음 — 설정에서 동기화를 실행하세요'}
          </div>
        )}
      </div>

      <ProfitLossSummaryCards
        totalRevenue={totalRevenue}
        totalProfit={totalProfit}
        totalAdCost={totalAdCost}
        overallRate={overallRate}
      />

      <ProfitLossTable data={data} filtered={filtered} filter={filter} onFilter={setFilter} />
    </div>
  );
}
