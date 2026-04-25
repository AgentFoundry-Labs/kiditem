'use client';

// NOTE(W2-T6): Ledger rows are grouped by optionId/optionName (canonical transaction field).
// Product-level ledger grouping is outside W2 scope — canonical transactions expose optionId/optionName,
// not productId/productName. Add product-level grouping in a future release when the transactions
// endpoint returns product metadata.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  ArrowDownToLine,
  ArrowUpFromLine,
} from 'lucide-react';
import { usePeriodSelector } from '@/hooks/usePeriodSelector';
import PeriodSelector from '@/components/ui/PeriodSelector';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';
import {
  fetchAllTransactionsInWindow,
  monthPeriodWindow,
  transactionKeyParams,
} from '@/app/inventory/lib/inventory-api';
import type { TransactionListItem } from '@kiditem/shared';

const IN_TYPES = new Set<string>(['RECEIVE']);
const OUT_TYPES = new Set<string>(['ISSUE']);

interface LedgerItem {
  optionId: string;
  optionLabel: string;
  inbound: number;
  outbound: number;
  adjust: number;
  endStock: number;
}

interface Totals {
  beginStock: number;
  inbound: number;
  outbound: number;
  adjust: number;
  endStock: number;
}

export default function StockLedger() {
  const { period, setPeriod } = usePeriodSelector();

  const { from, to } = useMemo(() => monthPeriodWindow(period), [period]);
  // Page through every transaction in the period — server caps limit at 200,
  // so a single request would silently truncate ledger totals when a month has
  // more than 200 movements.
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.inventory.transactions(transactionKeyParams({ from, to })),
    queryFn: () => fetchAllTransactionsInWindow({ from, to }),
  });

  const { ledger, totals } = useMemo(() => {
    const txs: TransactionListItem[] = data ?? [];
    const map = new Map<string, { label: string; inQty: number; outQty: number; adjustQty: number }>();

    for (const tx of txs) {
      const key = tx.optionId;
      if (!map.has(key)) {
        map.set(key, { label: tx.optionName ?? tx.optionId, inQty: 0, outQty: 0, adjustQty: 0 });
      }
      const entry = map.get(key)!;
      if (IN_TYPES.has(tx.type)) entry.inQty += tx.quantity;
      else if (OUT_TYPES.has(tx.type)) entry.outQty += tx.quantity;
      // ADJUST sign survives via stockDelta — using `quantity` here would
      // collapse a -3 shrinkage into a +3 ledger row.
      else entry.adjustQty += tx.stockDelta;
    }

    let totalIn = 0, totalOut = 0, totalAdj = 0;
    const items: LedgerItem[] = Array.from(map.entries()).map(([optionId, v]) => {
      totalIn += v.inQty;
      totalOut += v.outQty;
      totalAdj += v.adjustQty;
      const endStock = v.inQty - v.outQty + v.adjustQty;
      return {
        optionId,
        optionLabel: v.label,
        inbound: v.inQty,
        outbound: v.outQty,
        adjust: v.adjustQty,
        endStock,
      };
    });

    return {
      ledger: items,
      totals: items.length > 0
        ? { beginStock: 0, inbound: totalIn, outbound: totalOut, adjust: totalAdj, endStock: totalIn - totalOut + totalAdj } as Totals
        : null,
    };
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-teal-600" />
          <h1 className="page-title">재고수불부</h1>
        </div>
        <div className="flex items-center gap-3">
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>
      </div>

      {/* 합계 KPI */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="card-label mb-1">기초재고</p>
            <p className="card-value text-slate-800">
              {formatNumber(totals.beginStock)}개
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-1 mb-1">
              <ArrowDownToLine className="w-3.5 h-3.5 text-green-500" />
              <p className="text-sm text-slate-500">입고</p>
            </div>
            <p className="card-value text-green-600">
              +{formatNumber(totals.inbound)}개
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-1 mb-1">
              <ArrowUpFromLine className="w-3.5 h-3.5 text-red-500" />
              <p className="text-sm text-slate-500">출고</p>
            </div>
            <p className="card-value text-red-600">
              -{formatNumber(totals.outbound)}개
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="card-label mb-1">조정</p>
            <p className="card-value text-purple-600">
              {totals.adjust >= 0 ? '+' : ''}
              {formatNumber(totals.adjust)}개
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="card-label mb-1">기말재고</p>
            <p className="card-value text-purple-600">
              {formatNumber(totals.endStock)}개
            </p>
          </div>
        </div>
      )}

      {/* 수불부 테이블 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          {period} 재고수불부
          <span className="text-sm text-slate-400 ml-2">
            ({ledger.length}개 옵션)
          </span>
        </h2>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="text-left py-2 px-3">옵션명</th>
                <th className="text-right py-2 px-3 bg-slate-50">기초재고</th>
                <th className="text-right py-2 px-3 bg-green-50">입고</th>
                <th className="text-right py-2 px-3 bg-red-50">출고</th>
                <th className="text-right py-2 px-3 bg-purple-50">조정</th>
                <th className="text-right py-2 px-3 bg-blue-50">기말재고</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    로딩 중...
                  </td>
                </tr>
              ) : ledger.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    해당 기간 데이터 없음
                  </td>
                </tr>
              ) : (
                ledger.map((item) => (
                  <tr
                    key={item.optionId}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="py-2 px-3 font-medium max-w-[200px] truncate">
                      {item.optionLabel}
                    </td>
                    <td className="py-2 px-3 text-right bg-slate-50">
                      0
                    </td>
                    <td className="py-2 px-3 text-right bg-green-50 text-green-700 font-medium">
                      {item.inbound > 0 ? `+${formatNumber(item.inbound)}` : '-'}
                    </td>
                    <td className="py-2 px-3 text-right bg-red-50 text-red-700 font-medium">
                      {item.outbound > 0 ? `-${formatNumber(item.outbound)}` : '-'}
                    </td>
                    <td className="py-2 px-3 text-right bg-purple-50 text-purple-700">
                      {item.adjust !== 0
                        ? item.adjust > 0
                          ? `+${formatNumber(item.adjust)}`
                          : formatNumber(item.adjust)
                        : '-'}
                    </td>
                    <td className="py-2 px-3 text-right bg-blue-50 font-bold text-blue-700">
                      {formatNumber(item.endStock)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {ledger.length > 0 && totals && (
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-bold text-slate-800">
                  <td className="py-2 px-3">합계</td>
                  <td className="py-2 px-3 text-right bg-slate-50">
                    {formatNumber(totals.beginStock)}
                  </td>
                  <td className="py-2 px-3 text-right bg-green-50 text-green-700">
                    +{formatNumber(totals.inbound)}
                  </td>
                  <td className="py-2 px-3 text-right bg-red-50 text-red-700">
                    -{formatNumber(totals.outbound)}
                  </td>
                  <td className="py-2 px-3 text-right bg-purple-50 text-purple-700">
                    {totals.adjust >= 0 ? '+' : ''}
                    {formatNumber(totals.adjust)}
                  </td>
                  <td className="py-2 px-3 text-right bg-blue-50 text-blue-700">
                    {formatNumber(totals.endStock)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
