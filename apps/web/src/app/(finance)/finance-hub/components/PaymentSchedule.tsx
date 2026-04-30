'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CalendarClock,
  AlertOctagon,
  Clock,
  CalendarDays,
  DollarSign,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { cn, formatKRW } from '@/lib/utils';
import type { SupplierPayment } from '@/app/(finance)/_shared/types';

interface GroupedPayments {
  overdue: SupplierPayment[];
  thisWeek: SupplierPayment[];
  thisMonth: SupplierPayment[];
  later: SupplierPayment[];
}

export default function PaymentSchedule() {
  const { data: payments = [] } = useQuery({
    queryKey: ['supplier-payments', 'unpaid'],
    queryFn: () => apiClient.get<SupplierPayment[]>('/api/supplier-payments?status=unpaid'),
  });

  // Group by schedule
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const sorted = [...payments].sort((a, b) => {
    const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return da - db;
  });

  const groups: GroupedPayments = { overdue: [], thisWeek: [], thisMonth: [], later: [] };
  sorted.forEach((p) => {
    if (!p.dueDate) {
      groups.later.push(p);
      return;
    }
    const due = new Date(p.dueDate);
    if (due < now) groups.overdue.push(p);
    else if (due < endOfWeek) groups.thisWeek.push(p);
    else if (due <= endOfMonth) groups.thisMonth.push(p);
    else groups.later.push(p);
  });

  const totalUnpaid = payments.reduce((s, p) => s + (p.amount - p.paidAmount), 0);
  const overdueTotal = groups.overdue.reduce((s, p) => s + (p.amount - p.paidAmount), 0);

  const renderGroup = (
    title: string,
    icon: React.ReactNode,
    items: SupplierPayment[],
    colorClass: string
  ) => {
    if (items.length === 0) return null;
    const groupTotal = items.reduce((s, p) => s + (p.amount - p.paidAmount), 0);
    return (
      <div className="table-card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="section-title">{title}</h3>
          </div>
          <span className={cn('text-xs font-semibold tabular-nums', colorClass)}>{formatKRW(groupTotal)}원 ({items.length}건)</span>
        </div>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>매입처</th>
                <th>지불기한</th>
                <th className="text-right">청구액</th>
                <th className="text-right">지급액</th>
                <th className="text-right">잔액</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => {
                const remaining = p.amount - p.paidAmount;
                return (
                  <tr key={p.id}>
                    <td className="font-medium text-slate-900">{p.supplierName}</td>
                    <td className="text-xs tabular-nums">
                      {p.dueDate ? (
                        <span className={new Date(p.dueDate) < now ? 'text-red-600 font-semibold' : 'text-slate-500'}>
                          {new Date(p.dueDate).toLocaleDateString('ko-KR')}
                        </span>
                      ) : (
                        <span className="text-slate-400">미정</span>
                      )}
                    </td>
                    <td className="text-right tabular-nums">{formatKRW(p.amount)}원</td>
                    <td className="text-right tabular-nums text-green-600">{formatKRW(p.paidAmount)}원</td>
                    <td className="text-right tabular-nums font-semibold text-red-600">{formatKRW(remaining)}원</td>
                    <td className="text-xs text-slate-400">{p.notes || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="page-title">
        <CalendarClock size={24} className="inline mr-2" />지불예정 관리
      </h1>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card">
          <div className="flex items-center gap-1.5 mb-1">
            <DollarSign size={12} className="text-slate-400" />
            <span className="card-label">총 미지급</span>
          </div>
          <div className="card-value tabular-nums">{formatKRW(totalUnpaid)}원</div>
          <div className="text-xs text-slate-400 mt-0.5">{payments.length}건</div>
        </div>
        <div className="card border-red-200">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertOctagon size={12} className="text-red-500" />
            <span className="card-label">연체</span>
          </div>
          <div className="card-value text-red-600 tabular-nums">{formatKRW(overdueTotal)}원</div>
          <div className="text-xs text-slate-400 mt-0.5">{groups.overdue.length}건</div>
        </div>
        <div className="card">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock size={12} className="text-yellow-500" />
            <span className="card-label">이번 주 예정</span>
          </div>
          <div className="card-value text-yellow-600 tabular-nums">
            {formatKRW(groups.thisWeek.reduce((s, p) => s + (p.amount - p.paidAmount), 0))}원
          </div>
          <div className="text-xs text-slate-400 mt-0.5">{groups.thisWeek.length}건</div>
        </div>
      </div>

      {/* Groups */}
      {renderGroup('연체 (Overdue)', <AlertOctagon size={14} className="text-red-500" />, groups.overdue, 'text-red-600')}
      {renderGroup('이번 주', <Clock size={14} className="text-yellow-500" />, groups.thisWeek, 'text-yellow-600')}
      {renderGroup('이번 달', <CalendarDays size={14} className="text-purple-500" />, groups.thisMonth, 'text-purple-600')}
      {renderGroup('이후 / 미정', <CalendarClock size={14} className="text-slate-400" />, groups.later, 'text-slate-500')}

      {payments.length === 0 && (
        <div className="table-card">
          <div className="empty-state">미지급 내역이 없습니다.</div>
        </div>
      )}
    </div>
  );
}
