'use client';

import { useState } from 'react';
import { format, subDays } from 'date-fns';
import { type DateRange } from 'react-day-picker';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useQuery } from '@tanstack/react-query';
import { formatKRW, cn } from '@/lib/utils';
import { KpiBar } from '@/components/ui/KpiBar';
import { RevenueTrendChart } from '@/components/ui/RevenueTrendChart';
import type { TrendRow } from '@/components/ui/RevenueTrendChart';
import { DateRangePicker } from '@/components/ui/DateRangePicker';

function toParam(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

function getPreset(days: number): DateRange {
  const to = new Date();
  const from = subDays(to, days);
  return { from, to };
}

interface KpiData {
  todayOrders: { count: number; revenue: number };
  pendingAccept: number;
  pendingReturns: number;
}

interface RankingRow {
  sellerProductId: string;
  sellerProductName: string;
  revenue: number;
  orderCount: number;
}

export default function CoupangOrdersPage() {
  const [dateRange, setDateRange] = useState<DateRange>(getPreset(30));
  const [activePreset, setActivePreset] = useState<number>(30);

  const from = dateRange.from ? toParam(dateRange.from) : '';
  const to = dateRange.to ? toParam(dateRange.to) : '';

  const { data: kpis } = useQuery({
    queryKey: queryKeys.coupangDashboard.kpis(),
    queryFn: () => apiClient.get<KpiData>('/api/coupang-dashboard'),
  });

  const { data: trend = [], isLoading: loading } = useQuery({
    queryKey: queryKeys.coupangDashboard.trend({ from, to }),
    queryFn: () => apiClient.get<TrendRow[]>(`/api/coupang-dashboard/trend?from=${from}&to=${to}`),
    enabled: !!from && !!to,
  });

  const { data: ranking = [] } = useQuery({
    queryKey: queryKeys.coupangDashboard.ranking({ from, to }),
    queryFn: () => apiClient.get<RankingRow[]>(`/api/coupang-dashboard/ranking?from=${from}&to=${to}`),
    enabled: !!from && !!to,
  });

  function handlePreset(days: number) {
    setActivePreset(days);
    setDateRange(getPreset(days));
  }

  function handleCustomRange(range: DateRange | undefined) {
    if (range) {
      setActivePreset(0);
      setDateRange(range);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header with date filter */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">주문 대시보드</h1>
        <div className="flex items-center gap-2">
          {[
            { label: '7일', days: 7 },
            { label: '30일', days: 30 },
            { label: '90일', days: 90 },
          ].map((p) => (
            <button
              key={p.days}
              onClick={() => handlePreset(p.days)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-lg border',
                activePreset === p.days
                  ? 'bg-blue-50 text-blue-600 border-blue-200'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              )}
            >
              {p.label}
            </button>
          ))}
          <DateRangePicker value={dateRange} onChange={handleCustomRange} />
        </div>
      </div>

      {/* KPI bar (ORD-01) */}
      {kpis && (
        <KpiBar
          todayOrderCount={kpis.todayOrders.count}
          todayRevenue={kpis.todayOrders.revenue}
          pendingConfirmCount={kpis.pendingAccept}
        />
      )}

      {/* Revenue trend chart (ORD-02) */}
      <RevenueTrendChart data={trend} />

      {/* Product ranking table (ORD-03) */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900">상품별 매출 순위 (Top 20)</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th className="px-6 py-3 font-medium">#</th>
              <th className="px-6 py-3 font-medium">상품명</th>
              <th className="px-6 py-3 font-medium text-right">매출</th>
              <th className="px-6 py-3 font-medium text-right">주문 수</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((row, i) => (
              <tr key={row.sellerProductId} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-6 py-3 text-sm text-gray-500">{i + 1}</td>
                <td className="px-6 py-3 text-sm text-gray-900 max-w-[300px] truncate">
                  {row.sellerProductName}
                </td>
                <td className="px-6 py-3 text-sm text-gray-900 text-right font-medium">
                  ₩{formatKRW(row.revenue)}
                </td>
                <td className="px-6 py-3 text-sm text-gray-500 text-right">{row.orderCount}건</td>
              </tr>
            ))}
          </tbody>
        </table>
        {ranking.length === 0 && !loading && (
          <div className="px-6 py-12 text-center text-sm text-gray-400">데이터가 없습니다</div>
        )}
      </div>
    </div>
  );
}
