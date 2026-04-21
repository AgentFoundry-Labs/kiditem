'use client';

import { useMemo, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  ChannelDashboardSummarySchema,
  RevenueTrendPointSchema,
  ProductRankingRowSchema,
} from '@kiditem/shared';
import { apiClient } from '@/lib/api-client';
import { friendlyError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { ErrorState } from '@/components/ui/EmptyState';
import { toParam, parseUrlState } from '../lib/date-range-url';
import { KpiBar } from './components/KpiBar';
import { RevenueTrendChart } from './components/RevenueTrendChart';
import OrdersDateFilter from './components/OrdersDateFilter';
import OrderRankingTable from './components/OrderRankingTable';

export default function CoupangOrdersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { preset: activePreset, range: dateRange } = useMemo(
    () => parseUrlState(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const from = dateRange.from ? toParam(dateRange.from) : '';
  const to = dateRange.to ? toParam(dateRange.to) : '';

  const setPreset = useCallback(
    (days: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('preset', String(days));
      params.delete('from');
      params.delete('to');
      router.replace(`${pathname}?${params.toString()}`);
    },
    [searchParams, router, pathname],
  );

  const setCustomRange = useCallback(
    (range: { from?: Date; to?: Date } | undefined) => {
      if (!range?.from || !range?.to) return;
      const params = new URLSearchParams(searchParams.toString());
      params.delete('preset');
      params.set('from', toParam(range.from));
      params.set('to', toParam(range.to));
      router.replace(`${pathname}?${params.toString()}`);
    },
    [searchParams, router, pathname],
  );

  const { data: kpis, error: kpisErr, isLoading: kpisLoading } = useQuery({
    queryKey: queryKeys.coupangDashboard.kpis(),
    queryFn: () => apiClient.getParsed('/api/coupang-dashboard', ChannelDashboardSummarySchema),
  });

  const { data: trend = [], error: trendErr, isLoading: trendLoading } = useQuery({
    queryKey: queryKeys.coupangDashboard.trend({ from, to }),
    queryFn: () =>
      apiClient.getParsed(
        `/api/coupang-dashboard/trend?from=${from}&to=${to}`,
        z.array(RevenueTrendPointSchema),
      ),
    enabled: !!from && !!to,
  });

  const { data: ranking = [], error: rankingErr, isLoading: rankingLoading } = useQuery({
    queryKey: queryKeys.coupangDashboard.ranking({ from, to }),
    queryFn: () =>
      apiClient.getParsed(
        `/api/coupang-dashboard/ranking?from=${from}&to=${to}`,
        z.array(ProductRankingRowSchema),
      ),
    enabled: !!from && !!to,
  });

  // All 3 endpoints share the same period filter; if one fails all likely fail.
  // Collapse into single full-page error display (intentional — see Plan E.1 E5).
  const error = friendlyError(kpisErr ?? trendErr ?? rankingErr);
  const loading = kpisLoading || trendLoading || rankingLoading;

  return (
    <div className="space-y-6">
      <OrdersDateFilter
        activePreset={activePreset}
        dateRange={dateRange}
        onPreset={setPreset}
        onCustomRange={setCustomRange}
      />

      {loading ? (
        <PageSkeleton variant="dashboard" />
      ) : error ? (
        <ErrorState message={error} />
      ) : (
        <>
          {kpis && (
            <KpiBar
              todayOrderCount={kpis.todayOrders.count}
              todayRevenue={kpis.todayOrders.revenue}
              pendingConfirmCount={kpis.pendingAccept}
            />
          )}
          <RevenueTrendChart data={trend} />
          <OrderRankingTable ranking={ranking} loading={rankingLoading} />
        </>
      )}
    </div>
  );
}
