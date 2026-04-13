'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PackageCheck,
  RefreshCw,
  AlertTriangle,
  TrendingDown,
  Calendar,
  BarChart3,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatKRW } from '@/lib/utils';

interface StatsOverview {
  stats: { total: number; accept: number; [key: string]: number };
  today: { orders: number; revenue: number };
  week: { orders: number; revenue: number };
}

interface ProductOrderCount {
  productName: string;
  productId: string;
  todayOrders: number;
  currentStock: number;
  daysRemaining: number;
  avgDailySales: number;
  status: string;
}

export default function OrderInventory() {
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const { data: inventoryData, isLoading: loadingInventory } = useQuery({
    queryKey: queryKeys.inventory.list({}),
    queryFn: () =>
      apiClient.get<{ items: ProductOrderCount[]; total: number }>('/api/inventory'),
  });

  const { data: statsData, isLoading: loadingStats } = useQuery({
    queryKey: queryKeys.orders.stats(),
    queryFn: () =>
      apiClient.get<StatsOverview>('/api/orders/stats'),
  });

  const isLoading = loadingInventory || loadingStats;
  const items = inventoryData?.items ?? [];
  const stats = statsData ?? null;

  const filteredItems =
    filterStatus === 'all'
      ? items
      : items.filter((i) => i.status === filterStatus);

  const criticalCount = items.filter((i) => i.status === 'critical').length;
  const warningCount = items.filter((i) => i.status === 'warning').length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'critical':
        return { label: '긴급발주', color: 'bg-red-100 text-red-800' };
      case 'warning':
        return { label: '발주필요', color: 'bg-amber-100 text-amber-800' };
      case 'overstock':
        return { label: '과재고', color: 'bg-blue-100 text-blue-800' };
      default:
        return { label: '정상', color: 'bg-green-100 text-green-800' };
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">
          <PackageCheck size={24} className="inline mr-2" />
          주문-재고 자동매칭 뷰
        </h1>
        <button className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
          <RefreshCw size={16} /> 새로고침
        </button>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats && (
          <>
            <div className="bg-white rounded-xl border border-slate-200">
              <div className="p-4">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Calendar size={14} /> 오늘 주문
                </div>
                <div className="text-2xl font-bold text-slate-900 mt-1">
                  {stats.today.orders}건
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {formatKRW(stats.today.revenue)}원
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200">
              <div className="p-4">
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <BarChart3 size={14} /> 주간 주문
                </div>
                <div className="text-2xl font-bold text-slate-900 mt-1">
                  {stats.week.orders}건
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {formatKRW(stats.week.revenue)}원
                </div>
              </div>
            </div>
          </>
        )}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="p-4">
            <div className="flex items-center gap-2 text-sm text-red-500">
              <AlertTriangle size={14} /> 긴급발주
            </div>
            <div className="text-2xl font-bold text-red-600 mt-1">
              {isLoading ? '-' : `${criticalCount}건`}
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="p-4">
            <div className="flex items-center gap-2 text-sm text-amber-500">
              <TrendingDown size={14} /> 발주필요
            </div>
            <div className="text-2xl font-bold text-amber-600 mt-1">
              {isLoading ? '-' : `${warningCount}건`}
            </div>
          </div>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex gap-2">
        {[
          { key: 'all', label: '전체' },
          { key: 'critical', label: '긴급발주' },
          { key: 'warning', label: '발주필요' },
          { key: 'normal', label: '정상' },
          { key: 'overstock', label: '과재고' },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilterStatus(f.key)}
            className={cn('px-3 py-1.5 text-sm rounded-lg transition-colors', filterStatus === f.key ? 'bg-purple-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50')}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 테이블 */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-400">
          로딩 중...
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <PackageCheck size={48} className="mx-auto mb-3 opacity-30" />
          <p>데이터가 없습니다</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-700">
              상품별 주문-재고 현황 ({filteredItems.length}건)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
                  <th className="px-4 py-3">상품명</th>
                  <th className="px-4 py-3 text-right">일평균 판매</th>
                  <th className="px-4 py-3 text-right">현재 재고</th>
                  <th className="px-4 py-3 text-right">예상 소진일</th>
                  <th className="px-4 py-3">상태</th>
                </tr>
              </thead>
              <tbody >
                {filteredItems.map((item) => {
                  const badge = getStatusBadge(item.status);
                  const isUrgent =
                    item.status === 'critical' || item.status === 'warning';
                  return (
                    <tr
                      key={item.productId}
                      className={
                        isUrgent
                          ? 'bg-red-50/50 hover:bg-red-50'
                          : 'hover:bg-slate-50'
                      }
                    >
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium">
                          {item.productName}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        {item.avgDailySales.toFixed(1)}개
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn('text-sm font-semibold', item.currentStock === 0 ? 'text-red-600' : item.status === 'warning' ? 'text-amber-600' : 'text-slate-900')}>
                          {item.currentStock}개
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn('text-sm font-medium', item.daysRemaining <= 3 ? 'text-red-600' : item.daysRemaining <= 7 ? 'text-amber-600' : 'text-slate-700')}>
                          {item.daysRemaining >= 999
                            ? '-'
                            : `${item.daysRemaining}일`}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('px-2 py-0.5 rounded text-xs font-medium', badge.color)}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
