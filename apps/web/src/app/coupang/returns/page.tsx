'use client';

import { useMemo, useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { RotateCcw, TrendingDown, Package } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import {
  ReturnSummarySchema,
  ReturnReasonRowSchema,
  ReturnFaultSplitSchema,
} from '@kiditem/shared';
import { apiClient } from '@/lib/api-client';
import { friendlyError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { formatPercent, formatNumber, cn } from '@/lib/utils';
import { DateRangePicker } from '@/components/ui/DateRangePicker';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { ErrorState } from '@/components/ui/EmptyState';
import { PRESETS, toParam, parseUrlState } from '../lib/date-range-url';
import { ReturnFaultSplit as ReturnFaultSplitCard } from './components/ReturnFaultSplit';

export default function CoupangReturnsPage() {
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

  const { data: summary, error: summaryErr, isLoading: summaryLoading } = useQuery({
    queryKey: queryKeys.coupangDashboard.returnSummary({ from, to }),
    queryFn: () =>
      apiClient.getParsed(
        `/api/coupang-dashboard/return-summary?from=${from}&to=${to}`,
        ReturnSummarySchema,
      ),
    enabled: !!from && !!to,
  });

  const { data: reasons = [], error: reasonsErr, isLoading: reasonsLoading } = useQuery({
    queryKey: queryKeys.coupangDashboard.returnReasons({ from, to }),
    queryFn: () =>
      apiClient.getParsed(
        `/api/coupang-dashboard/return-reasons?from=${from}&to=${to}`,
        z.array(ReturnReasonRowSchema),
      ),
    enabled: !!from && !!to,
  });

  const { data: faultSplit, error: faultErr, isLoading: faultLoading } = useQuery({
    queryKey: queryKeys.coupangDashboard.returnFaultSplit({ from, to }),
    queryFn: () =>
      apiClient.getParsed(
        `/api/coupang-dashboard/return-fault-split?from=${from}&to=${to}`,
        ReturnFaultSplitSchema,
      ),
    enabled: !!from && !!to,
  });

  // All 3 endpoints share the same period filter; if one fails all likely fail.
  // Collapse into single full-page error display (intentional — see Plan E.1 E5).
  const error = friendlyError(summaryErr ?? reasonsErr ?? faultErr);
  const loading = summaryLoading || reasonsLoading || faultLoading;

  return (
    <div className="space-y-6">
      {/* Page header with date filter */}
      <div className="flex items-center justify-between">
        <h1 className="page-title">반품 대시보드</h1>
        <div className="flex items-center gap-2">
          {PRESETS.map((days) => (
            <button
              key={days}
              onClick={() => setPreset(days)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-lg border',
                activePreset === days
                  ? 'bg-purple-50 text-purple-600 border-purple-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
              )}
            >
              {days}일
            </button>
          ))}
          <DateRangePicker value={dateRange} onChange={setCustomRange} />
        </div>
      </div>

      {loading ? (
        <PageSkeleton variant="cards" />
      ) : error ? (
        <ErrorState message={error} />
      ) : (
        <>
          {/* RET-01: Return rate KPI cards */}
          {summary && (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-lg border border-slate-200 p-4 flex items-center gap-3">
                  <TrendingDown className="w-6 h-6 text-red-500 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500">반품률</p>
                    <p className="text-xl font-bold text-slate-900">{formatPercent(summary.returnRate)}</p>
                  </div>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-4 flex items-center gap-3">
                  <RotateCcw className="w-6 h-6 text-amber-500 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500">반품 건수</p>
                    <p className="text-xl font-bold text-slate-900">{formatNumber(summary.returnCount)}건</p>
                  </div>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-4 flex items-center gap-3">
                  <Package className="w-6 h-6 text-blue-500 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500">주문 건수</p>
                    <p className="text-xl font-bold text-slate-900">{formatNumber(summary.orderCount)}건</p>
                  </div>
                </div>
              </div>

              {/* ADR-0017 orphan side metric badge — mirrors SalesOverview.tsx:111-116 */}
              {summary.orphanReturnCount > 0 && (
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                  주문 연결 없는 반품: <strong className="tabular-nums">{formatNumber(summary.orphanReturnCount)}</strong>건{' '}
                  <span className="ml-1 text-amber-700">(반품률 계산 제외)</span>
                </div>
              )}
            </>
          )}

          {/* RET-02: Return reason breakdown bar chart */}
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <h3 className="text-base font-semibold text-slate-900 mb-4">반품 사유 분석</h3>
            {reasons.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <BarChart data={reasons} layout="vertical" margin={{ left: 120, right: 20, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6B7280' }} />
                    <YAxis type="category" dataKey="reason" width={110} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#6B7280' }} />
                    <Tooltip
                      formatter={(value: unknown) => [`${value as number}건`, '건수']}
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #E5E7EB',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      }}
                    />
                    <Bar dataKey="count" fill="#F59E0B" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-slate-400">데이터가 없습니다</div>
            )}
          </div>

          {/* RET-03: CUSTOMER vs VENDOR fault split */}
          {faultSplit && <ReturnFaultSplitCard faultSplit={faultSplit} />}
        </>
      )}
    </div>
  );
}
