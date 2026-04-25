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
      <div className="bg-green-50 dark:bg-green-950 rounded-xl p-4 border border-green-200 dark:border-green-800 flex items-center gap-3">
        <CheckCircle2 size={20} className="text-green-600 dark:text-green-400" />
        <div>
          <div className="text-sm text-green-600 dark:text-green-400">정상</div>
          <div className="text-xl font-bold text-green-700 dark:text-green-300">{summary.healthy}개</div>
        </div>
      </div>
      <div className="bg-red-50 dark:bg-red-950 rounded-xl p-4 border border-red-200 dark:border-red-800 flex items-center gap-3">
        <AlertTriangle size={20} className="text-red-600 dark:text-red-400" />
        <div>
          <div className="text-sm text-red-600 dark:text-red-400">재고 부족</div>
          <div className="text-xl font-bold text-red-700 dark:text-red-300">{summary.low}개</div>
        </div>
      </div>
      <div className="bg-orange-50 dark:bg-orange-950 rounded-xl p-4 border border-orange-200 dark:border-orange-800 flex items-center gap-3">
        <Package size={20} className="text-orange-600 dark:text-orange-400" />
        <div>
          <div className="text-sm text-orange-600 dark:text-orange-400">재고 없음</div>
          <div className="text-xl font-bold text-orange-700 dark:text-orange-300">{summary.out}개</div>
        </div>
      </div>
    </div>
  );
}
