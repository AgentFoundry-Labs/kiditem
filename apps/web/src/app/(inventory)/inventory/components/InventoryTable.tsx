'use client';

import { Pagination } from '@/components/ui/Pagination';
import { cn, formatDateTime, formatNumber } from '@/lib/utils';
import type { InventorySkuSnapshotItem } from '@kiditem/shared/inventory';

interface InventoryTableProps {
  items: InventorySkuSnapshotItem[];
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

function price(value: number | null): string {
  return value === null ? '가격 미등록' : `${formatNumber(value)}원`;
}

export function InventoryTable({
  items,
  page,
  pageSize,
  total,
  onPageChange,
}: InventoryTableProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-12 text-center text-[var(--text-secondary)]">
        조건에 맞는 Sellpia 재고가 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="overflow-x-auto">
        <table className="min-w-[1120px] w-full">
          <thead>
            <tr>
              <th>Sellpia 코드</th>
              <th>상품명</th>
              <th>옵션</th>
              <th>바코드</th>
              <th className="text-right">현재고</th>
              <th className="text-right">매입가</th>
              <th className="text-right">판매가</th>
              <th className="text-right">재고자산</th>
              <th>최종 가져오기</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className={cn(item.currentStock === 0 && 'bg-red-50/60')}>
                <td className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                  {item.sellpiaProductCode}
                </td>
                <td className="max-w-[240px] truncate font-medium" title={item.name}>
                  {item.name}
                </td>
                <td className="text-sm text-[var(--text-secondary)]">{item.optionName ?? '-'}</td>
                <td className="font-mono text-xs text-[var(--text-secondary)]">{item.barcode ?? '-'}</td>
                <td className={cn('text-right font-semibold', item.currentStock === 0 && 'text-red-600')}>
                  {formatNumber(item.currentStock)}
                </td>
                <td className={cn('text-right text-sm', item.purchasePrice === null && 'text-amber-700')}>
                  {price(item.purchasePrice)}
                </td>
                <td className={cn('text-right text-sm', item.salePrice === null && 'text-amber-700')}>
                  {price(item.salePrice)}
                </td>
                <td className={cn('text-right font-medium', item.stockValue === null && 'text-amber-700')}>
                  {item.stockValue === null ? '가격 미등록' : `${formatNumber(item.stockValue)}원`}
                </td>
                <td className="text-xs text-[var(--text-secondary)]">
                  {item.lastImportedAt ? formatDateTime(item.lastImportedAt) : '가져오기 기록 없음'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} limit={pageSize} total={total} onPageChange={onPageChange} />
    </div>
  );
}
