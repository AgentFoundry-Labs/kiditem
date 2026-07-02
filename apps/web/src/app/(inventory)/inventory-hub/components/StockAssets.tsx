'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Package,
  TrendingUp,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatNumber, getGradeColor } from '@/lib/utils';
import { fetchInventoryAssetReport } from '@/app/(inventory)/_shared/inventory-api';

export default function StockAssets() {
  const [gradeFilter, setGradeFilter] = useState('');
  const [sortField, setSortField] = useState<
    'stockValue' | 'currentStock'
  >('stockValue');
  const [sortAsc, setSortAsc] = useState(false);

  const { data: report, isLoading } = useQuery({
    queryKey: queryKeys.inventory.list({ scope: 'stock-assets-report' }),
    queryFn: fetchInventoryAssetReport,
  });

  const summary = report?.summary ?? {
    totalValue: 0,
    totalStock: 0,
    totalProducts: 0,
    averageUnitCost: 0,
    byGrade: [],
  };
  const items = report?.items ?? [];
  const { byGrade, totalValue, totalStock, totalProducts, averageUnitCost } = summary;

  const filtered = gradeFilter ? items.filter((item) => item.grade === gradeFilter) : items;
  const sorted = [...filtered].sort((a, b) => {
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
              : `${formatNumber(averageUnitCost)}원`}
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
                className={cn('p-4 rounded-lg border text-left transition-all', gradeFilter === g ? 'border-purple-400 bg-purple-50' : 'border-slate-200 hover:border-slate-300')}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={cn('px-2 py-0.5 rounded text-xs font-bold', getGradeColor(g))}
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
                    key={item.inventoryId}
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
                        className={cn('px-2 py-0.5 rounded text-xs font-bold', getGradeColor(item.grade ?? '-'))}
                      >
                        {item.grade ?? '미분류'}
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
