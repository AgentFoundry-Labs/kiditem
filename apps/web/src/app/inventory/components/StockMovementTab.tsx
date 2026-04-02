'use client';

import { useState } from 'react';
import { ArrowUpDown, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { formatKRW } from '@/lib/utils';
import { StockMovementSummaryCard } from './StockMovementSummaryCard';
import { StockMovementTable, type GroupedRow } from './StockMovementTable';

interface Summary {
  inQty: number;
  outQty: number;
  inAmount: number;
  outAmount: number;
}

const GROUP_TABS = [
  { key: 'product', label: '상품별' },
  { key: 'date', label: '일자별' },
  { key: 'type', label: '유형별' },
] as const;

const PERIOD_OPTIONS = [
  { value: '1', label: '오늘' },
  { value: '7', label: '7일' },
  { value: '30', label: '30일' },
  { value: '90', label: '90일' },
] as const;

export function StockMovementTab() {
  const queryClient = useQueryClient();
  const [groupBy, setGroupBy] = useState<string>('product');
  const [dateRange, setDateRange] = useState('30');

  const { data: stockData, isLoading: loading, error: queryError } = useQuery({
    queryKey: queryKeys.stockMovement.data({ dateRange, groupBy }),
    queryFn: async () => {
      const daysMap: Record<string, number> = { '1': 1, '7': 7, '30': 30, '90': 90 };
      const days = daysMap[dateRange] || 7;
      const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
      return apiClient.get<{ total: number; grouped: GroupedRow[]; summary: Summary }>(
        `/api/stock-movement?from=${from}&groupBy=${groupBy}&limit=500`,
      );
    },
  });

  const total = stockData?.total ?? 0;
  const grouped = stockData?.grouped ?? [];
  const summary = stockData?.summary ?? { inQty: 0, outQty: 0, inAmount: 0, outAmount: 0 };
  const error = queryError ? (isApiError(queryError) ? queryError.detail : '입출고 데이터를 불러오는데 실패했습니다.') : null;

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.stockMovement.all })} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ArrowUpDown size={20} className="text-indigo-500" />
          <div>
            <p className="text-sm text-gray-500">{total}건 거래 내역</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDateRange(opt.value)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  dateRange === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-500 hover:text-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.stockMovement.all })}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200"
          >
            <RefreshCw size={14} />
            새로고침
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StockMovementSummaryCard icon={<TrendingUp size={14} className="text-green-500" />} label="입고 수량" value={formatKRW(summary.inQty)} color="text-green-700" />
        <StockMovementSummaryCard icon={<TrendingDown size={14} className="text-red-500" />} label="출고 수량" value={formatKRW(summary.outQty)} color="text-red-600" />
        <StockMovementSummaryCard icon={<TrendingUp size={14} className="text-green-500" />} label="입고 금액" value={`${formatKRW(summary.inAmount)}원`} color="text-green-700" />
        <StockMovementSummaryCard icon={<TrendingDown size={14} className="text-red-500" />} label="출고 금액" value={`${formatKRW(summary.outAmount)}원`} color="text-red-600" />
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {GROUP_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setGroupBy(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              groupBy === tab.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <StockMovementTable grouped={grouped} loading={loading} groupBy={groupBy} />
    </div>
  );
}
