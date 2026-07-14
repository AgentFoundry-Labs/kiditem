'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  Info,
  PackageCheck,
  PackageX,
  RefreshCw,
} from 'lucide-react';
import { queryKeys } from '@/lib/query-keys';
import { cn, formatKRW, formatNumber } from '@/lib/utils';
import { Pagination } from '@/components/ui/Pagination';
import {
  ORDER_INVENTORY_FILTERS,
  isOrderInventoryAttentionNeeded,
  orderInventoryDisplayName,
  orderInventoryStatusBadge,
  type OrderInventoryFilter,
} from '../lib/inventory-risk';
import { fetchChannelSkuAvailability, fetchOrderStats } from '../lib/orders-api';

const PAGE_SIZE = 100;

export default function OrderInventory() {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<OrderInventoryFilter>('all');
  const [page, setPage] = useState(1);
  const availabilityParams = useMemo(
    () => ({ status: filterStatus, page, limit: PAGE_SIZE }),
    [filterStatus, page],
  );

  const { data: availabilityData, isLoading: loadingAvailability } = useQuery({
    queryKey: queryKeys.channelSkuMappings.list({
      status: filterStatus,
      page: String(page),
      limit: String(PAGE_SIZE),
      view: 'order-availability',
    }),
    queryFn: () => fetchChannelSkuAvailability(availabilityParams),
  });

  const { data: statsData, isLoading: loadingStats } = useQuery({
    queryKey: queryKeys.orders.stats(),
    queryFn: fetchOrderStats,
  });

  const items = availabilityData?.items ?? [];
  const summary = availabilityData?.summary;
  const stats = statsData ?? null;
  const isLoading = loadingAvailability || loadingStats;
  const mappingAttentionCount = (summary?.unmatched ?? 0) + (summary?.needsReview ?? 0);

  const handleRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.channelSkuMappings.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.orders.stats() });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">
          <PackageCheck size={24} className="mr-2 inline" />
          주문-채널 재고 현황
        </h1>
        <button
          type="button"
          onClick={handleRefresh}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          <RefreshCw size={16} /> 새로고침
        </button>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <Info size={16} className="mt-0.5 shrink-0" />
        <p>
          Sellpia 최신 재고와 저장된 채널 SKU 구성을 기준으로 서버가 계산한 판매 가능 수량입니다.
          이 화면은 매핑과 품절 확인용이며 발주 수량을 판단하지 않습니다.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard
          icon={<Calendar size={14} />}
          label="오늘 주문"
          value={loadingStats || !stats ? '-' : `${stats.today.orders}건`}
          detail={loadingStats || !stats ? '' : `${formatKRW(stats.today.revenue)}원`}
        />
        <SummaryCard
          icon={<BarChart3 size={14} />}
          label="주간 주문"
          value={loadingStats || !stats ? '-' : `${stats.week.orders}건`}
          detail={loadingStats || !stats ? '' : `${formatKRW(stats.week.revenue)}원`}
        />
        <SummaryCard
          icon={<PackageX size={14} />}
          label="품절 채널 SKU"
          value={loadingAvailability ? '-' : `${summary?.outOfStock ?? 0}건`}
          tone="red"
        />
        <SummaryCard
          icon={<AlertTriangle size={14} />}
          label="매핑 확인 필요"
          value={loadingAvailability ? '-' : `${mappingAttentionCount}건`}
          detail="미매칭 + 확인 필요"
          tone="amber"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {ORDER_INVENTORY_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => {
              setFilterStatus(filter.key);
              setPage(1);
            }}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm transition-colors',
              filterStatus === filter.key
                ? 'bg-purple-600 text-white'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-slate-400">로딩 중...</div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-slate-400">
          <PackageCheck size={48} className="mx-auto mb-3 opacity-30" />
          <p>해당 상태의 채널 SKU가 없습니다</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-4">
            <h3 className="font-semibold text-slate-700">
              채널 SKU 판매 가능 현황 ({formatNumber(availabilityData?.total ?? items.length)}건)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <th className="px-4 py-3">채널</th>
                  <th className="px-4 py-3">상품 / 옵션</th>
                  <th className="px-4 py-3">채널 SKU</th>
                  <th className="px-4 py-3">Sellpia 구성</th>
                  <th className="px-4 py-3 text-right">판매 가능</th>
                  <th className="px-4 py-3">상태</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const badge = orderInventoryStatusBadge(item);
                  const needsAttention = isOrderInventoryAttentionNeeded(item);
                  return (
                    <tr
                      key={item.sku.id}
                      className={needsAttention ? 'bg-amber-50/50 hover:bg-amber-50' : 'hover:bg-slate-50'}
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium">{item.channelAccount.name}</p>
                        <p className="text-xs text-slate-400">{item.channelAccount.channel}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium">{orderInventoryDisplayName(item)}</p>
                        <p className="font-mono text-xs text-slate-400">{item.product.externalProductId}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        <p>{item.sku.externalSkuId}</p>
                        <p>{item.sku.sellerSku ?? '-'}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {item.components.length === 0 ? (
                          <span className="text-slate-400">구성 없음</span>
                        ) : (
                          <ul className="space-y-1">
                            {item.components.map((component) => (
                              <li key={component.masterProductId}>
                                <span className="font-mono">{component.code}</span>
                                {' × '}{formatNumber(component.quantity)} · 현재 {formatNumber(component.currentStock)}
                                {component.isBottleneck ? <span className="ml-1 font-semibold text-amber-700">병목</span> : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums">
                        {item.sku.sellableStock === null ? '—' : `${formatNumber(item.sku.sellableStock)}개`}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('rounded px-2 py-0.5 text-xs font-medium', badge.color)}>{badge.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            limit={PAGE_SIZE}
            total={availabilityData?.total ?? 0}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  detail = '',
  tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string;
  tone?: 'default' | 'red' | 'amber';
}) {
  const toneClass = tone === 'red'
    ? 'text-red-600'
    : tone === 'amber'
      ? 'text-amber-600'
      : 'text-slate-900';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className={cn('flex items-center gap-2 text-sm', tone === 'default' ? 'text-slate-500' : toneClass)}>
        {icon} {label}
      </div>
      <div className={cn('mt-1 text-2xl font-bold', toneClass)}>{value}</div>
      <div className="mt-1 text-xs text-slate-400">{detail}</div>
    </div>
  );
}
