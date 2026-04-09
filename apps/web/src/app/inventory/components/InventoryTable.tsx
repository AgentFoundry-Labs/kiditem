'use client';

import { Pagination } from '@/components/ui/Pagination';
import { formatNumber } from '@/lib/utils';
import type { InventoryItem } from '@kiditem/shared';

function isUnsynced(item: InventoryItem): boolean {
  return item.currentStock === 0 && item.avgDailySales === 0 && item.optimalStock <= item.safetyStock;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    normal: 'bg-green-100 text-green-800',
    warning: 'bg-orange-100 text-orange-800',
    critical: 'bg-red-100 text-red-800',
    overstock: 'bg-yellow-100 text-yellow-800',
    unsynced: 'bg-amber-100 text-amber-700',
  };
  const labels: Record<string, string> = {
    normal: '정상',
    warning: '발주필요',
    critical: '긴급발주',
    overstock: '과재고',
    unsynced: '동기화 필요',
  };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status] ?? 'bg-slate-100 text-slate-600'}`}>{labels[status] ?? status}</span>;
}

interface InventoryTableProps {
  items: InventoryItem[];
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function InventoryTable({ items, page, pageSize, total, onPageChange }: InventoryTableProps) {
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
            <th>SKU</th>
            <th>등급</th>
            <th>회사</th>
            <th className="text-right">현재고</th>
            <th className="text-right">적정재고</th>
            <th className="text-right">일평균판매</th>
            <th className="text-right">남은일수</th>
            <th className="text-right">추천발주량</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => {
            const unsynced = isUnsynced(i);
            const rowStatus = unsynced ? 'unsynced' : i.status;
            return (
              <tr key={i.id} className={unsynced ? 'bg-amber-50/30' : i.status === 'critical' ? 'bg-red-50/50' : i.status === 'warning' ? 'bg-orange-50/30' : ''}>
                <td className="font-medium text-slate-900 max-w-[240px] truncate" title={i.productName}>{i.productName}</td>
                <td className="text-slate-500 text-xs font-mono">{i.sku}</td>
                <td>
                  {i.grade && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      i.grade === 'A' ? 'bg-green-100 text-green-700' :
                      i.grade === 'B' ? 'bg-blue-100 text-blue-700' :
                      'bg-red-100 text-red-700'
                    }`}>{i.grade}</span>
                  )}
                </td>
                <td className="text-slate-500 text-xs">{i.company}</td>
                <td className={`text-right font-semibold ${unsynced ? 'text-amber-600' : i.currentStock === 0 ? 'text-red-600' : i.currentStock <= i.reorderPoint ? 'text-orange-600' : ''}`}>
                  {formatNumber(i.currentStock)}
                </td>
                <td className="text-right text-slate-500">{formatNumber(i.optimalStock)}</td>
                <td className="text-right">{i.avgDailySales}</td>
                <td className={`text-right font-semibold ${unsynced ? '' : i.daysRemaining <= 7 ? 'text-red-600' : i.daysRemaining <= 14 ? 'text-orange-500' : ''}`}>
                  {i.daysRemaining}일
                </td>
                <td className="text-right font-semibold text-purple-600">
                  {i.recommendedOrder > 0 ? `${formatNumber(i.recommendedOrder)}개` : '-'}
                </td>
                <td>
                  <StatusBadge status={rowStatus} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Pagination page={page} limit={pageSize} total={total} onPageChange={onPageChange} />
    </div>
  );
}
