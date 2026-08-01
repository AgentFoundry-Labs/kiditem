'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePersistedAllMarketplaceOrderCollection } from '@/hooks/useAllMarketplaceOrderCollection';
import { useRocketChannelAccounts } from '@/hooks/useRocketChannelAccounts';
import { useSellpiaInventoryFreshness } from '@/hooks/useSellpiaInventoryFreshness';
import { collectAndPersistCoupangShipmentSummary } from '@/lib/coupang-shipment-summary-action';
import { startTrendCollectionAction } from '@/lib/manual-operation-actions';
import { queryKeys } from '@/lib/query-keys';
import { collectAndPersistRocketPurchaseOrders } from '@/lib/rocket-purchase-collection-action';
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
 * screens. Only Operation-backed actions retain dashboard source metadata.
 */
export function useDepartmentQuickActions() {
  const queryClient = useQueryClient();
  const { rocketAccounts, isBootstrapping: rocketAccountBootstrapping } =
    useRocketChannelAccounts();
  const rocketAccountId = rocketAccounts[0]?.id ?? null;
  const { collectAllOrders } = usePersistedAllMarketplaceOrderCollection({
    rocketChannelAccountId: rocketAccountId,
  });
  const { requestRefresh: requestSellpiaInventoryRefresh } =
    useSellpiaInventoryFreshness({
      enabled: true,
      sourceSurface: 'dashboard',
    });

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
    const { from, to } = currentMonthRange();
    const result = await collectAndPersistRocketPurchaseOrders({
      from,
      to,
      onCatalogSaved: () => {
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.orders.all }),
          queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all }),
        ]);
      },
      createPreviewRequest: (collected) => ({
        channelAccountId: rocketAccountId,
        collection: collected.collection,
        rows: collected.rows,
        editedQuantities: {},
        clampEditedQuantities: true,
        previewScope: 'confirmation_requested',
      }),
    });
    toast.success(
      `로켓 PO ${result.collected.collection.detailPoCount}/${result.collected.poCount}건 수집·저장 완료`,
    );
  }, [queryClient, rocketAccountBootstrapping, rocketAccountId]);

  const start = useCallback(async (action: DepartmentQuickAction): Promise<void> => {
    if (action === 'collectAllOrders') return collectAllOrders();
    if (action === 'collectCoupangShipmentSummary') return collectShipmentSummary();
    if (action === 'collectCoupangRocketPurchaseOrders') {
      return collectRocketPurchaseOrders();
    }

    if (action === 'collectTrend') {
      await startTrendCollectionAction({ sourceSurface: 'dashboard' });
      toast.success('트렌드 수집을 시작했습니다.');
      return;
    }
    await requestSellpiaInventoryRefresh();
    toast.success('셀피아 동기화를 시작했습니다.');
  }, [
    collectAllOrders,
    collectRocketPurchaseOrders,
    collectShipmentSummary,
    requestSellpiaInventoryRefresh,
  ]);

  return { start };
}
