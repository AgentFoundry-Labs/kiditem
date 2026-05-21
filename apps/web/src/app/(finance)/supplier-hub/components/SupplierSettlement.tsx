'use client';

import { useQuery } from '@tanstack/react-query';
import { Scale, CheckCircle, AlertTriangle, ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { cn, formatKRW } from '@/lib/utils';
import { fetchSupplierPaymentReport } from '../lib/supplier-payments-api';

export default function SupplierSettlement() {
  const { data: report } = useQuery({
    queryKey: ['supplier-payments', 'settlement'],
    queryFn: fetchSupplierPaymentReport,
  });

  const summaries = report?.settlements ?? [];
  const paymentSummary = report?.summary ?? {
    totalAmount: 0,
    totalPaid: 0,
    totalUnpaid: 0,
  };
  const counts = report?.counts ?? { all: 0, unpaid: 0, partial: 0, paid: 0 };

  const totalReceived = paymentSummary.totalAmount;
  const totalPaid = paymentSummary.totalPaid;
  const difference = paymentSummary.totalUnpaid;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Scale size={18} className="text-amber-500" />
        <div>
          <h1 className="page-title">구매 정산</h1>
        </div>
      </div>

      {/* Overview KPI */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowDown size={12} className="text-purple-600" />
            <span className="card-label">총 청구금액</span>
          </div>
          <div className="card-value tabular-nums">{formatKRW(totalReceived)}원</div>
        </div>
        <div className="card">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowUp size={12} className="text-green-500" />
            <span className="card-label">총 지불금액</span>
          </div>
          <div className="card-value text-green-600 tabular-nums">{formatKRW(totalPaid)}원</div>
        </div>
        <div className="card">
          <div className="flex items-center gap-1.5 mb-1">
            {difference === 0 ? <Minus size={12} className="text-slate-400" /> : <AlertTriangle size={12} className="text-red-500" />}
            <span className="card-label">차이 (미정산)</span>
          </div>
          <div className={cn('card-value tabular-nums', difference > 0 ? 'text-red-600' : difference < 0 ? 'text-purple-600' : 'text-slate-400')}>
            {difference > 0 ? '+' : ''}{formatKRW(difference)}원
          </div>
        </div>
      </div>

      {/* Detail Table */}
      <div className="table-card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">매입처별 정산 대조</h3>
          <span className="text-xs text-slate-400">{summaries.length} suppliers</span>
        </div>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>매입처</th>
                <th className="text-right">청구 건수</th>
                <th className="text-right">지급완료 건수</th>
                <th className="text-right">청구 금액</th>
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
                    <td className="font-medium text-slate-900">{sm.supplierName}</td>
                    <td className="text-right tabular-nums">{sm.orderCount}</td>
                    <td className="text-right tabular-nums">{sm.receivedCount}</td>
                    <td className="text-right tabular-nums font-semibold">{formatKRW(sm.totalOrdered)}원</td>
                    <td className="text-right tabular-nums text-green-600">{formatKRW(sm.totalPaid)}원</td>
                    <td className={cn('text-right tabular-nums font-semibold', sm.unpaid > 0 ? 'text-red-600' : 'text-slate-400')}>
                      {sm.unpaid > 0 ? `${formatKRW(sm.unpaid)}원` : '-'}
                    </td>
                    <td className="text-center">
                      {isSettled ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-600 rounded text-xs">
                          <CheckCircle size={10} /> 정산완료
                        </span>
                      ) : sm.totalPaid > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-600 rounded text-xs">
                          <AlertTriangle size={10} /> 부분정산
                        </span>
                      ) : sm.totalOrdered > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 rounded text-xs">
                          <AlertTriangle size={10} /> 미정산
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {summaries.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-slate-400 text-sm">데이터가 없습니다.</td></tr>
              )}
            </tbody>
            {summaries.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 font-semibold">
                  <td>합계</td>
                  <td className="text-right tabular-nums">{counts.all}</td>
                  <td className="text-right tabular-nums">{counts.paid}</td>
                  <td className="text-right tabular-nums">{formatKRW(totalReceived)}원</td>
                  <td className="text-right tabular-nums text-green-600">{formatKRW(totalPaid)}원</td>
                  <td className={cn('text-right tabular-nums', paymentSummary.totalUnpaid > 0 ? 'text-red-600' : 'text-slate-400')}>
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
