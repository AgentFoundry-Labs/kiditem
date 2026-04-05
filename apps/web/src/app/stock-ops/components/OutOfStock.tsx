'use client';

import { useQuery } from '@tanstack/react-query';
import { PackageX, ShoppingCart, Truck, BarChart3 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

interface OutOfStockItem {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  currentStock: number;
  avgDailySales: number;
  daysRemaining: number;
  grade: string;
  status: string;
  safetyStock: number;
  reorderPoint: number;
}

export default function OutOfStock() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.inventory.list({ status: 'critical' }),
    queryFn: () =>
      apiClient.get<{ items: OutOfStockItem[]; total: number }>(
        '/api/inventory?status=critical'
      ),
  });

  const items = data?.items ?? [];

  const gradeColors: Record<string, string> = {
    A: 'bg-green-100 text-green-700',
    B: 'bg-yellow-100 text-yellow-700',
    C: 'bg-red-100 text-red-700',
  };

  const aGradeCount = items.filter((i) => i.grade === 'A').length;
  const bGradeCount = items.filter((i) => i.grade === 'B').length;
  const hasHighSales = items.filter((i) => i.avgDailySales > 0);

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <PackageX className="w-4 h-4 text-red-500" />
            <p className="text-sm text-slate-500">품절 상품 수</p>
          </div>
          <p className="text-2xl font-bold text-red-600">
            {isLoading ? '-' : `${items.length}개`}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500 mb-1">A등급 품절</p>
          <p className="text-2xl font-bold text-green-600">
            {isLoading ? '-' : `${aGradeCount}개`}
          </p>
          <p className="text-xs text-red-400 mt-1">
            {aGradeCount > 0 ? '긴급 발주 필요!' : '없음'}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm text-slate-500 mb-1">B등급 품절</p>
          <p className="text-2xl font-bold text-yellow-600">
            {isLoading ? '-' : `${bGradeCount}개`}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-blue-500" />
            <p className="text-sm text-slate-500">판매 실적 있는 품절</p>
          </div>
          <p className="text-2xl font-bold text-blue-600">
            {isLoading ? '-' : `${hasHighSales.length}개`}
          </p>
          <p className="text-xs text-slate-400 mt-1">일평균 판매 &gt; 0</p>
        </div>
      </div>

      {/* 품절 목록 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <ShoppingCart className="w-5 h-5 text-slate-500" />
          <h2 className="text-lg font-semibold text-slate-800">
            품절 상품 목록
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="text-left py-2 px-3">상품명</th>
                <th className="text-left py-2 px-3">SKU</th>
                <th className="text-center py-2 px-3">등급</th>
                <th className="text-right py-2 px-3">재고</th>
                <th className="text-right py-2 px-3">일평균 판매</th>
                <th className="text-right py-2 px-3">안전재고</th>
                <th className="text-right py-2 px-3">발주점</th>
                <th className="text-center py-2 px-3">상태</th>
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
                    품절 상품 없음
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-b border-slate-100 hover:bg-slate-50 ${item.grade === 'A' ? 'bg-red-50/50' : ''}`}
                  >
                    <td className="py-2 px-3 font-medium max-w-[180px] truncate">
                      {item.productName}
                      {item.grade === 'A' && (
                        <span className="ml-1 text-xs text-red-500 font-normal">
                          긴급
                        </span>
                      )}
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
                    <td className="py-2 px-3 text-right text-red-600 font-bold">
                      0개
                    </td>
                    <td className="py-2 px-3 text-right">
                      {item.avgDailySales.toFixed(1)}개
                    </td>
                    <td className="py-2 px-3 text-right">
                      {item.safetyStock}개
                    </td>
                    <td className="py-2 px-3 text-right">
                      {item.reorderPoint}개
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                        <Truck className="w-3 h-3 inline mr-0.5" />
                        발주 필요
                      </span>
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
