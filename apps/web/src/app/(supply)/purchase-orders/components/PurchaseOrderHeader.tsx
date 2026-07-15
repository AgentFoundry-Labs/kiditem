'use client';

import { Package, RefreshCw, Plus } from 'lucide-react';
import { formatKRW } from '@/lib/utils';

interface PurchaseOrderHeaderProps {
  total: number;
  totalAmountCny: number;
  onRefresh: () => void;
  onCreateOrder: () => void;
  headingLevel?: 1 | 2;
  showHeading?: boolean;
}

export function PurchaseOrderHeader({
  total,
  totalAmountCny,
  onRefresh,
  onCreateOrder,
  headingLevel = 1,
  showHeading = true,
}: PurchaseOrderHeaderProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Package size={20} className="text-purple-500" />
        <div>
          {showHeading ? <Heading className="page-title">일반 발주</Heading> : null}
          <p className="text-sm text-slate-500">
            {total}건 · 총 {formatKRW(totalAmountCny)} CNY
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200"
        >
          <RefreshCw size={14} />
          새로고침
        </button>
        <button
          onClick={onCreateOrder}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-purple-600 hover:bg-purple-700 rounded-lg"
        >
          <Plus size={14} />
          발주 등록
        </button>
      </div>
    </div>
  );
}
