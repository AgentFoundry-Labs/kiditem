'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CalendarCheck,
  DollarSign,
  Clock,
  CalendarDays,
  ArrowDownCircle,
  CheckCircle,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { cn, formatKRW } from '@/lib/utils';
import type { Settlement } from '@/app/(finance)/_shared/types';

export default function ReceivableSchedule() {
  const { data: settlements = [] } = useQuery({
    queryKey: ['settlements'],
    queryFn: () => apiClient.get<Settlement[]>('/api/settlements'),
  });

  // Filter pending settlements
  const pending = settlements.filter((s) => s.status === 'pending');

  // Group into this month / next month / other
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const nextDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;

  const thisMonthItems = pending.filter((s) => s.period === thisMonth);
  const nextMonthItems = pending.filter((s) => s.period === nextMonth);
  const otherItems = pending.filter((s) => s.period !== thisMonth && s.period !== nextMonth);

  // Sort by expectedAmount desc within each group
  const sortByAmount = (a: Settlement, b: Settlement) => b.expectedAmount - a.expectedAmount;
  thisMonthItems.sort(sortByAmount);
  nextMonthItems.sort(sortByAmount);
  otherItems.sort(sortByAmount);

  const totalPending = pending.reduce((s, st) => s + st.expectedAmount, 0);
  const totalConfirmed = settlements.filter((s) => s.status === 'confirmed').reduce((s, st) => s + st.actualAmount, 0);

  const renderGroup = (
    title: string,
    icon: React.ReactNode,
    items: Settlement[],
    colorClass: string
  ) => {
    if (items.length === 0) return null;
    const groupTotal = items.reduce((s, st) => s + st.expectedAmount, 0);
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
                <th>정산기간</th>
                <th className="text-right">예상 정산금</th>
                <th className="text-right">수수료</th>
                <th className="text-right">배송비</th>
                <th className="text-right">주문수</th>
                <th className="text-right">반품수</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id}>
                  <td className="font-medium text-slate-900">{s.period}</td>
                  <td className="text-right tabular-nums font-semibold text-purple-600">{formatKRW(s.expectedAmount)}원</td>
                  <td className="text-right tabular-nums text-red-500">{formatKRW(s.commission)}원</td>
                  <td className="text-right tabular-nums text-slate-500">{formatKRW(s.shippingFee)}원</td>
                  <td className="text-right tabular-nums">{s.orderCount}</td>
                  <td className="text-right tabular-nums text-orange-500">{s.returnCount}</td>
                  <td className="text-xs text-slate-400">{s.notes || '-'}</td>
                </tr>
              ))}
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
        <CalendarCheck size={24} className="inline mr-2" />수금예정 관리
      </h1>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock size={12} className="text-blue-500" />
            <span className="card-label">미정산 합계</span>
          </div>
          <div className="card-value text-purple-600 tabular-nums">{formatKRW(totalPending)}원</div>
          <div className="text-xs text-slate-400 mt-0.5">{pending.length}건</div>
        </div>
        <div className="card">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle size={12} className="text-green-500" />
            <span className="card-label">정산 완료 합계</span>
          </div>
          <div className="card-value text-green-600 tabular-nums">{formatKRW(totalConfirmed)}원</div>
          <div className="text-xs text-slate-400 mt-0.5">{settlements.filter((s) => s.status === 'confirmed').length}건</div>
        </div>
        <div className="card">
          <div className="flex items-center gap-1.5 mb-1">
            <ArrowDownCircle size={12} className="text-cyan-500" />
            <span className="card-label">이번 달 예상</span>
          </div>
          <div className="card-value text-cyan-600 tabular-nums">
            {formatKRW(thisMonthItems.reduce((s, st) => s + st.expectedAmount, 0))}원
          </div>
          <div className="text-xs text-slate-400 mt-0.5">{thisMonthItems.length}건</div>
        </div>
      </div>

      {/* Groups */}
      {renderGroup(
        `이번 달 (${thisMonth})`,
        <CalendarDays size={14} className="text-blue-500" />,
        thisMonthItems,
        'text-purple-600'
      )}
      {renderGroup(
        `다음 달 (${nextMonth})`,
        <CalendarDays size={14} className="text-cyan-500" />,
        nextMonthItems,
        'text-cyan-600'
      )}
      {renderGroup(
        '기타 기간',
        <DollarSign size={14} className="text-slate-400" />,
        otherItems,
        'text-slate-500'
      )}

      {/* Confirmed history */}
      {settlements.filter((s) => s.status === 'confirmed').length > 0 && (
        <div className="table-card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <CheckCircle size={14} className="text-green-500" />
              <h3 className="section-title">정산 완료 내역</h3>
            </div>
            <span className="text-xs text-slate-400">
              {settlements.filter((s) => s.status === 'confirmed').length}건
            </span>
          </div>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>기간</th>
                  <th className="text-right">예상금</th>
                  <th className="text-right">실제금</th>
                  <th className="text-right">차이</th>
                  <th>정산일</th>
                </tr>
              </thead>
              <tbody>
                {settlements
                  .filter((s) => s.status === 'confirmed')
                  .map((s) => (
                    <tr key={s.id}>
                      <td className="font-medium text-slate-900">{s.period}</td>
                      <td className="text-right tabular-nums">{formatKRW(s.expectedAmount)}원</td>
                      <td className="text-right tabular-nums font-semibold text-green-600">{formatKRW(s.actualAmount)}원</td>
                      <td className={cn('text-right tabular-nums', s.difference >= 0 ? 'text-green-600' : 'text-red-600')}>
                        {s.difference >= 0 ? '+' : ''}{formatKRW(s.difference)}원
                      </td>
                      <td className="text-xs text-slate-500 tabular-nums">
                        {s.settledAt ? new Date(s.settledAt).toLocaleDateString('ko-KR') : '-'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pending.length === 0 && (
        <div className="table-card">
          <div className="empty-state">미정산 내역이 없습니다.</div>
        </div>
      )}
    </div>
  );
}
