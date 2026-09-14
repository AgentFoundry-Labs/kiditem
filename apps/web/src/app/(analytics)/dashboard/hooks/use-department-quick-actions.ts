'use client';

import { useCallback } from 'react';
import { toast } from 'sonner';
import { usePersistedAllMarketplaceOrderCollection } from '@/hooks/useAllMarketplaceOrderCollection';
import { useRocketChannelAccounts } from '@/hooks/useRocketChannelAccounts';
import { useSellpiaInventorySourceOwner } from '@/app/(inventory)/_shared/sellpia-inventory-source-owner';
import { collectAndPersistCoupangShipmentSummary } from '@/lib/coupang-shipment-summary-action';
import { useTrendSourceCollection } from '@/hooks/use-trend-source-collection';
import { useRocketPoCollection } from '@/hooks/use-rocket-po-source';
import { formatNumber } from '@/lib/utils';

export type DepartmentQuickAction =
  | 'collectTrend'
  | 'refreshInventory'
  | 'syncSellpia'
  | 'collectAllOrders'
  | 'collectCoupangShipmentSummary'
  | 'collectCoupangRocketPurchaseOrders';

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
 * screens. Inventory collection is admitted by the Sellpia source owner.
 */
export function useDepartmentQuickActions() {
  const { collect: collectTrend } = useTrendSourceCollection();
  const { rocketAccounts, isBootstrapping: rocketAccountBootstrapping } =
    useRocketChannelAccounts();
  const rocketAccountId = rocketAccounts[0]?.id ?? null;
  const rocketCollection = useRocketPoCollection(rocketAccountId ?? '');
  const { collectAllOrders } = usePersistedAllMarketplaceOrderCollection({
    rocketChannelAccountId: rocketAccountId,
  });
  const { start: startSellpiaInventoryRefresh } =
    useSellpiaInventorySourceOwner({ enabled: true });

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

  const start = useCallback(async (action: DepartmentQuickAction): Promise<void> => {
    if (action === 'collectAllOrders') return collectAllOrders();
    if (action === 'collectCoupangShipmentSummary') return collectShipmentSummary();
    if (action === 'collectCoupangRocketPurchaseOrders') {
      return collectRocketPurchaseOrders();
    }

    if (action === 'collectTrend') {
      const result = await collectTrend();
      if (!result) return;
      if (result.results.length > 0 && result.results.every((source) => source.state === 'COMPLETE' && source.ok)) {
        toast.success('트렌드 수집이 완료됐습니다.');
      } else if (result.results.length > 0 && result.results.every((source) =>
        source.state === 'RUNNING' || (source.state === 'COMPLETE' && source.ok))) {
        toast.info('트렌드 수집이 진행 중입니다.');
      } else {
        toast.error('일부 트렌드 수집에 실패했습니다. 다시 시도해주세요.');
      }
      return;
    }
    await startSellpiaInventoryRefresh();
    toast.success('셀피아 재고 동기화를 시작했습니다.');
  }, [
    collectAllOrders,
    collectTrend,
    collectRocketPurchaseOrders,
    collectShipmentSummary,
    startSellpiaInventoryRefresh,
  ]);

  return { start };
}
