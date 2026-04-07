'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Hash,
} from 'lucide-react';
import { usePeriodSelector } from '@/hooks/usePeriodSelector';
import PeriodSelector from '@/components/ui/PeriodSelector';
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
  relatedId: string | null;
  relatedType: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

interface Summary {
  inQty: number;
  outQty: number;
  inAmount: number;
  outAmount: number;
}

const typeLabels: Record<string, { text: string; color: string }> = {
  inbound: { text: '입고', color: 'bg-green-100 text-green-700' },
  outbound: { text: '출고', color: 'bg-red-100 text-red-700' },
  return_in: { text: '반품입고', color: 'bg-blue-100 text-blue-700' },
  return_out: { text: '반품출고', color: 'bg-orange-100 text-orange-700' },
  adjust: { text: '조정', color: 'bg-purple-100 text-purple-700' },
  gift: { text: '증정', color: 'bg-pink-100 text-pink-700' },
  damage: { text: '파손', color: 'bg-yellow-100 text-yellow-700' },
  transfer: { text: '이관', color: 'bg-slate-100 text-slate-700' },
};

export default function StockIo() {
  const [tab, setTab] = useState<'inbound' | 'outbound'>('inbound');
  const { period, setPeriod } = usePeriodSelector();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.stockMovement.data({ period }),
    queryFn: () =>
      apiClient.get<{ items: StockTransaction[]; total: number; summary: Summary }>(
        `/api/stock-movement?from=${period}-01`
      ),
  });

  const transactions = data?.items ?? [];
  const summary = data?.summary ?? null;

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

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
            {isLoading ? '-' : `${formatNumber(summary?.inQty || 0)}개`}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="card-label mb-1">출고 수량</p>
          <p className="card-value text-red-600">
            {isLoading ? '-' : `${formatNumber(summary?.outQty || 0)}개`}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="card-label mb-1">입고 금액</p>
          <p className="card-value text-slate-800">
            {isLoading ? '-' : `${formatNumber(summary?.inAmount || 0)}원`}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="card-label mb-1">출고 금액</p>
          <p className="card-value text-slate-800">
            {isLoading ? '-' : `${formatNumber(summary?.outAmount || 0)}원`}
          </p>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('inbound')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            tab === 'inbound'
              ? 'bg-green-600 text-white'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <ArrowDownToLine className="w-4 h-4" /> 입고
        </button>
        <button
          onClick={() => setTab('outbound')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            tab === 'outbound'
              ? 'bg-red-600 text-white'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <ArrowUpFromLine className="w-4 h-4" /> 출고
        </button>
      </div>

      {/* 트랜잭션 목록 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Hash className="w-5 h-5 text-slate-500" />
          <h2 className="text-lg font-semibold text-slate-800">
            {tab === 'inbound' ? '입고' : '출고'} 트랜잭션
          </h2>
          <span className="text-sm text-slate-400">({transactions.length}건)</span>
        </div>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="text-left py-2 px-3">일시</th>
                <th className="text-left py-2 px-3">유형</th>
                <th className="text-left py-2 px-3">상품</th>
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
                      {fmtDate(tx.createdAt)}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          typeLabels[tx.type]?.color || 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {typeLabels[tx.type]?.text || tx.type}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-medium max-w-[180px] truncate">
                      {tx.productName || tx.productId}
                    </td>
                    <td className="py-2 px-3 text-right font-medium">
                      {tx.quantity > 0 ? '+' : ''}
                      {formatNumber(tx.quantity)}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {formatNumber(tx.unitCost)}원
                    </td>
                    <td className="py-2 px-3 text-right font-medium">
                      {formatNumber(tx.totalCost)}원
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
