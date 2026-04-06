'use client';

import { Package, AlertTriangle, RefreshCw, Truck } from 'lucide-react';
import type { InventorySummary } from '@kiditem/shared';

export function InventorySummaryCards({ summary }: { summary: InventorySummary }) {
  return (
    <div className="grid grid-cols-5 gap-4">
      <div className="card flex items-center gap-3">
        <Package size={20} className="text-blue-600" />
        <div><div className="card-label">전체 상품</div><div className="card-value">{summary.total}개</div></div>
      </div>
      <div className="bg-red-50 rounded-xl p-4 border border-red-200 flex items-center gap-3">
        <AlertTriangle size={20} className="text-red-600" />
        <div><div className="text-sm text-red-600">발주 필요</div><div className="text-xl font-bold text-red-700">{summary.reorderCount}개</div></div>
      </div>
      <div className="bg-orange-50 rounded-xl p-4 border border-orange-200 flex items-center gap-3">
        <Package size={20} className="text-orange-600" />
        <div><div className="text-sm text-orange-600">품절</div><div className="text-xl font-bold text-orange-700">{summary.outOfStockCount}개</div></div>
      </div>
      <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 flex items-center gap-3">
        <RefreshCw size={20} className="text-amber-600" />
        <div><div className="text-sm text-amber-600">동기화 필요</div><div className="text-xl font-bold text-amber-700">{summary.unsyncedCount}개</div></div>
      </div>
      <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200 flex items-center gap-3">
        <Truck size={20} className="text-yellow-600" />
        <div><div className="text-sm text-yellow-600">과재고</div><div className="text-xl font-bold text-yellow-700">{summary.overstockCount}개</div></div>
      </div>
    </div>
  );
}
