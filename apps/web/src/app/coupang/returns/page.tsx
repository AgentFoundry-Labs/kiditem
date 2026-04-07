'use client';

import { useState } from 'react';
import { format, subDays } from 'date-fns';
import { type DateRange } from 'react-day-picker';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { RotateCcw, TrendingDown, Package } from 'lucide-react';
import { ReturnFaultSplit, type FaultSplit } from './components/ReturnFaultSplit';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { useQuery } from '@tanstack/react-query';
import { formatPercent, cn } from '@/lib/utils';
import { DateRangePicker } from '@/components/ui/DateRangePicker';

function toParam(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

function getPreset(days: number): DateRange {
  const to = new Date();
  const from = subDays(to, days);
  return { from, to };
}

interface ReturnSummary {
  returnCount: number;
  orderCount: number;
  returnRate: number;
}

interface ReasonRow {
  reason: string;
  count: number;
}

export default function CoupangReturnsPage() {
  const [dateRange, setDateRange] = useState<DateRange>(getPreset(30));
  const [activePreset, setActivePreset] = useState<number>(30);

  const from = dateRange.from ? toParam(dateRange.from) : '';
  const to = dateRange.to ? toParam(dateRange.to) : '';

  const { data: summary } = useQuery({
    queryKey: queryKeys.coupangDashboard.returnSummary({ from, to }),
    queryFn: () => apiClient.get<ReturnSummary>(`/api/coupang-dashboard/return-summary?from=${from}&to=${to}`),
    enabled: !!from && !!to,
  });

  const { data: reasons = [], isLoading: loading } = useQuery({
    queryKey: queryKeys.coupangDashboard.returnReasons({ from, to }),
    queryFn: () => apiClient.get<ReasonRow[]>(`/api/coupang-dashboard/return-reasons?from=${from}&to=${to}`),
    enabled: !!from && !!to,
  });

  const { data: faultSplit } = useQuery({
    queryKey: queryKeys.coupangDashboard.returnFaultSplit({ from, to }),
    queryFn: () => apiClient.get<FaultSplit>(`/api/coupang-dashboard/return-fault-split?from=${from}&to=${to}`),
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
        <h1 className="page-title">반품 대시보드</h1>
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
                  ? 'bg-purple-50 text-purple-600 border-purple-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              )}
            >
              {p.label}
            </button>
          ))}
          <DateRangePicker value={dateRange} onChange={handleCustomRange} />
        </div>
      </div>

      {/* RET-01: Return rate KPI cards */}
      {summary && (
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
              <p className="text-xl font-bold text-slate-900">{summary.returnCount}건</p>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4 flex items-center gap-3">
            <Package className="w-6 h-6 text-blue-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-slate-500">주문 건수</p>
              <p className="text-xl font-bold text-slate-900">{summary.orderCount}건</p>
            </div>
          </div>
        </div>
      )}

      {/* RET-02: Return reason breakdown bar chart */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h3 className="text-base font-semibold text-slate-900 mb-4">반품 사유 분석</h3>
         {reasons.length > 0 ? (
           <div className="h-[300px]">
             <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
               <BarChart
                data={reasons}
                layout="vertical"
                margin={{ left: 120, right: 20, top: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                />
                <YAxis
                  type="category"
                  dataKey="reason"
                  width={110}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#6B7280' }}
                />
                <Tooltip
                  formatter={(value: any) => [`${value}건`, '건수']}
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
          !loading && (
            <div className="py-12 text-center text-sm text-slate-400">데이터가 없습니다</div>
          )
        )}
      </div>

      {/* RET-03: CUSTOMER vs VENDOR fault split */}
      {faultSplit && <ReturnFaultSplit faultSplit={faultSplit} />}
    </div>
  );
}
