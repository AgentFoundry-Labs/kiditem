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
import { formatKRW } from '@/lib/utils';

interface Payment {
  id: string;
  supplierId: string;
  supplierName: string;
  amount: number;
  paidAmount: number;
  status: string;
  dueDate: string | null;
  notes: string | null;
  createdAt: string;
}

interface GroupedPayments {
  overdue: Payment[];
  thisWeek: Payment[];
  thisMonth: Payment[];
  later: Payment[];
}

export default function PaymentSchedule() {
  const { data: payments = [] } = useQuery({
    queryKey: ['supplier-payments', 'unpaid'],
    queryFn: () => apiClient.get<Payment[]>('/api/supplier-payments?status=unpaid'),
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
    items: Payment[],
    colorClass: string
  ) => {
    if (items.length === 0) return null;
    const groupTotal = items.reduce((s, p) => s + (p.amount - p.paidAmount), 0);
    return (
      <div className="agent-card">
        <div className="agent-card-header">
          <div className="flex items-center gap-2">
            {icon}
            <h3>{title}</h3>
          </div>
          <span className={`text-xs font-semibold tabular-nums ${colorClass}`}>{formatKRW(groupTotal)}원 ({items.length}건)</span>
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
                    <td className="font-medium text-gray-900">{p.supplierName}</td>
                    <td className="text-xs tabular-nums">
                      {p.dueDate ? (
                        <span className={new Date(p.dueDate) < now ? 'text-red-600 font-semibold' : 'text-gray-500'}>
                          {new Date(p.dueDate).toLocaleDateString('ko-KR')}
                        </span>
                      ) : (
                        <span className="text-gray-400">미정</span>
                      )}
                    </td>
                    <td className="text-right tabular-nums">{formatKRW(p.amount)}원</td>
                    <td className="text-right tabular-nums text-green-600">{formatKRW(p.paidAmount)}원</td>
                    <td className="text-right tabular-nums font-semibold text-red-600">{formatKRW(remaining)}원</td>
                    <td className="text-xs text-gray-400">{p.notes || '-'}</td>
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
    <div className="space-y-6 animate-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <CalendarClock size={18} className="text-rose-500" />
        <div>
          <h1 className="text-base font-semibold text-gray-900 uppercase tracking-wide">Payment Schedule</h1>
          <p className="text-xs text-gray-400 font-mono mt-0.5">지불 예정일자별 내역</p>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        <div className="agent-card">
          <div className="px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign size={12} className="text-gray-400" />
              <span className="text-[10px] text-gray-500 font-mono uppercase">총 미지급</span>
            </div>
            <div className="text-xl font-bold text-gray-900 tabular-nums">{formatKRW(totalUnpaid)}원</div>
            <div className="text-[10px] text-gray-400 mt-0.5">{payments.length}건</div>
          </div>
        </div>
        <div className="agent-card border-red-200">
          <div className="px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertOctagon size={12} className="text-red-500" />
              <span className="text-[10px] text-gray-500 font-mono uppercase">연체</span>
            </div>
            <div className="text-xl font-bold text-red-600 tabular-nums">{formatKRW(overdueTotal)}원</div>
            <div className="text-[10px] text-gray-400 mt-0.5">{groups.overdue.length}건</div>
          </div>
        </div>
        <div className="agent-card">
          <div className="px-4 py-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock size={12} className="text-yellow-500" />
              <span className="text-[10px] text-gray-500 font-mono uppercase">이번 주 예정</span>
            </div>
            <div className="text-xl font-bold text-yellow-600 tabular-nums">
              {formatKRW(groups.thisWeek.reduce((s, p) => s + (p.amount - p.paidAmount), 0))}원
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5">{groups.thisWeek.length}건</div>
          </div>
        </div>
      </div>

      {/* Groups */}
      {renderGroup('연체 (Overdue)', <AlertOctagon size={14} className="text-red-500" />, groups.overdue, 'text-red-600')}
      {renderGroup('이번 주', <Clock size={14} className="text-yellow-500" />, groups.thisWeek, 'text-yellow-600')}
      {renderGroup('이번 달', <CalendarDays size={14} className="text-blue-500" />, groups.thisMonth, 'text-blue-600')}
      {renderGroup('이후 / 미정', <CalendarClock size={14} className="text-gray-400" />, groups.later, 'text-gray-500')}

      {payments.length === 0 && (
        <div className="agent-card">
          <div className="text-center py-12 text-gray-400 text-sm">미지급 내역이 없습니다.</div>
        </div>
      )}
    </div>
  );
}
