'use client';

import { Package, RefreshCw, Plus } from 'lucide-react';
import { formatKRW } from '@/lib/utils';

interface PurchaseOrderHeaderProps {
  total: number;
  totalAmountCny: number;
  onRefresh: () => void;
  onCreateOrder: () => void;
}

export function PurchaseOrderHeader({ total, totalAmountCny, onRefresh, onCreateOrder }: PurchaseOrderHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Package size={20} className="text-purple-500" />
        <div>
          <h1 className="text-lg font-bold text-gray-900">발주 관리</h1>
          <p className="text-sm text-gray-500">
            {total}건 · 총 {formatKRW(totalAmountCny)} CNY
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200"
        >
          <RefreshCw size={14} />
          새로고침
        </button>
        <button
          onClick={onCreateOrder}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
        >
          <Plus size={14} />
          발주 등록
        </button>
      </div>
    </div>
  );
}
