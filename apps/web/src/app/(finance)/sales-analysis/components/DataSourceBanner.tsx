'use client';

import { useQuery } from '@tanstack/react-query';
import { Database, AlertTriangle } from 'lucide-react';
import { SalesAnalysisDataSourcesSchema } from '@kiditem/shared/finance';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatNumber, timeAgo } from '@/lib/utils';

const RANGE_FALLBACK = '데이터 없음';

function formatRange(first: string | null, last: string | null): string {
  if (!first || !last) return RANGE_FALLBACK;
  if (first === last) return first;
  return `${first} → ${last}`;
}

export default function DataSourceBanner() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.salesAnalysis.dataSources(),
    queryFn: () =>
      apiClient.getParsed(
        '/api/sales-analysis/data-sources',
        SalesAnalysisDataSourcesSchema,
      ),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 30_000,
  });

  if (isLoading || !data) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        데이터 수집 범위 확인 중…
      </div>
    );
  }

  const wingMissing = data.ads.missingDates.length;
  const ordersEmpty = data.orders.count === 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 space-y-2">
      <div className="flex items-center gap-2 text-slate-700 font-semibold">
        <Database size={14} className="text-blue-500" />
        데이터 수집 범위
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Cell
          label="Wing 일자 트래픽"
          range={formatRange(data.wing.firstDate, data.wing.lastDate)}
          subtext={
            data.wing.dateCount > 0
              ? `${formatNumber(data.wing.dateCount)}일 수집`
              : '쿠팡 익스텐션에서 Wing 매출분석 일별 수집 필요'
          }
          syncedAt={data.wing.lastSyncedAt}
        />
        <Cell
          label="쿠팡 광고 daily KPI"
          range={formatRange(data.ads.firstDate, data.ads.lastDate)}
          subtext={
            data.ads.dateCount > 0
              ? `${formatNumber(data.ads.dateCount)}일 수집`
              : '쿠팡 익스텐션에서 광고센터 일별 수집 필요'
          }
          syncedAt={data.ads.lastSyncedAt}
          warning={
            wingMissing > 0
              ? `Wing 범위 내 ${wingMissing}일 누락 — ${data.ads.missingDates
                  .slice(0, 3)
                  .join(', ')}${data.ads.missingDates.length > 3 ? ' …' : ''}`
              : null
          }
        />
        <Cell
          label="주문 데이터 (Order)"
          range={formatRange(data.orders.firstDate, data.orders.lastDate)}
          subtext={
            ordersEmpty
              ? '0건 — 주문 기반 손익/매출 분석은 비어 있는 게 정상입니다'
              : `${formatNumber(data.orders.count)}건 수집`
          }
          syncedAt={null}
          warning={
            ordersEmpty
              ? 'Drive replay 데이터에는 주문이 포함되지 않습니다'
              : null
          }
        />
      </div>
    </div>
  );
}

function Cell({
  label,
  range,
  subtext,
  syncedAt,
  warning,
}: {
  label: string;
  range: string;
  subtext: string;
  syncedAt: string | Date | null;
  warning?: string | null;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="text-sm font-semibold text-slate-800 mt-1 tabular-nums">
        {range}
      </div>
      <div className="text-[11px] text-slate-500 mt-1">{subtext}</div>
      <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            syncedAt ? 'bg-emerald-400' : 'bg-slate-300',
          )}
        />
        {syncedAt
          ? `최근 동기화 ${timeAgo(typeof syncedAt === 'string' ? syncedAt : syncedAt.toISOString())}`
          : '동기화 기록 없음'}
      </div>
      {warning && (
        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>{warning}</span>
        </div>
      )}
    </div>
  );
}
