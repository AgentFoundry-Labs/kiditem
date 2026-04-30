'use client';

import { useState, useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { SalesAnalysisDataSchema } from '@kiditem/shared/finance';
import { usePeriodSelector } from '@/hooks/usePeriodSelector';
import PeriodSelector from '@/components/ui/PeriodSelector';
import { apiClient } from '@/lib/api-client';
import { friendlyError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { ErrorState } from '@/components/ui/EmptyState';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import ChannelTable from './ChannelTable';

type SortField = 'totalOrders' | 'totalRevenue' | 'totalCost' | 'totalProfit' | 'avgOrderValue';
type SortDir = 'asc' | 'desc' | null;

export default function SalesOverview() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlPeriod = searchParams.get('period');

  const { period, setPeriod: setPeriodRaw, periodOptions } = usePeriodSelector({
    months: 12,
    defaultTo: 'prev',
    initial: urlPeriod ?? undefined,
  });
  const setPeriod = (p: string) => {
    setPeriodRaw(p);
    const params = new URLSearchParams(searchParams);
    params.set('period', p);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const [sortField, setSortField] = useState<SortField | null>('totalRevenue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { data, isLoading, error: queryError } = useQuery({
    queryKey: queryKeys.salesAnalysis.data(period),
    queryFn: () => apiClient.getParsed(`/api/sales-analysis?period=${period}`, SalesAnalysisDataSchema),
  });

  const error = friendlyError(queryError);

  const sorted = useMemo(() => {
    if (!data?.channels) return [];
    if (!sortField || !sortDir) return data.channels;
    return [...data.channels].sort((a, b) => {
      const l = a[sortField];
      const r = b[sortField];
      if (l === r) return 0;
      return sortDir === 'asc' ? (l > r ? 1 : -1) : (l < r ? 1 : -1);
    });
  }, [data, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField !== field) { setSortField(field); setSortDir('desc'); return; }
    if (sortDir === 'desc') { setSortDir('asc'); return; }
    setSortField(null); setSortDir(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 size={20} className="text-purple-600" />
          <h1 className="page-title">통합매출분석</h1>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} options={periodOptions} />
      </div>

      {isLoading ? (
        <PageSkeleton variant="table" />
      ) : error ? (
        <ErrorState message={error} />
      ) : !data || data.channels.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-slate-500">해당 기간 데이터가 없습니다.</div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4">
            <div className="card">
              <div className="card-label">총매출</div>
              <div className="card-value">{formatKRW(data.totals.totalRevenue)}원</div>
            </div>
            <div className="card">
              <div className="card-label">총비용</div>
              <div className="card-value">{formatKRW(data.totals.totalCost)}원</div>
            </div>
            <div
              className={cn(
                'rounded-xl p-4 border',
                data.totals.totalProfit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200',
              )}
            >
              <div className="card-label">총이익</div>
              <div className={cn('card-value', data.totals.totalProfit >= 0 ? 'text-green-600' : 'text-red-600')}>
                {formatKRW(data.totals.totalProfit)}원
              </div>
            </div>
            <div className="card">
              <div className="card-label">총 주문 수</div>
              <div className="card-value">{formatNumber(data.totals.totalOrders)}</div>
            </div>
          </div>

          {data.totals.orphanReturnCount > 0 && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-xs">
              주문 연결 없는 반품: <strong className="tabular-nums">{formatNumber(data.totals.orphanReturnCount)}</strong>건{' '}
              <span className="ml-1 text-amber-700">(반품률 계산 제외)</span>
            </div>
          )}

          <ChannelTable
            channels={sorted}
            sortField={sortField}
            sortDir={sortDir}
            onToggleSort={toggleSort}
          />
        </>
      )}
    </div>
  );
}
