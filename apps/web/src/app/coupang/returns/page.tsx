'use client';

import { useState, useEffect } from 'react';
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
import { RotateCcw, TrendingDown, Users, Package } from 'lucide-react';
import { API_BASE } from '@/lib/api';
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

interface FaultSplit {
  customer: number;
  vendor: number;
}

export default function CoupangReturnsPage() {
  const [dateRange, setDateRange] = useState<DateRange>(getPreset(30));
  const [summary, setSummary] = useState<ReturnSummary | null>(null);
  const [reasons, setReasons] = useState<ReasonRow[]>([]);
  const [faultSplit, setFaultSplit] = useState<FaultSplit | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePreset, setActivePreset] = useState<number>(30);

  useEffect(() => {
    if (!dateRange.from || !dateRange.to) return;
    setLoading(true);
    const from = toParam(dateRange.from);
    const to = toParam(dateRange.to);
    Promise.all([
      fetch(`${API_BASE}/api/coupang-dashboard/return-summary?from=${from}&to=${to}`).then((r) =>
        r.json()
      ),
      fetch(`${API_BASE}/api/coupang-dashboard/return-reasons?from=${from}&to=${to}`).then((r) =>
        r.json()
      ),
      fetch(`${API_BASE}/api/coupang-dashboard/return-fault-split?from=${from}&to=${to}`).then(
        (r) => r.json()
      ),
    ])
      .then(([summaryData, reasonsData, faultData]) => {
        setSummary(summaryData);
        setReasons(reasonsData);
        setFaultSplit(faultData);
      })
      .finally(() => setLoading(false));
  }, [dateRange]);

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
        <h1 className="text-xl font-bold text-gray-900">반품 대시보드</h1>
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

      {/* RET-01: Return rate KPI cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3">
            <TrendingDown className="w-6 h-6 text-red-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-500">반품률</p>
              <p className="text-xl font-bold text-gray-900">{formatPercent(summary.returnRate)}</p>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3">
            <RotateCcw className="w-6 h-6 text-amber-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-500">반품 건수</p>
              <p className="text-xl font-bold text-gray-900">{summary.returnCount}건</p>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3">
            <Package className="w-6 h-6 text-blue-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-500">주문 건수</p>
              <p className="text-xl font-bold text-gray-900">{summary.orderCount}건</p>
            </div>
          </div>
        </div>
      )}

      {/* RET-02: Return reason breakdown bar chart */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">반품 사유 분석</h3>
        {reasons.length > 0 ? (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
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
            <div className="py-12 text-center text-sm text-gray-400">데이터가 없습니다</div>
          )
        )}
      </div>

      {/* RET-03: CUSTOMER vs VENDOR fault split */}
      {faultSplit && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4">귀책 구분</h3>
          {(() => {
            const total = faultSplit.customer + faultSplit.vendor;
            const customerPct = total > 0 ? Math.round((faultSplit.customer / total) * 100) : 0;
            const vendorPct = total > 0 ? 100 - customerPct : 0;
            return (
              <div className="space-y-4">
                {/* Stacked bar */}
                <div className="flex h-8 rounded-lg overflow-hidden">
                  {customerPct > 0 && (
                    <div
                      className="bg-blue-500 flex items-center justify-center text-white text-xs font-semibold"
                      style={{ width: `${customerPct}%` }}
                    >
                      {customerPct}%
                    </div>
                  )}
                  {vendorPct > 0 && (
                    <div
                      className="bg-red-500 flex items-center justify-center text-white text-xs font-semibold"
                      style={{ width: `${vendorPct}%` }}
                    >
                      {vendorPct}%
                    </div>
                  )}
                </div>
                {/* Legend */}
                <div className="flex gap-6">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-500" />
                    <span className="text-sm text-gray-700">고객 귀책</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {faultSplit.customer}건 ({customerPct}%)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-gray-700">판매자 귀책</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {faultSplit.vendor}건 ({vendorPct}%)
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
