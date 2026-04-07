'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Package,
  TrendingUp,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber, getGradeColor } from '@/lib/utils';

interface InventoryItem {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  grade: string;
  currentStock: number;
}

interface ProductItem {
  id: string;
  costPrice: number;
  sellPrice: number;
}

interface StockAssetItem {
  id: string;
  productId: string;
  productName: string;
  sku: string | null;
  grade: string;
  currentStock: number;
  costPrice: number;
  stockValue: number;
}

interface GradeSummary {
  grade: string;
  count: number;
  totalStock: number;
  totalValue: number;
}


export default function StockAssets() {
  const [gradeFilter, setGradeFilter] = useState('');
  const [sortField, setSortField] = useState<
    'stockValue' | 'currentStock'
  >('stockValue');
  const [sortAsc, setSortAsc] = useState(false);

  const { data: invData, isLoading: invLoading } = useQuery({
    queryKey: queryKeys.inventory.list({ limit: '200' }),
    queryFn: () =>
      apiClient.get<{ items: InventoryItem[]; total: number }>('/api/inventory?limit=200'),
  });

  const { data: prodData, isLoading: prodLoading } = useQuery({
    queryKey: queryKeys.products.list({ limit: '200' }),
    queryFn: () =>
      apiClient.get<{ items: ProductItem[]; total: number }>('/api/products?limit=200'),
  });

  const isLoading = invLoading || prodLoading;

  const items: StockAssetItem[] = useMemo(() => {
    const invItems = invData?.items ?? [];
    const prodItems = prodData?.items ?? [];
    const costMap = new Map<string, number>();
    for (const p of prodItems) {
      costMap.set(p.id, Number(p.costPrice) || 0);
    }
    return invItems.map((inv) => {
      const costPrice = costMap.get(inv.productId) ?? 0;
      const currentStock = Number(inv.currentStock) || 0;
      return {
        ...inv,
        productId: inv.productId,
        costPrice,
        currentStock,
        stockValue: currentStock * costPrice,
      };
    });
  }, [invData, prodData]);

  // useMemo로 자산 계산
  const { byGrade, totalValue, totalStock, totalProducts } = useMemo(() => {
    const gradeMap = new Map<string, GradeSummary>();
    let tValue = 0;
    let tStock = 0;

    for (const item of items) {
      tValue += item.stockValue;
      tStock += item.currentStock;

      const gradeKey = item.grade || '-';
      const g = gradeMap.get(gradeKey) || { grade: gradeKey, count: 0, totalStock: 0, totalValue: 0 };
      g.count++;
      g.totalStock += item.currentStock;
      g.totalValue += item.stockValue;
      gradeMap.set(gradeKey, g);
    }

    return {
      byGrade: Array.from(gradeMap.values()),
      totalValue: tValue,
      totalStock: tStock,
      totalProducts: items.length,
    };
  }, [items]);

  const sorted = [...items].sort((a, b) => {
    const diff = (a[sortField] || 0) - (b[sortField] || 0);
    return sortAsc ? diff : -diff;
  });

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) =>
    sortField === field ? (
      sortAsc ? (
        <ChevronUp className="w-3 h-3 inline" />
      ) : (
        <ChevronDown className="w-3 h-3 inline" />
      )
    ) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Package className="w-6 h-6 text-purple-600" />
          <h1 className="page-title">재고자산 리포트</h1>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="card-label mb-1">총 재고자산</p>
          <p className="card-value text-purple-600">
            {isLoading ? '-' : `${formatNumber(totalValue)}원`}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {totalProducts}개 상품 기준
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="card-label mb-1">총 재고수량</p>
          <p className="card-value text-slate-800">
            {isLoading ? '-' : `${formatNumber(totalStock)}개`}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="card-label mb-1">평균 단가</p>
          <p className="card-value text-slate-800">
            {isLoading
              ? '-'
              : `${totalStock > 0 ? formatNumber(Math.round(totalValue / totalStock)) : 0}원`}
          </p>
        </div>
      </div>

      {/* 등급별 KPI */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-5 h-5 text-slate-600" />
          <h2 className="text-lg font-semibold text-slate-800">
            등급별 재고자산
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {['A', 'B', 'C'].map((g) => {
            const gradeData = byGrade.find((b) => b.grade === g);
            return (
              <button
                key={g}
                onClick={() => setGradeFilter(gradeFilter === g ? '' : g)}
                className={`p-4 rounded-lg border text-left transition-all ${
                  gradeFilter === g
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-bold ${getGradeColor(g)}`}
                  >
                    {g}등급
                  </span>
                  <span className="text-sm text-slate-500">
                    {gradeData?.count || 0}개
                  </span>
                </div>
                <p className="text-lg font-bold text-slate-800">
                  {formatNumber(gradeData?.totalValue || 0)}원
                </p>
                <p className="text-xs text-slate-400">
                  재고 {formatNumber(gradeData?.totalStock || 0)}개
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 상품 목록 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          상품별 재고자산{' '}
          {gradeFilter && (
            <span className="text-sm text-purple-600">({gradeFilter}등급)</span>
          )}
        </h2>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="text-left py-2 px-3">상품명</th>
                <th className="text-left py-2 px-3">SKU</th>
                <th className="text-center py-2 px-3">등급</th>
                <th
                  className="text-right py-2 px-3 cursor-pointer select-none"
                  onClick={() => toggleSort('currentStock')}
                >
                  재고 <SortIcon field="currentStock" />
                </th>
                <th
                  className="text-right py-2 px-3 cursor-pointer select-none"
                  onClick={() => toggleSort('stockValue')}
                >
                  재고자산 <SortIcon field="stockValue" />
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    로딩 중...
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    데이터 없음
                  </td>
                </tr>
              ) : (
                sorted.slice(0, 100).map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="py-2 px-3 font-medium max-w-[200px] truncate">
                      {item.productName}
                    </td>
                    <td className="py-2 px-3 text-slate-500 font-mono text-xs">
                      {item.sku || '-'}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold ${getGradeColor(item.grade)}`}
                      >
                        {item.grade}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      {formatNumber(item.currentStock)}개
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-purple-600">
                      {formatNumber(item.stockValue)}원
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {sorted.length > 100 && (
            <p className="text-center text-sm text-slate-400 mt-3">
              상위 100개 표시 중 (전체 {sorted.length}개)
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
