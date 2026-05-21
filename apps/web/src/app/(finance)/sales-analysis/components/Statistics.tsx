'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { usePeriodSelector } from '@/hooks/usePeriodSelector';
import { friendlyError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import {
  fetchStatisticsTab,
  isTabEmpty,
  type StatisticsTab,
} from '../lib/statistics-data';
import { StatisticsTabPanels } from './statistics/StatisticsTabPanels';
import { StatisticsTabs } from './statistics/StatisticsTabs';
import { StatisticsToolbar } from './statistics/StatisticsToolbar';

export default function Statistics() {
  const [tab, setTab] = useState<StatisticsTab>('overview');
  const [page, setPage] = useState(1);
  const [pageCustomers, setPageCustomers] = useState(1);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlPeriod = searchParams.get('period');

  const { period, setPeriod: setPeriodRaw, periodOptions } = usePeriodSelector({
    months: 12,
    defaultTo: 'prev',
    initial: urlPeriod ?? undefined,
  });

  const setPeriod = (nextPeriod: string) => {
    setPeriodRaw(nextPeriod);
    setPage(1);
    setPageCustomers(1);
    const params = new URLSearchParams(searchParams);
    params.set('period', nextPeriod);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const handleTabChange = (nextTab: StatisticsTab) => {
    setTab(nextTab);
    setPage(1);
    setPageCustomers(1);
  };

  const {
    data,
    isLoading,
    isPlaceholderData,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.salesAnalysis.statistics(tab, period),
    queryFn: () => fetchStatisticsTab(tab, period),
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === tab ? previousData : undefined,
  });

  const error = friendlyError(queryError);
  const isRefreshing = isPlaceholderData;

  return (
    <div className="space-y-4">
      <StatisticsToolbar
        period={period}
        periodOptions={periodOptions}
        onPeriodChange={setPeriod}
      />

      <StatisticsTabs activeTab={tab} onTabChange={handleTabChange} />

      {isRefreshing ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm" aria-live="polite">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-200 border-t-purple-600" />
          선택한 기간의 통계를 갱신 중입니다.
        </div>
      ) : null}

      <div aria-busy={isRefreshing}>
        {isLoading && !data ? (
          <PageSkeleton variant="table" />
        ) : error ? (
          <ErrorState message={error} />
        ) : !data ? (
          <EmptyState message="해당 기간 데이터가 없습니다." />
        ) : isTabEmpty(tab, data) ? (
          <EmptyState message="해당 기간 데이터가 없습니다." />
        ) : (
          <StatisticsTabPanels
            tab={tab}
            data={data}
            page={page}
            customerPage={pageCustomers}
            onPageChange={setPage}
            onCustomerPageChange={setPageCustomers}
          />
        )}
      </div>
    </div>
  );
}
