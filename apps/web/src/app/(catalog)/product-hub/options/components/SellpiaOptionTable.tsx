'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { InventorySkuSnapshotItem } from '@kiditem/shared/inventory';
import { formatKRW, formatNumber } from '@/lib/utils';

interface SellpiaOptionTableProps {
  items: InventorySkuSnapshotItem[];
  isLoading: boolean;
}

export default function SellpiaOptionTable({
  items,
  isLoading,
}: SellpiaOptionTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">Sellpia 코드</th>
              <th className="px-4 py-3 text-left">상품명</th>
              <th className="px-4 py-3 text-left">옵션명</th>
              <th className="px-4 py-3 text-left">바코드</th>
              <th className="px-4 py-3 text-right">매입가</th>
              <th className="px-4 py-3 text-right">판매가</th>
              <th className="px-4 py-3 text-right">현재고</th>
              <th className="px-4 py-3 text-center">상태</th>
              <th className="px-4 py-3 text-right">액션</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-400">
                  로딩 중...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-400">
                  조건에 맞는 옵션이 없습니다.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.masterProductId}
                  className="border-t border-slate-100 hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">
                    {item.code}
                  </td>
                  <td className="min-w-[180px] max-w-[280px] px-4 py-3">
                    <span
                      className="block truncate font-medium text-slate-700"
                      title={item.name}
                    >
                      {item.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {item.optionName ?? '-'}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {item.barcode ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {item.purchasePrice === null ? '-' : `${formatKRW(item.purchasePrice)}원`}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {item.salePrice === null ? '-' : `${formatKRW(item.salePrice)}원`}
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold tabular-nums ${
                    item.currentStock > 0 ? 'text-emerald-700' : 'text-red-600'
                  }`}>
                    {formatNumber(item.currentStock)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                      item.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {item.isActive ? '활성' : '비활성'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/product-hub/${item.masterProductId}`}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                    >
                      상세 <ArrowUpRight size={12} />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
