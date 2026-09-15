'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePersistedAllMarketplaceOrderCollection } from '@/hooks/useAllMarketplaceOrderCollection';
import { useRocketChannelAccounts } from '@/hooks/useRocketChannelAccounts';
import { useSellpiaInventoryCollection } from '@/app/(inventory)/_shared/sellpia-inventory-source-owner';
import type { CollectionControlView } from '@/hooks/use-collection-source-control';
import { collectAndPersistCoupangShipmentSummary } from '@/lib/coupang-shipment-summary-action';
import { useTrendSourceCollection } from '@/hooks/use-trend-source-collection';
import { useRocketPoCollection } from '@/hooks/use-rocket-po-source';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber } from '@/lib/utils';

export type DepartmentQuickAction =
  | 'collectTrend'
  | 'refreshInventory'
  | 'syncSellpia'
  | 'collectAllOrders'
  | 'collectCoupangShipmentSummary'
  | 'collectCoupangRocketPurchaseOrders';

/** A cell's view of a collection that has a shared control. */
export type DashboardCollectionControl = CollectionControlView & Readonly<{ stop: () => void }>;

function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const format = (date: Date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
  return {
    from: format(new Date(year, month, 1)),
    to: format(new Date(year, month + 1, 0)),
  };
}

/**
 * Dashboard buttons call the same executable browser actions as their domain
 * screens. Trend, Rocket PO and Sellpia inventory hand the dashboard their
 * shared controls, so every screen shows one running state and stop.
 */
export function useDepartmentQuickActions() {
  const queryClient = useQueryClient();
  const trend = useTrendSourceCollection();
  const { rocketAccounts, isBootstrapping: rocketAccountBootstrapping } =
    useRocketChannelAccounts();
  const rocketAccountId = rocketAccounts[0]?.id ?? null;
  const rocketCollection = useRocketPoCollection(rocketAccountId ?? '');
  const { collectAllOrders } = usePersistedAllMarketplaceOrderCollection({
    rocketChannelAccountId: rocketAccountId,
  });
  const sellpia = useSellpiaInventoryCollection();

  const collectShipmentSummary = useCallback(async () => {
    const result = await collectAndPersistCoupangShipmentSummary();
    if (result.status === 'empty') {
      toast.info('새로 조회된 쉽먼트가 없습니다.');
      return;
    }
    toast.success(
      `발송일 ${formatNumber(result.items.length)}일 · 최신 ${result.latest.date} (${formatNumber(result.latest.count)}건)`,
    );
  }, []);

  const collectRocketPurchaseOrders = useCallback(async () => {
    if (!rocketAccountId) {
      throw new Error(rocketAccountBootstrapping
        ? '쿠팡 익스텐션 계정을 자동으로 연결하는 중입니다. 잠시 후 다시 시도해주세요.'
        : '쿠팡 로켓 계정을 먼저 연결해주세요.');
    }
    // The same control as /rocket-orders: running state, refusal and stop are shared.
    rocketCollection.start(currentMonthRange());
  }, [rocketAccountBootstrapping, rocketAccountId, rocketCollection]);

  // 재고 분석 is calculated from collected data on every read; it never collects.
  const rereadInventoryAnalysis = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.productSalesAll() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.channelSkuAvailability.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.inventory() }),
    ]);
    toast.success('재고 분석을 최신 수집 데이터로 다시 불러왔습니다.');
  }, [queryClient]);

  const start = useCallback(async (action: DepartmentQuickAction): Promise<void> => {
    if (action === 'collectAllOrders') return collectAllOrders();
    if (action === 'collectCoupangShipmentSummary') return collectShipmentSummary();
    if (action === 'collectCoupangRocketPurchaseOrders') {
      return collectRocketPurchaseOrders();
    }

    if (action === 'collectTrend') {
      // The same control as the sourcing screens: one server status, no stop.
      trend.start();
      return;
    }
    if (action === 'refreshInventory') return rereadInventoryAnalysis();
    // The same control as the stock screens: running state, refusal and stop are shared.
    sellpia.control.start();
  }, [
    collectAllOrders,
    collectRocketPurchaseOrders,
    collectShipmentSummary,
    rereadInventoryAnalysis,
    sellpia.control,
    trend,
  ]);

  const controls: Readonly<Partial<Record<DepartmentQuickAction, DashboardCollectionControl>>> = {
    collectTrend: trend.control,
    collectCoupangRocketPurchaseOrders: rocketCollection,
    syncSellpia: sellpia.control,
  };

  return { start, controls };
}
