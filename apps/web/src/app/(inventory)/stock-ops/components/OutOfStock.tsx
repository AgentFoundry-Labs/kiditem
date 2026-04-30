'use client';

import { useQuery } from '@tanstack/react-query';
import { PackageX, ShoppingCart, Truck, AlertTriangle } from 'lucide-react';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatNumber } from '@/lib/utils';
import {
  fetchInventoryList,
  inventoryListKeyParams,
  type InventoryListParams,
} from '../../inventory/lib/inventory-api';
import { stockOpsInventoryName } from '../lib/inventory-projection';

const OUT_OF_STOCK_PARAMS: InventoryListParams = { status: 'out', limit: 200 };

export default function OutOfStock() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.inventory.list(inventoryListKeyParams(OUT_OF_STOCK_PARAMS)),
    queryFn: () => fetchInventoryList(OUT_OF_STOCK_PARAMS),
  });

  const items = data?.items ?? [];
  const reorderNeededCount = items.filter(
    (i) => i.currentStock <= i.reorderPoint,
  ).length;

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <PackageX className="w-4 h-4 text-red-500" />
            <p className="card-label">품절 옵션 수</p>
          </div>
          <p className="card-value text-red-600">
            {isLoading ? '-' : `${items.length}개`}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <Truck className="w-4 h-4 text-orange-500" />
            <p className="card-label">발주 필요 (재고 ≤ 발주점)</p>
          </div>
          <p className="card-value text-orange-600">
            {isLoading ? '-' : `${reorderNeededCount}개`}
          </p>
        </div>
      </div>

      {/* 판매속도/등급 미연결 안내 */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-slate-500 leading-relaxed">
            판매속도(일평균 판매) / ABC 등급은 현재 재고 API 응답에 포함되지 않아 표시하지 않습니다.
            긴급도 판단은 재고와 발주점 비교로 한정합니다.
          </p>
        </div>
      </div>

      {/* 품절 목록 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <ShoppingCart className="w-5 h-5 text-slate-500" />
          <h2 className="text-lg font-semibold text-slate-800">
            품절 옵션 목록
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="text-left py-2 px-3">상품 / 옵션</th>
                <th className="text-left py-2 px-3">SKU</th>
                <th className="text-right py-2 px-3">재고</th>
                <th className="text-right py-2 px-3">안전재고</th>
                <th className="text-right py-2 px-3">발주점</th>
                <th className="text-center py-2 px-3">상태</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    로딩 중...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    품절 옵션 없음
                  </td>
                </tr>
              ) : (
                items.map((item) => {
                  const reorderNeeded = item.currentStock <= item.reorderPoint;
                  return (
                    <tr
                      key={item.id}
                      className="border-b border-slate-100 hover:bg-slate-50"
                    >
                      <td className="py-2 px-3 font-medium max-w-[240px] truncate">
                        {stockOpsInventoryName(item)}
                      </td>
                      <td className="py-2 px-3 text-xs text-slate-500 font-mono">
                        {item.sku || '-'}
                      </td>
                      <td className="py-2 px-3 text-right text-red-600 font-bold">
                        {formatNumber(item.currentStock)}개
                      </td>
                      <td className="py-2 px-3 text-right">
                        {formatNumber(item.safetyStock)}개
                      </td>
                      <td className="py-2 px-3 text-right">
                        {formatNumber(item.reorderPoint)}개
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded text-xs font-medium inline-flex items-center gap-1',
                            reorderNeeded
                              ? 'bg-red-100 text-red-700'
                              : 'bg-slate-100 text-slate-600',
                          )}
                        >
                          {reorderNeeded && <Truck className="w-3 h-3" />}
                          {reorderNeeded ? '발주 필요' : item.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
