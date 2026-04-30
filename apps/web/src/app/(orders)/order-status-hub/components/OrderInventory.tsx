'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PackageCheck,
  RefreshCw,
  AlertTriangle,
  PackageX,
  Calendar,
  BarChart3,
  Info,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  fetchInventoryList,
  inventoryListKeyParams,
  type InventoryListParams,
} from '@/app/(inventory)/_shared/inventory-api';
import { fetchOrderStats } from '../lib/orders-api';
import {
  ORDER_INVENTORY_FILTERS,
  isOrderInventoryAttentionNeeded,
  orderInventoryDisplayName,
  orderInventoryStatusBadge,
  type OrderInventoryFilter,
} from '../lib/inventory-risk';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatKRW, formatNumber } from '@/lib/utils';

const INVENTORY_LIST_PARAMS: InventoryListParams = { limit: 200 };

export default function OrderInventory() {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<OrderInventoryFilter>('all');

  const { data: inventoryData, isLoading: loadingInventory } = useQuery({
    queryKey: queryKeys.inventory.list(inventoryListKeyParams(INVENTORY_LIST_PARAMS)),
    queryFn: () => fetchInventoryList(INVENTORY_LIST_PARAMS),
  });

  const { data: statsData, isLoading: loadingStats } = useQuery({
    queryKey: queryKeys.orders.stats(),
    queryFn: fetchOrderStats,
  });

  const isLoading = loadingInventory || loadingStats;
  const items = inventoryData?.items ?? [];
  const stats = statsData ?? null;

  const filteredItems =
    filterStatus === 'all' ? items : items.filter((item) => item.status === filterStatus);

  const outCount = items.filter((item) => item.status === 'out').length;
  const attentionNeededCount = items.filter(isOrderInventoryAttentionNeeded).length;

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.orders.stats() });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">
          <PackageCheck size={24} className="inline mr-2" />
          주문-재고 현황
        </h1>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
        >
          <RefreshCw size={16} /> 새로고침
        </button>
      </div>

      <div className="flex items-start gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
        <Info size={16} className="flex-shrink-0 mt-0.5" />
        <p>
          주문 판매속도 / 예상 소진일 지표는 아직 연결되지 않았습니다. 이 화면은 재고 API의
          현재 재고·안전재고·발주점 기준 재고 리스크만 표시합니다.
        </p>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Calendar size={14} /> 오늘 주문
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {loadingStats || !stats ? '-' : `${stats.today.orders}건`}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {loadingStats || !stats ? '' : `${formatKRW(stats.today.revenue)}원`}
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <BarChart3 size={14} /> 주간 주문
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              {loadingStats || !stats ? '-' : `${stats.week.orders}건`}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {loadingStats || !stats ? '' : `${formatKRW(stats.week.revenue)}원`}
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="p-4">
            <div className="flex items-center gap-2 text-sm text-red-500">
              <PackageX size={14} /> 품절 옵션
            </div>
            <div className="text-2xl font-bold text-red-600 mt-1">
              {loadingInventory ? '-' : `${outCount}건`}
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="p-4">
            <div className="flex items-center gap-2 text-sm text-amber-500">
              <AlertTriangle size={14} /> 재고 확인 필요
            </div>
            <div className="text-2xl font-bold text-amber-600 mt-1">
              {loadingInventory ? '-' : `${attentionNeededCount}건`}
            </div>
            <div className="text-xs text-slate-400 mt-1">품절 + 재고 부족 + 발주점 이하</div>
          </div>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex gap-2 flex-wrap">
        {ORDER_INVENTORY_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilterStatus(f.key)}
            className={cn(
              'px-3 py-1.5 text-sm rounded-lg transition-colors',
              filterStatus === f.key
                ? 'bg-purple-600 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 테이블 */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-400">로딩 중...</div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <PackageCheck size={48} className="mx-auto mb-3 opacity-30" />
          <p>해당 상태의 옵션이 없습니다</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="p-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-700">
              옵션별 재고 리스크 현황 ({filteredItems.length}건)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
                  <th className="px-4 py-3">상품 / 옵션</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3 text-right">현재 재고</th>
                  <th className="px-4 py-3 text-right">가용 재고</th>
                  <th className="px-4 py-3 text-right">안전재고</th>
                  <th className="px-4 py-3 text-right">발주점</th>
                  <th className="px-4 py-3">상태</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const badge = orderInventoryStatusBadge(item.status);
                  const needsAttention = isOrderInventoryAttentionNeeded(item);
                  return (
                    <tr
                      key={item.id}
                      className={
                        needsAttention ? 'bg-red-50/50 hover:bg-red-50' : 'hover:bg-slate-50'
                      }
                    >
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium">{orderInventoryDisplayName(item)}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                        {item.sku || '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold">
                        {formatNumber(item.currentStock)}개
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        {formatNumber(item.availableStock)}개
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        {formatNumber(item.safetyStock)}개
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        {formatNumber(item.reorderPoint)}개
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded text-xs font-medium',
                            badge.color,
                          )}
                        >
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
