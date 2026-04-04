'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShoppingCart, PackageX } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';

interface ProductItem {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  company: string;
  costPrice: number;
  sellPrice: number;
  currentStock: number;
  status: string;
  grade: string;
  orderCount: number;
}

interface InventoryItem {
  productId: string;
  productName: string;
  sku: string | null;
  currentStock: number;
  grade: string;
}

export default function ZeroItems() {
  const [tab, setTab] = useState<'zero_sales' | 'zero_stock'>('zero_sales');

  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: queryKeys.products.list({ limit: '500' }),
    queryFn: () =>
      apiClient.get<{ items: ProductItem[]; total: number }>(
        '/api/products?limit=500'
      ),
  });

  const { data: inventoryData, isLoading: loadingInventory } = useQuery({
    queryKey: queryKeys.inventory.list({}),
    queryFn: () =>
      apiClient.get<{ items: InventoryItem[]; total: number }>('/api/inventory'),
  });

  const isLoading = loadingProducts || loadingInventory;
  const zeroSalesItems = productsData?.items?.filter((p) => p.orderCount === 0) ?? [];
  const zeroStockItems = inventoryData?.items?.filter((i) => i.currentStock === 0) ?? [];

  const gradeColors: Record<string, string> = {
    A: 'bg-green-100 text-green-700',
    B: 'bg-yellow-100 text-yellow-700',
    C: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingCart className="w-4 h-4 text-orange-500" />
            <p className="text-sm text-slate-500">판매 0건 상품</p>
          </div>
          <p className="text-2xl font-bold text-orange-600">
            {isLoading ? '-' : `${zeroSalesItems.length}개`}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            주문이 한 건도 없는 상품
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-1">
            <PackageX className="w-4 h-4 text-red-500" />
            <p className="text-sm text-slate-500">재고 0 상품</p>
          </div>
          <p className="text-2xl font-bold text-red-600">
            {isLoading ? '-' : `${zeroStockItems.length}개`}
          </p>
          <p className="text-xs text-slate-400 mt-1">현재 재고가 0인 상품</p>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('zero_sales')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${tab === 'zero_sales' ? 'bg-orange-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
        >
          <ShoppingCart className="w-4 h-4" /> 판매 0건 (
          {zeroSalesItems.length})
        </button>
        <button
          onClick={() => setTab('zero_stock')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${tab === 'zero_stock' ? 'bg-red-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
        >
          <PackageX className="w-4 h-4" /> 재고 0 ({zeroStockItems.length})
        </button>
      </div>

      {/* 판매 0건 테이블 */}
      {tab === 'zero_sales' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            판매 0건 상품 목록
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="text-left py-2 px-3">상품명</th>
                  <th className="text-left py-2 px-3">SKU</th>
                  <th className="text-center py-2 px-3">등급</th>
                  <th className="text-left py-2 px-3">카테고리</th>
                  <th className="text-right py-2 px-3">매입가</th>
                  <th className="text-right py-2 px-3">판매가</th>
                  <th className="text-right py-2 px-3">재고</th>
                  <th className="text-left py-2 px-3">회사</th>
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
                ) : zeroSalesItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-12 text-center text-slate-400"
                    >
                      판매 0건 상품 없음
                    </td>
                  </tr>
                ) : (
                  zeroSalesItems.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-slate-100 hover:bg-orange-50/30"
                    >
                      <td className="py-2 px-3 font-medium max-w-[180px] truncate">
                        {item.name}
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
                      <td className="py-2 px-3 text-slate-500">
                        {item.category || '-'}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {formatNumber(item.costPrice)}원
                      </td>
                      <td className="py-2 px-3 text-right">
                        {formatNumber(item.sellPrice)}원
                      </td>
                      <td className="py-2 px-3 text-right">
                        {formatNumber(item.currentStock)}개
                      </td>
                      <td className="py-2 px-3 text-slate-500 text-xs">
                        {item.company}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 재고 0 테이블 */}
      {tab === 'zero_stock' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            재고 0 상품 목록
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="text-left py-2 px-3">상품명</th>
                  <th className="text-left py-2 px-3">SKU</th>
                  <th className="text-center py-2 px-3">등급</th>
                  <th className="text-right py-2 px-3">현재재고</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-12 text-center text-slate-400"
                    >
                      로딩 중...
                    </td>
                  </tr>
                ) : zeroStockItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-12 text-center text-slate-400"
                    >
                      재고 0 상품 없음
                    </td>
                  </tr>
                ) : (
                  zeroStockItems.map((item) => (
                    <tr
                      key={item.productId}
                      className="border-b border-slate-100 hover:bg-red-50/30"
                    >
                      <td className="py-2 px-3 font-medium max-w-[200px] truncate">
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
                      <td className="py-2 px-3 text-right text-red-600 font-bold">
                        0개
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
