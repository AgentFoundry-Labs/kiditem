'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, DollarSign, Clock } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatNumber, getGradeColor } from '@/lib/utils';

interface InventoryItem {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  grade: string;
  currentStock: number;
  avgDailySales: number;
  daysRemaining: number;
  status: string;
}

const STORAGE_COST_PER_UNIT = 100;

export default function DeadStock() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.inventory.list({ status: 'dead_stock' }),
    queryFn: () =>
      apiClient.get<{ items: InventoryItem[]; total: number }>('/api/inventory?status=dead_stock&limit=200'),
  });

  const items = data?.items ?? [];

  const totalDeadStock = items.reduce((s, i) => s + i.currentStock, 0);
  const totalStorageCost = items.reduce((s, i) => s + i.currentStock * STORAGE_COST_PER_UNIT, 0);

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <p className="card-label">악성재고 상품수</p>
          </div>
          <p className="card-value text-red-600">
            {isLoading ? '-' : `${items.length}개`}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-orange-500" />
            <p className="card-label">악성재고 수량</p>
          </div>
          <p className="card-value text-slate-800">
            {isLoading ? '-' : `${formatNumber(totalDeadStock)}개`}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-orange-500" />
            <p className="card-label">추정 보관비용</p>
          </div>
          <p className="card-value text-orange-600">
            {isLoading ? '-' : `${formatNumber(totalStorageCost)}원`}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            개당 {STORAGE_COST_PER_UNIT}원/월 기준
          </p>
        </div>
      </div>

      {/* 목록 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          악성재고 상품 목록
          <span className="text-sm text-slate-400 font-normal ml-2">
            (판매 없는 재고 상품)
          </span>
        </h2>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="text-left py-2 px-3">상품명</th>
                <th className="text-left py-2 px-3">SKU</th>
                <th className="text-center py-2 px-3">등급</th>
                <th className="text-right py-2 px-3">재고</th>
                <th className="text-right py-2 px-3">잔여일</th>
                <th className="text-right py-2 px-3">추정보관비</th>
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
                    악성재고 없음 (우수!)
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.productId}
                    className="border-b border-slate-100 hover:bg-red-50/30"
                  >
                    <td className="py-2 px-3 font-medium max-w-[180px] truncate">
                      {item.productName}
                    </td>
                    <td className="py-2 px-3 text-xs text-slate-500 font-mono">
                      {item.sku || '-'}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span
                        className={cn('px-2 py-0.5 rounded text-xs font-bold', getGradeColor(item.grade))}
                      >
                        {item.grade}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-medium">
                      {formatNumber(item.currentStock)}개
                    </td>
                    <td className="py-2 px-3 text-right">
                      <span className="text-red-600 font-medium">
                        {item.daysRemaining >= 999 ? 'N/A' : `${item.daysRemaining}일`}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-orange-600">
                      {formatNumber(item.currentStock * STORAGE_COST_PER_UNIT)}원
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
