'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  Calendar,
  ArrowDownToLine,
  ArrowUpFromLine,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';

interface StockTransaction {
  id: string;
  productId: string;
  productName: string | null;
  type: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  createdAt: string;
  product?: { id: string; name: string } | null;
}

interface LedgerItem {
  productId: string;
  productName: string;
  sku: string | null;
  category: string;
  beginStock: number;
  inbound: number;
  outbound: number;
  adjust: number;
  endStock: number;
  currentStock: number;
}

interface Totals {
  beginStock: number;
  inbound: number;
  outbound: number;
  adjust: number;
  endStock: number;
}

const IN_TYPES = new Set(['in', 'purchase', 'return_in', 'inbound']);
const OUT_TYPES = new Set(['out', 'sale', 'outbound']);

export default function StockLedger() {
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.stockMovement.data({ period, action: 'ledger' }),
    queryFn: () =>
      apiClient.get<{ items: StockTransaction[]; summary: { inQty: number; outQty: number; inAmount: number; outAmount: number } }>(
        `/api/stock-movement?from=${period}-01&limit=200`
      ),
  });

  // 트랜잭션을 상품별로 그룹핑하여 수불부 생성
  const { ledger, totals } = useMemo(() => {
    const txs = data?.items ?? [];
    const map = new Map<string, { name: string; inQty: number; outQty: number; adjustQty: number }>();

    for (const tx of txs) {
      const key = tx.productId;
      if (!map.has(key)) {
        map.set(key, { name: tx.product?.name || tx.productName || key, inQty: 0, outQty: 0, adjustQty: 0 });
      }
      const entry = map.get(key)!;
      if (IN_TYPES.has(tx.type)) entry.inQty += tx.quantity;
      else if (OUT_TYPES.has(tx.type)) entry.outQty += tx.quantity;
      else entry.adjustQty += tx.quantity;
    }

    let totalIn = 0, totalOut = 0, totalAdj = 0;
    const items: LedgerItem[] = Array.from(map.entries()).map(([pid, v]) => {
      totalIn += v.inQty;
      totalOut += v.outQty;
      totalAdj += v.adjustQty;
      const endStock = v.inQty - v.outQty + v.adjustQty;
      return {
        productId: pid,
        productName: v.name,
        sku: null,
        category: '-',
        beginStock: 0,
        inbound: v.inQty,
        outbound: v.outQty,
        adjust: v.adjustQty,
        endStock,
        currentStock: endStock,
      };
    });

    return {
      ledger: items,
      totals: items.length > 0 ? { beginStock: 0, inbound: totalIn, outbound: totalOut, adjust: totalAdj, endStock: totalIn - totalOut + totalAdj } as Totals : null,
    };
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-teal-600" />
          <h1 className="text-2xl font-bold text-slate-800">재고수불부</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm"
            />
          </div>
        </div>
      </div>

      {/* 합계 KPI */}
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-sm text-slate-500 mb-1">기초재고</p>
            <p className="text-xl font-bold text-slate-800">
              {formatNumber(totals.beginStock)}개
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-1 mb-1">
              <ArrowDownToLine className="w-3.5 h-3.5 text-green-500" />
              <p className="text-sm text-slate-500">입고</p>
            </div>
            <p className="text-xl font-bold text-green-600">
              +{formatNumber(totals.inbound)}개
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-1 mb-1">
              <ArrowUpFromLine className="w-3.5 h-3.5 text-red-500" />
              <p className="text-sm text-slate-500">출고</p>
            </div>
            <p className="text-xl font-bold text-red-600">
              -{formatNumber(totals.outbound)}개
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-sm text-slate-500 mb-1">조정</p>
            <p className="text-xl font-bold text-purple-600">
              {totals.adjust >= 0 ? '+' : ''}
              {formatNumber(totals.adjust)}개
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-sm text-slate-500 mb-1">기말재고</p>
            <p className="text-xl font-bold text-blue-600">
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
            ({ledger.length}개 상품)
          </span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="text-left py-2 px-3">상품명</th>
                <th className="text-left py-2 px-3">SKU</th>
                <th className="text-left py-2 px-3">카테고리</th>
                <th className="text-right py-2 px-3 bg-slate-50">기초재고</th>
                <th className="text-right py-2 px-3 bg-green-50">입고</th>
                <th className="text-right py-2 px-3 bg-red-50">출고</th>
                <th className="text-right py-2 px-3 bg-purple-50">조정</th>
                <th className="text-right py-2 px-3 bg-blue-50">기말재고</th>
                <th className="text-right py-2 px-3">실재고</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    로딩 중...
                  </td>
                </tr>
              ) : ledger.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    해당 기간 데이터 없음
                  </td>
                </tr>
              ) : (
                ledger.map((item) => {
                  const diff = item.currentStock - item.endStock;
                  return (
                    <tr
                      key={item.productId}
                      className="border-b border-slate-100 hover:bg-slate-50"
                    >
                      <td className="py-2 px-3 font-medium max-w-[160px] truncate">
                        {item.productName}
                      </td>
                      <td className="py-2 px-3 text-xs text-slate-500 font-mono">
                        {item.sku || '-'}
                      </td>
                      <td className="py-2 px-3 text-slate-500 text-xs">
                        {item.category}
                      </td>
                      <td className="py-2 px-3 text-right bg-slate-50">
                        {formatNumber(item.beginStock)}
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
                      <td className="py-2 px-3 text-right">
                        <span
                          className={
                            diff !== 0
                              ? 'text-red-600 font-medium'
                              : 'text-slate-600'
                          }
                        >
                          {formatNumber(item.currentStock)}
                          {diff !== 0 && (
                            <span className="text-xs ml-1">
                              ({diff > 0 ? '+' : ''}
                              {diff})
                            </span>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {ledger.length > 0 && totals && (
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-bold text-slate-800">
                  <td className="py-2 px-3" colSpan={3}>
                    합계
                  </td>
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
                  <td className="py-2 px-3 text-right">
                    {formatNumber(
                      ledger.reduce((s, l) => s + l.currentStock, 0)
                    )}
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
