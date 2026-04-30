'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Hash,
} from 'lucide-react';
import { usePeriodSelector } from '@/hooks/usePeriodSelector';
import PeriodSelector from '@/components/ui/PeriodSelector';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatDateTime, formatNumber, formatKRW } from '@/lib/utils';
import {
  fetchAllTransactionsInWindow,
  monthPeriodWindow,
  transactionKeyParams,
} from '@/app/(inventory)/inventory/lib/inventory-api';
import type { TransactionListItem } from '@kiditem/shared/inventory';

const typeLabels: Record<string, { text: string; color: string }> = {
  RECEIVE: { text: '입고', color: 'bg-green-100 text-green-700' },
  ISSUE: { text: '출고', color: 'bg-red-100 text-red-700' },
  ADJUST: { text: '조정', color: 'bg-purple-100 text-purple-700' },
};

export default function StockIo() {
  const [tab, setTab] = useState<'RECEIVE' | 'ISSUE'>('RECEIVE');
  const { period, setPeriod } = usePeriodSelector();

  const { from, to } = useMemo(() => monthPeriodWindow(period), [period]);

  // Page through every transaction in the period — server caps limit at 200,
  // so a single request would silently truncate months with > 200 movements.
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.inventory.transactions(transactionKeyParams({ from, to })),
    queryFn: () => fetchAllTransactionsInWindow({ from, to }),
  });

  const allTransactions: TransactionListItem[] = data ?? [];
  const transactions = allTransactions.filter((tx) => tx.type === tab);

  // KPIs derived from period-filtered transactions (server summary endpoint
  // uses rolling Date.now() - days, which can't represent past months).
  const summary = useMemo(() => {
    let inQty = 0;
    let outQty = 0;
    let inAmount = 0;
    let outAmount = 0;
    for (const tx of allTransactions) {
      if (tx.type === 'RECEIVE') {
        inQty += tx.quantity;
        inAmount += tx.totalCost;
      } else if (tx.type === 'ISSUE') {
        outQty += tx.quantity;
        outAmount += tx.totalCost;
      }
    }
    return { inQty, outQty, inAmount, outAmount };
  }, [allTransactions]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ArrowDownToLine className="w-6 h-6 text-purple-600" />
          <h1 className="page-title">입출고 통합 현황</h1>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="card-label mb-1">입고 수량</p>
          <p className="card-value text-green-600">
            {isLoading ? '-' : `${formatNumber(summary.inQty)}개`}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="card-label mb-1">출고 수량</p>
          <p className="card-value text-red-600">
            {isLoading ? '-' : `${formatNumber(summary.outQty)}개`}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="card-label mb-1">입고 금액</p>
          <p className="card-value text-slate-800">
            {isLoading ? '-' : `${formatKRW(summary.inAmount)}원`}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="card-label mb-1">출고 금액</p>
          <p className="card-value text-slate-800">
            {isLoading ? '-' : `${formatKRW(summary.outAmount)}원`}
          </p>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('RECEIVE')}
          className={cn('flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors', tab === 'RECEIVE' ? 'bg-green-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50')}
        >
          <ArrowDownToLine className="w-4 h-4" /> 입고
        </button>
        <button
          onClick={() => setTab('ISSUE')}
          className={cn('flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors', tab === 'ISSUE' ? 'bg-red-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50')}
        >
          <ArrowUpFromLine className="w-4 h-4" /> 출고
        </button>
      </div>

      {/* 트랜잭션 목록 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Hash className="w-5 h-5 text-slate-500" />
          <h2 className="text-lg font-semibold text-slate-800">
            {tab === 'RECEIVE' ? '입고' : '출고'} 트랜잭션
          </h2>
          <span className="text-sm text-slate-400">({transactions.length}건)</span>
        </div>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="text-left py-2 px-3">일시</th>
                <th className="text-left py-2 px-3">유형</th>
                <th className="text-left py-2 px-3">옵션</th>
                <th className="text-right py-2 px-3">수량</th>
                <th className="text-right py-2 px-3">단가</th>
                <th className="text-right py-2 px-3">금액</th>
                <th className="text-left py-2 px-3">비고</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    로딩 중...
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    데이터 없음
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr
                    key={tx.id}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="py-2 px-3 text-slate-500 text-xs whitespace-nowrap">
                      {formatDateTime(tx.createdAt, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={cn('px-2 py-0.5 rounded text-xs font-medium', typeLabels[tx.type]?.color || 'bg-slate-100 text-slate-600')}
                      >
                        {typeLabels[tx.type]?.text || tx.type}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-medium max-w-[180px] truncate">
                      {tx.optionName ?? tx.optionId}
                    </td>
                    <td className="py-2 px-3 text-right font-medium">
                      {tx.quantity > 0 ? '+' : ''}
                      {formatNumber(tx.quantity)}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {formatKRW(tx.unitCost)}원
                    </td>
                    <td className="py-2 px-3 text-right font-medium">
                      {formatKRW(tx.totalCost)}원
                    </td>
                    <td className="py-2 px-3 text-slate-500 text-xs max-w-[150px] truncate">
                      {tx.note || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
