'use client';

import { useState, useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Info, RefreshCw } from 'lucide-react';
import { SalesAnalysisDataSchema } from '@kiditem/shared/finance';
import { shiftBusinessDateKey } from '@kiditem/shared/common';
import { CollectionStartControl } from '@/components/collection/CollectionStartControl';
import { useCollectionSourceControl } from '@/hooks/use-collection-source-control';
import { usePeriodSelector } from '@/hooks/usePeriodSelector';
import {
  sellpiaMonthRange,
  useSellpiaChannelSales,
  useSellpiaKnownThrough,
} from '@/hooks/useSellpiaChannelSales';
import PeriodSelector from '@/components/ui/PeriodSelector';
import { apiClient } from '@/lib/api-client';
import { friendlyError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { sellpiaSalesCollection } from '@/lib/sellpia-sales-source-collection';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { ErrorState } from '@/components/ui/EmptyState';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import { FinanceBasisNotice } from '../../_shared/components/FinanceBasisNotice';
import { compareNullableLast } from '@/lib/nullable-sort';
import ChannelTable from './ChannelTable';
import {
  SalesChannelAnalysis,
  type SalesChannelSelection,
} from './SalesChannelAnalysis';

type SortField = 'totalOrders' | 'totalRevenue' | 'totalCost' | 'totalProfit' | 'avgOrderValue';
type SortDir = 'asc' | 'desc' | null;

export function parseSalesChannelSelection(value: string | null): SalesChannelSelection {
  return value === 'rocket' || value === 'others' ? value : 'all';
}

/** A money card value; an unavailable amount is `-` and carries no unit. */
function won(amount: number | null): string {
  return amount === null ? '-' : `${formatKRW(amount)}원`;
}

export default function SalesOverview() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlPeriod = searchParams.get('period');
  const sellpiaKnownThrough = useSellpiaKnownThrough();

  const { period, setPeriod: setPeriodRaw, periodOptions } = usePeriodSelector({
    months: 12,
    defaultTo: 'prev',
    initial: urlPeriod ?? undefined,
    referenceDate: sellpiaKnownThrough
      ? shiftBusinessDateKey(sellpiaKnownThrough, 1)
      : null,
  });
  const setPeriod = (p: string) => {
    setPeriodRaw(p);
    const params = new URLSearchParams(searchParams);
    params.set('period', p);
    router.replace(`${pathname}?${params.toString()}`);
  };
  const selectedChannel = parseSalesChannelSelection(searchParams.get('channel'));
  const channelSales = useSellpiaChannelSales(
    sellpiaKnownThrough ? sellpiaMonthRange(period, sellpiaKnownThrough) : null,
  );
  const salesCollection = useCollectionSourceControl(sellpiaSalesCollection);
  const setSelectedChannel = (channel: SalesChannelSelection) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', 'overview');
    params.set('period', period);
    if (channel === 'all') params.delete('channel');
    else params.set('channel', channel);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const [sortField, setSortField] = useState<SortField | null>('totalRevenue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { data, isLoading, isFetching, error: queryError } = useQuery({
    queryKey: queryKeys.salesAnalysis.data(period),
    queryFn: () => apiClient.getParsed(`/api/sales-analysis?period=${period}`, SalesAnalysisDataSchema),
    placeholderData: previousData => previousData,
    enabled: !!period,
  });
  const isRefreshing = isFetching && !isLoading;

  const error = friendlyError(queryError);

  const sorted = useMemo(() => {
    if (!data?.channels) return [];
    if (!sortField || !sortDir) return data.channels;
    return [...data.channels].sort((a, b) => compareNullableLast(a[sortField], b[sortField], sortDir));
  }, [data, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField !== field) { setSortField(field); setSortDir('desc'); return; }
    if (sortDir === 'desc') { setSortDir('asc'); return; }
    setSortField(null); setSortDir(null);
  };

  const totalProfit = data?.totals?.totalProfit ?? null;

  return (
    <div className="space-y-6">
      {isRefreshing && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm" aria-live="polite">
          <RefreshCw size={14} className="animate-spin text-purple-600" />
          매출 분석 데이터를 갱신 중입니다.
        </div>
      )}

      <SalesChannelAnalysis
        summary={channelSales.summary}
        isLoading={channelSales.isLoading}
        isError={channelSales.isError}
        onRetry={channelSales.refetch}
        collectionControl={(
          <CollectionStartControl
            control={salesCollection}
            startLabel="지금 수집"
            startTitle="셀피아 판매현황(몰별 일매출)을 수집합니다."
            onStart={() => salesCollection.start()}
            onStop={salesCollection.stop}
          />
        )}
        selectedChannel={selectedChannel}
        onChannelChange={setSelectedChannel}
        periodControl={(
          <PeriodSelector
            value={period}
            onChange={setPeriod}
            options={periodOptions}
            className="border-slate-200 bg-white"
          />
        )}
      />

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">주문 기반 상세</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            주문·반품 데이터를 기준으로 채널별 매출과 이익을 집계합니다.
          </p>
        </div>

        {data && !error ? <FinanceBasisNotice basis={data.basis} /> : null}

        {isLoading && !data ? (
          <PageSkeleton variant="table" />
        ) : error ? (
          <ErrorState message={error} />
        ) : !data || data.channels.length === 0 ? (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            <Info size={20} className="mx-auto text-slate-400" />
            <div className="text-sm font-medium text-slate-600">
              해당 기간 주문 기반 매출 데이터가 없습니다.
            </div>
            <div className="mx-auto max-w-md text-xs text-slate-500">
              주문 데이터가 없어도 위 몰별 매출 그래프는 셀피아 판매현황 수집 데이터를
              기준으로 표시됩니다.
            </div>
          </div>
        ) : (
          <div className="space-y-6" aria-busy={isRefreshing}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="card">
                <div className="card-label">총매출</div>
                <div className="card-value">{won(data.totals.totalRevenue)}</div>
              </div>
              <div className="card">
                <div className="card-label">총비용</div>
                <div className="card-value">{won(data.totals.totalCost)}</div>
              </div>
              <div
                className={cn(
                  'rounded-xl border p-4',
                  totalProfit === null
                    ? 'border-slate-200 bg-white'
                    : totalProfit >= 0
                      ? 'border-green-200 bg-green-50'
                      : 'border-red-200 bg-red-50',
                )}
              >
                <div className="card-label">총이익</div>
                <div className={cn(
                  'card-value',
                  totalProfit === null
                    ? 'text-slate-400'
                    : totalProfit >= 0 ? 'text-green-600' : 'text-red-600',
                )}>
                  {won(totalProfit)}
                </div>
              </div>
              <div className="card">
                <div className="card-label">총 주문 수</div>
                <div className="card-value">{formatNumber(data.totals.totalOrders)}</div>
              </div>
            </div>

            {data.totals.orphanReturnCount !== null && data.totals.orphanReturnCount > 0 && (
              <div className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-900">
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
          </div>
        )}
      </section>
    </div>
  );
}
