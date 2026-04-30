'use client';

import { useMemo, useState } from 'react';
import { ArrowUpDown, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isApiError } from '@/lib/api-error';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import { StockMovementSummaryCard } from './StockMovementSummaryCard';
import { StockMovementTable, type GroupedRow } from './StockMovementTable';
import {
  fetchAllTransactionsInWindow,
  transactionKeyParams,
} from '../lib/inventory-api';
import type { TransactionListItem } from '@kiditem/shared/inventory';

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

const DAYS_MAP: Record<string, number> = { '1': 1, '7': 7, '30': 30, '90': 90 };

function groupTransactions(rows: TransactionListItem[], groupBy: string): GroupedRow[] {
  const map = new Map<string, GroupedRow>();
  for (const tx of rows) {
    const key =
      groupBy === 'date'
        ? String(tx.createdAt).slice(0, 10)
        : groupBy === 'type'
          ? tx.type
          : tx.optionName ?? tx.optionId;
    const current = map.get(key) ?? { key, inQty: 0, outQty: 0, adjustQty: 0, inAmt: 0, outAmt: 0 };
    if (tx.type === 'RECEIVE') {
      current.inQty += tx.quantity;
      current.inAmt += tx.totalCost;
    } else if (tx.type === 'ISSUE') {
      current.outQty += tx.quantity;
      current.outAmt += tx.totalCost;
    } else {
      // ADJUST is signed via stockDelta — preserve direction for net stock change.
      current.adjustQty += tx.stockDelta;
    }
    map.set(key, current);
  }
  return Array.from(map.values());
}

export function StockMovementTab() {
  const queryClient = useQueryClient();
  const [groupBy, setGroupBy] = useState<string>('product');
  const [dateRange, setDateRange] = useState('30');

  // Build an explicit `[from, to]` window so list and summary share the same
  // boundaries — previously summary used a rolling `Date.now() - days` window
  // while list used a `from`-only midnight cutoff, causing the cards and table
  // to disagree at timezone/hour boundaries.
  const { from, to } = useMemo(() => {
    const days = DAYS_MAP[dateRange] ?? 30;
    const now = new Date();
    const fromDate = new Date(now.getTime() - days * 86400000);
    return { from: fromDate.toISOString(), to: now.toISOString() };
  }, [dateRange]);

  const { data, isLoading, error: rawError } = useQuery({
    queryKey: queryKeys.inventory.transactions(transactionKeyParams({ from, to })),
    // Page through the entire window — server caps `limit` at 200, so a single
    // request would silently truncate periods with > 200 transactions.
    queryFn: () => fetchAllTransactionsInWindow({ from, to }),
  });

  const error = rawError ? (isApiError(rawError) ? rawError.detail : '입출고 데이터를 불러오는데 실패했습니다.') : null;

  const transactions = useMemo<TransactionListItem[]>(() => data ?? [], [data]);
  const grouped = groupTransactions(transactions, groupBy);

  // Derive summary from the same fetched window so cards and table never disagree.
  const summary = useMemo(() => {
    let inQty = 0, outQty = 0, adjustQty = 0, inAmount = 0, outAmount = 0;
    for (const tx of transactions) {
      if (tx.type === 'RECEIVE') {
        inQty += tx.quantity;
        inAmount += tx.totalCost;
      } else if (tx.type === 'ISSUE') {
        outQty += tx.quantity;
        outAmount += tx.totalCost;
      } else {
        adjustQty += tx.stockDelta;
      }
    }
    return { inQty, outQty, adjustQty, inAmount, outAmount };
  }, [transactions]);

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all })} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ArrowUpDown size={20} className="text-indigo-500" />
          <div>
            <p className="text-sm text-slate-500">{transactions.length}건 거래 내역</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-slate-200 rounded-lg overflow-hidden">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDateRange(opt.value)}
                className={cn('px-3 py-1.5 text-sm font-medium transition-colors', dateRange === opt.value ? 'bg-purple-600 text-white' : 'bg-white text-slate-500 hover:text-slate-700')}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all })}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200"
          >
            <RefreshCw size={14} />
            새로고침
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StockMovementSummaryCard icon={<TrendingUp size={14} className="text-green-500" />} label="입고 수량" value={formatNumber(summary.inQty)} color="text-green-700" />
        <StockMovementSummaryCard icon={<TrendingDown size={14} className="text-red-500" />} label="출고 수량" value={formatNumber(summary.outQty)} color="text-red-600" />
        <StockMovementSummaryCard icon={<TrendingUp size={14} className="text-green-500" />} label="입고 금액" value={`${formatKRW(summary.inAmount)}원`} color="text-green-700" />
        <StockMovementSummaryCard icon={<TrendingDown size={14} className="text-red-500" />} label="출고 금액" value={`${formatKRW(summary.outAmount)}원`} color="text-red-600" />
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {GROUP_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setGroupBy(tab.key)}
            className={cn('px-4 py-2 text-sm font-medium border-b-2 transition-colors', groupBy === tab.key ? 'border-purple-600 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-700')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <StockMovementTable grouped={grouped} loading={isLoading} groupBy={groupBy} />
    </div>
  );
}
