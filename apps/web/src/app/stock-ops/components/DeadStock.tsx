'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, DollarSign, Clock } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';

interface DeadStockItem {
  productId: string;
  productName: string;
  sku: string | null;
  currentStock: number;
  grade: string;
  lastOrderDate: string | null;
  daysSinceLastOrder: number;
  storageCost: number;
  orderCount: number;
}

const DEAD_STOCK_DAYS = 90;
const STORAGE_COST_PER_UNIT = 100;

export default function DeadStock() {
  const { data: inventoryData, isLoading: loadingInventory } = useQuery({
    queryKey: queryKeys.inventory.list({}),
    queryFn: () =>
      apiClient.get<{ items: DeadStockItem[]; total: number }>('/api/inventory'),
  });

  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: queryKeys.products.list({ limit: '500' }),
    queryFn: () =>
      apiClient.get<{ items: DeadStockItem[]; total: number }>(
        '/api/products?limit=500'
      ),
  });

  const isLoading = loadingInventory || loadingProducts;
  const items = inventoryData?.items ?? [];

  const totalStorageCost = items.reduce((s, i) => s + i.storageCost, 0);
  const totalDeadStock = items.reduce((s, i) => s + i.currentStock, 0);

  const gradeColors: Record<string, string> = {
    A: 'bg-green-100 text-green-700',
    B: 'bg-yellow-100 text-yellow-700',
    C: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <p className="text-sm text-slate-500">악성재고 상품수</p>
          </div>
          <p className="text-2xl font-bold text-red-600">
            {isLoading ? '-' : `${items.length}개`}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-orange-500" />
            <p className="text-sm text-slate-500">악성재고 수량</p>
          </div>
          <p className="text-2xl font-bold text-slate-800">
            {isLoading ? '-' : `${formatNumber(totalDeadStock)}개`}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-orange-500" />
            <p className="text-sm text-slate-500">추정 보관비용</p>
          </div>
          <p className="text-2xl font-bold text-orange-600">
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
            (마지막 주문 {DEAD_STOCK_DAYS}일 이상)
          </span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="text-left py-2 px-3">상품명</th>
                <th className="text-left py-2 px-3">SKU</th>
                <th className="text-center py-2 px-3">등급</th>
                <th className="text-right py-2 px-3">재고</th>
                <th className="text-right py-2 px-3">주문수</th>
                <th className="text-center py-2 px-3">마지막주문</th>
                <th className="text-right py-2 px-3">경과일</th>
                <th className="text-right py-2 px-3">추정보관비</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="py-12 text-center text-slate-400"
                  >
                    로딩 중...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="py-12 text-center text-slate-400"
                  >
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
                        className={`px-2 py-0.5 rounded text-xs font-bold ${gradeColors[item.grade] || 'bg-gray-100 text-gray-600'}`}
                      >
                        {item.grade}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-medium">
                      {formatNumber(item.currentStock)}개
                    </td>
                    <td className="py-2 px-3 text-right">
                      {item.orderCount}건
                    </td>
                    <td className="py-2 px-3 text-center text-xs text-slate-500">
                      {item.lastOrderDate
                        ? new Date(item.lastOrderDate).toLocaleDateString(
                            'ko-KR'
                          )
                        : '없음'}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <span className="text-red-600 font-medium">
                        {item.daysSinceLastOrder >= 999
                          ? 'N/A'
                          : `${item.daysSinceLastOrder}일`}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-medium text-orange-600">
                      {formatNumber(item.storageCost)}원
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
