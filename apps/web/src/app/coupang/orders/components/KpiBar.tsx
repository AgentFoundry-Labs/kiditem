'use client';

import { ShoppingCart, DollarSign, AlertCircle } from 'lucide-react';
import { formatKRW } from '@/lib/utils';

interface KpiBarProps {
  todayOrderCount: number;
  todayRevenue: number;
  pendingConfirmCount: number;
}

export function KpiBar({ todayOrderCount, todayRevenue, pendingConfirmCount }: KpiBarProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3">
        <ShoppingCart className="w-6 h-6 text-blue-500 flex-shrink-0" />
        <div>
          <p className="text-xs text-gray-500">오늘 주문 수</p>
          <p className="text-xl font-bold text-gray-900">{todayOrderCount}건</p>
        </div>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3">
        <DollarSign className="w-6 h-6 text-emerald-500 flex-shrink-0" />
        <div>
          <p className="text-xs text-gray-500">오늘 매출</p>
          <p className="text-xl font-bold text-gray-900">₩{formatKRW(todayRevenue)}</p>
        </div>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3">
        <AlertCircle className="w-6 h-6 text-amber-500 flex-shrink-0" />
        <div>
          <p className="text-xs text-gray-500">확인 대기</p>
          <p className="text-xl font-bold text-gray-900">{pendingConfirmCount}건</p>
        </div>
      </div>
    </div>
  );
}
