"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { formatKRW, formatPercent, getGradeColor, getProfitColor, timeAgo } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";
import { isApiError } from "@/lib/api-error";
import { queryKeys } from "@/lib/query-keys";
import { useQuery } from "@tanstack/react-query";
import PageSkeleton from "@/components/ui/PageSkeleton";
import type { PLData, SyncInfo } from '@kiditem/shared';

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

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <div className="text-sm text-slate-500">총 매출</div>
          <div className="text-xl font-bold text-slate-900 mt-1">{formatKRW(totalRevenue)}원</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <div className="text-sm text-slate-500">총 순이익</div>
          <div className={`text-xl font-bold mt-1 ${getProfitColor(overallRate)}`}>{formatKRW(totalProfit)}원</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <div className="text-sm text-slate-500">평균 이익률</div>
          <div className={`text-xl font-bold mt-1 ${getProfitColor(overallRate)}`}>{formatPercent(overallRate)}</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200">
          <div className="text-sm text-slate-500">총 광고비</div>
          <div className="text-xl font-bold text-orange-600 mt-1">{formatKRW(totalAdCost)}원</div>
          <div className="text-xs text-slate-400">{totalRevenue > 0 ? formatPercent((totalAdCost / totalRevenue) * 100) : "0%"} of 매출</div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {[
          { key: "all", label: `전체 (${data.length})` },
          { key: "minus", label: `적자 (${data.filter(d => d.profitRate < 0).length})`, color: "text-red-600" },
          { key: "low", label: `3%이하 (${data.filter(d => d.profitRate >= 0 && d.profitRate <= 3).length})`, color: "text-orange-600" },
          { key: "normal", label: `정상 (${data.filter(d => d.profitRate > 3).length})`, color: "text-green-600" },
        ].map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${filter === f.key ? "bg-blue-600 text-white" : `bg-white border border-slate-200 hover:bg-slate-50 ${f.color || "text-slate-700"}`}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr className="bg-slate-50">
                <th>등급</th>
                <th>상품명</th>
                <th>회사</th>
                <th className="text-right">매출</th>
                <th className="text-right">매입원가</th>
                <th className="text-right">수수료</th>
                <th className="text-right">배송비</th>
                <th className="text-right">광고비</th>
                <th className="text-right">순이익</th>
                <th className="text-right">이익률</th>
                <th className="text-right">주문수</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className={d.profitRate < 0 ? "bg-red-50/50" : d.profitRate <= 3 ? "bg-orange-50/30" : ""}>
                  <td><span className={`px-2 py-0.5 rounded text-xs font-bold ${getGradeColor(d.grade)}`}>{d.grade}</span></td>
                  <td className="font-medium text-slate-900">{d.productName}</td>
                  <td className="text-slate-500 text-xs">{d.company}</td>
                  <td className="text-right">{formatKRW(d.revenue)}</td>
                  <td className="text-right text-slate-500">{formatKRW(d.costOfGoods)}</td>
                  <td className="text-right text-slate-500">{formatKRW(d.commission)}</td>
                  <td className="text-right text-slate-500">{formatKRW(d.shippingCost)}</td>
                  <td className="text-right text-orange-600">{formatKRW(d.adCost)}</td>
                  <td className={`text-right font-semibold ${getProfitColor(d.profitRate)}`}>{formatKRW(d.netProfit)}</td>
                  <td className={`text-right font-semibold ${getProfitColor(d.profitRate)}`}>{formatPercent(d.profitRate)}</td>
                  <td className="text-right text-slate-600">{d.orderCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
