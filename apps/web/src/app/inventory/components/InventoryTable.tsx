'use client';

import { Pagination } from '@/components/ui/Pagination';
import { cn, formatNumber } from '@/lib/utils';
import type { InventoryListItem } from '@kiditem/shared';
import type { StockOperationMode } from './StockOperationDialog';

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    healthy: 'bg-green-100 text-green-800',
    low: 'bg-orange-100 text-orange-800',
    out: 'bg-red-100 text-red-800',
  };
  const labels: Record<string, string> = {
    healthy: '정상',
    low: '재고 부족',
    out: '재고 없음',
  };
  return <span className={cn('px-2 py-0.5 rounded text-xs font-medium', styles[status] ?? 'bg-slate-100 text-slate-600')}>{labels[status] ?? status}</span>;
}

interface InventoryTableProps {
  items: InventoryListItem[];
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onOpenOperation?: (item: InventoryListItem, mode: StockOperationMode) => void;
}

const ACTION_BUTTONS: { mode: StockOperationMode; label: string }[] = [
  { mode: 'receive', label: '입고' },
  { mode: 'issue', label: '출고' },
  { mode: 'adjust', label: '조정' },
  { mode: 'metadata', label: '설정' },
];

export function InventoryTable({ items, page, pageSize, total, onPageChange, onOpenOperation }: InventoryTableProps) {
  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
        재고 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="table-card">
      <table className="table-fixed w-full">
        <thead>
          <tr>
            <th className="w-[240px] min-w-[180px]">상품명</th>
            <th>옵션</th>
            <th>SKU</th>
            <th>종류</th>
            <th className="text-right">현재고</th>
            <th className="text-right">가용재고</th>
            <th className="text-right">안전재고</th>
            <th className="text-right">발주시점</th>
            <th>창고</th>
            <th>상태</th>
            {onOpenOperation && <th className="w-[240px]">액션</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className={i.status === 'out' ? 'bg-red-50/50' : i.status === 'low' ? 'bg-orange-50/30' : ''}>
              <td className="font-medium text-slate-900 max-w-[240px] truncate" title={i.masterName}>{i.masterName}</td>
              <td className="text-slate-500 text-xs">{i.optionName ?? '-'}</td>
              <td className="text-slate-500 text-xs font-mono">{i.sku}</td>
              <td className="text-slate-500 text-xs">{i.kind === 'BUNDLE' ? '세트' : '단일'}</td>
              <td className={cn('text-right font-semibold', i.currentStock === 0 ? 'text-red-600' : i.currentStock <= i.reorderPoint ? 'text-orange-600' : '')}>
                {formatNumber(i.currentStock)}
              </td>
              <td className="text-right">{formatNumber(i.availableStock)}</td>
              <td className="text-right text-slate-500">{formatNumber(i.safetyStock)}</td>
              <td className="text-right text-slate-500">{formatNumber(i.reorderPoint)}</td>
              <td className="text-slate-500 text-xs">{i.warehouseLocation ?? '-'}</td>
              <td>
                <StatusBadge status={i.status} />
              </td>
              {onOpenOperation && (
                <td>
                  <div className="flex items-center gap-1">
                    {ACTION_BUTTONS.map(({ mode, label }) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => onOpenOperation(i, mode)}
                        className="px-2 py-0.5 rounded border border-border text-xs text-foreground hover:bg-muted"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination page={page} limit={pageSize} total={total} onPageChange={onPageChange} />
    </div>
  );
}
