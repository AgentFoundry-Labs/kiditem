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
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.salesAnalysis.statistics(tab, period),
    queryFn: () => fetchStatisticsTab(tab, period),
  });

  const error = friendlyError(queryError);

  return (
    <div className="space-y-4">
      <StatisticsToolbar
        period={period}
        periodOptions={periodOptions}
        onPeriodChange={setPeriod}
      />

      <StatisticsTabs activeTab={tab} onTabChange={handleTabChange} />

      {isLoading ? (
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
  );
}
