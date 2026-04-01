'use client';

import { useState } from 'react';
import { format, subDays } from 'date-fns';
import { type DateRange } from 'react-day-picker';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useQuery } from '@tanstack/react-query';
import { KpiBar } from './components/KpiBar';
import { RevenueTrendChart } from './components/RevenueTrendChart';
import type { TrendRow } from './components/RevenueTrendChart';
import OrdersDateFilter from './components/OrdersDateFilter';
import OrderRankingTable from './components/OrderRankingTable';

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
      <OrdersDateFilter
        activePreset={activePreset}
        dateRange={dateRange}
        onPreset={handlePreset}
        onCustomRange={handleCustomRange}
      />

      {kpis && (
        <KpiBar
          todayOrderCount={kpis.todayOrders.count}
          todayRevenue={kpis.todayOrders.revenue}
          pendingConfirmCount={kpis.pendingAccept}
        />
      )}

      <RevenueTrendChart data={trend} />

      <OrderRankingTable ranking={ranking} loading={loading} />
    </div>
  );
}
