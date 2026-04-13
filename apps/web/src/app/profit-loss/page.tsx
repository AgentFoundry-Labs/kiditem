'use client';

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { usePeriodSelector } from '@/hooks/usePeriodSelector';
import PeriodSelector from '@/components/ui/PeriodSelector';
import { cn, timeAgo } from "@/lib/utils";
import { apiClient } from "@/lib/api-client";
import { isApiError } from "@/lib/api-error";
import { queryKeys } from "@/lib/query-keys";
import PageSkeleton from "@/components/ui/PageSkeleton";
import ProfitLossSummaryCards from "./components/ProfitLossSummaryCards";
import ProfitLossTable from "./components/ProfitLossTable";
import type { PLData, SyncInfo } from '@kiditem/shared';
import type { SortField } from "./components/ProfitLossTable";

export default function ProfitLossPage() {
  const { period, setPeriod, periodOptions } = usePeriodSelector({ months: 6, defaultTo: 'prev' });
  const [filter, setFilter] = useState("all");
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);

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

  const filtered = useMemo(() => data.filter((d) => {
    const matchesProfitFilter =
      filter === "minus" ? d.profitRate < 0
        : filter === "low" ? d.profitRate >= 0 && d.profitRate <= 3
          : filter === "normal" ? d.profitRate > 3
            : true;
    const matchesGrade =
      selectedGrades.length === 0 || selectedGrades.includes((d.grade || "").toUpperCase());
    return matchesProfitFilter && matchesGrade;
  }), [data, filter, selectedGrades]);

  const sorted = useMemo(() => {
    if (!sortField || !sortDirection) return filtered;
    return [...filtered].sort((a, b) => {
      const left = a[sortField];
      const right = b[sortField];
      if (left === right) return 0;
      return sortDirection === 'asc' ? (left > right ? 1 : -1) : (left < right ? 1 : -1);
    });
  }, [filtered, sortField, sortDirection]);

  const toggleSort = (field: SortField) => {
    if (sortField !== field) { setSortField(field); setSortDirection('desc'); return; }
    if (sortDirection === 'desc') { setSortDirection('asc'); return; }
    setSortField(null); setSortDirection(null);
  };

  const toggleGrade = (grade: string) => {
    setSelectedGrades((prev) =>
      prev.includes(grade) ? prev.filter((g) => g !== grade) : [...prev, grade]
    );
  };

  const totalRevenue = sorted.reduce((s, d) => s + d.revenue, 0);
  const totalProfit = sorted.reduce((s, d) => s + d.netProfit, 0);
  const totalAdCost = sorted.reduce((s, d) => s + d.adCost, 0);
  const overallRate = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  const handleExcel = () => {
    import("xlsx").then((XLSX) => {
      const ws = XLSX.utils.json_to_sheet(
        sorted.map((d) => ({
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

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between">
          <h1 className="page-title">상품별 손익표</h1>
          <div className="flex gap-2">
            <PeriodSelector value={period} onChange={setPeriod} options={periodOptions} />
            <button onClick={handleExcel} disabled={data.length === 0} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 text-sm font-medium">
              <Download size={16} /> 엑셀 다운로드
            </button>
          </div>
        </div>
        {syncInfo && (
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-2">
            <div className={cn('w-1.5 h-1.5 rounded-full', syncInfo.lastSyncedAt ? 'bg-green-400' : 'bg-amber-400')} />
            {syncInfo.lastSyncedAt 
              ? `최근 동기화: ${timeAgo(syncInfo.lastSyncedAt)}`
              : '동기화 기록 없음 — 설정에서 동기화를 실행하세요'}
          </div>
        )}
      </div>

      {loading ? (
        <PageSkeleton variant="table" />
      ) : error ? (
        <div className="flex items-center justify-center h-64 text-red-500">{error}</div>
      ) : (
        <>
          <ProfitLossSummaryCards
            totalRevenue={totalRevenue}
            totalProfit={totalProfit}
            totalAdCost={totalAdCost}
            overallRate={overallRate}
          />
          <ProfitLossTable
            data={data}
            filtered={sorted}
            filter={filter}
            onFilter={setFilter}
            selectedGrades={selectedGrades}
            onToggleGrade={toggleGrade}
            onResetGrades={() => setSelectedGrades([])}
            sortField={sortField}
            sortDirection={sortDirection}
            onToggleSort={toggleSort}
          />
        </>
      )}
    </div>
  );
}
