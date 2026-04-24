'use client';

import { Package, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { InventorySummary } from '@kiditem/shared';

export function InventorySummaryCards({ summary }: { summary: InventorySummary }) {
  return (
    <div className="grid grid-cols-4 gap-4">
      <div className="card flex items-center gap-3">
        <Package size={20} className="text-purple-600" />
        <div><div className="card-label">전체 상품</div><div className="card-value">{summary.total}개</div></div>
      </div>
      <div className="bg-green-50 rounded-xl p-4 border border-green-200 flex items-center gap-3">
        <CheckCircle2 size={20} className="text-green-600" />
        <div><div className="text-sm text-green-600">정상</div><div className="text-xl font-bold text-green-700">{summary.healthy}개</div></div>
      </div>
      <div className="bg-red-50 rounded-xl p-4 border border-red-200 flex items-center gap-3">
        <AlertTriangle size={20} className="text-red-600" />
        <div><div className="text-sm text-red-600">재고 부족</div><div className="text-xl font-bold text-red-700">{summary.low}개</div></div>
      </div>
      <div className="bg-orange-50 rounded-xl p-4 border border-orange-200 flex items-center gap-3">
        <Package size={20} className="text-orange-600" />
        <div><div className="text-sm text-orange-600">재고 없음</div><div className="text-xl font-bold text-orange-700">{summary.out}개</div></div>
      </div>
    </div>
  );
}
