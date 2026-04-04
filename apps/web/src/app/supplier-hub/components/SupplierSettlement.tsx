'use client';

import { useQuery } from '@tanstack/react-query';
import { Scale, CheckCircle, AlertTriangle, ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { formatKRW } from '@/lib/utils';

interface SupplierSummary {
  supplierId: string;
  supplierName: string;
  status: string;
  orderCount: number;
  totalOrdered: number;
  totalReceived: number;
  totalPaid: number;
  unpaid: number;
  monthly: { month: string; amount: number }[];
}

interface PaymentSummary {
  totalAmount: number;
  totalPaid: number;
  totalUnpaid: number;
}

export default function SupplierSettlement() {
  const { data: settlementData } = useQuery({
    queryKey: ['supplier-payments', 'settlement'],
    queryFn: () => apiClient.get<{ summaries: SupplierSummary[]; paymentSummary: PaymentSummary }>('/api/supplier-payments?type=settlement'),
  });

  const summaries = settlementData?.summaries ?? [];
  const paymentSummary = settlementData?.paymentSummary ?? { totalAmount: 0, totalPaid: 0, totalUnpaid: 0 };

  const totalReceived = summaries.reduce((s, sm) => s + sm.totalOrdered, 0);
  const totalPaid = paymentSummary.totalPaid;
  const difference = totalReceived - totalPaid;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Scale size={18} className="text-amber-500" />
        <div>
          <h1 className="text-base font-semibold text-gray-900 uppercase tracking-wide">Supplier Settlement</h1>
          <p className="text-xs text-gray-400 font-mono mt-0.5">매입처 구매입고 정산관리</p>
        </div>
      </div>

      {/* Overview KPI */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              <ArrowDown size={12} className="text-blue-500" />
              <span className="text-[10px] text-gray-500 font-mono uppercase">총 입고금액 (발주 합)</span>
            </div>
            <div className="text-xl font-bold text-gray-900 tabular-nums">{formatKRW(totalReceived)}원</div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              <ArrowUp size={12} className="text-green-500" />
              <span className="text-[10px] text-gray-500 font-mono uppercase">총 지불금액</span>
            </div>
            <div className="text-xl font-bold text-green-600 tabular-nums">{formatKRW(totalPaid)}원</div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              {difference === 0 ? <Minus size={12} className="text-gray-400" /> : <AlertTriangle size={12} className="text-red-500" />}
              <span className="text-[10px] text-gray-500 font-mono uppercase">차이 (미정산)</span>
            </div>
            <div className={`text-xl font-bold tabular-nums ${difference > 0 ? 'text-red-600' : difference < 0 ? 'text-blue-600' : 'text-gray-400'}`}>
              {difference > 0 ? '+' : ''}{formatKRW(difference)}원
            </div>
          </div>
        </div>
      </div>

      {/* Detail Table */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">매입처별 정산 대조</h3>
          <span className="text-[11px] text-gray-400 font-mono">{summaries.length} suppliers</span>
        </div>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>매입처</th>
                <th className="text-right">발주 건수</th>
                <th className="text-right">입고 건수</th>
                <th className="text-right">입고금액 (발주 합)</th>
                <th className="text-right">지불금액</th>
                <th className="text-right">미결제</th>
                <th className="text-center">상태</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((sm) => {
                const isSettled = sm.unpaid === 0 && sm.totalPaid > 0;
                return (
                  <tr key={sm.supplierId}>
                    <td className="font-medium text-gray-900">{sm.supplierName}</td>
                    <td className="text-right tabular-nums">{sm.orderCount}</td>
                    <td className="text-right tabular-nums">{formatKRW(sm.totalReceived)}원</td>
                    <td className="text-right tabular-nums font-semibold">{formatKRW(sm.totalOrdered)}원</td>
                    <td className="text-right tabular-nums text-green-600">{formatKRW(sm.totalPaid)}원</td>
                    <td className={`text-right tabular-nums font-semibold ${sm.unpaid > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {sm.unpaid > 0 ? `${formatKRW(sm.unpaid)}원` : '-'}
                    </td>
                    <td className="text-center">
                      {isSettled ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-600 rounded text-[10px] font-mono">
                          <CheckCircle size={10} /> 정산완료
                        </span>
                      ) : sm.totalPaid > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-50 text-yellow-600 rounded text-[10px] font-mono">
                          <AlertTriangle size={10} /> 부분정산
                        </span>
                      ) : sm.totalOrdered > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 rounded text-[10px] font-mono">
                          <AlertTriangle size={10} /> 미정산
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400 font-mono">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {summaries.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400 text-sm">데이터가 없습니다.</td></tr>
              )}
            </tbody>
            {summaries.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td>합계</td>
                  <td className="text-right tabular-nums">{summaries.reduce((s, sm) => s + sm.orderCount, 0)}</td>
                  <td className="text-right tabular-nums">{formatKRW(summaries.reduce((s, sm) => s + sm.totalReceived, 0))}원</td>
                  <td className="text-right tabular-nums">{formatKRW(totalReceived)}원</td>
                  <td className="text-right tabular-nums text-green-600">{formatKRW(totalPaid)}원</td>
                  <td className={`text-right tabular-nums ${paymentSummary.totalUnpaid > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {paymentSummary.totalUnpaid > 0 ? `${formatKRW(paymentSummary.totalUnpaid)}원` : '-'}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
