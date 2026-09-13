'use client';

import { useQuery } from '@tanstack/react-query';
import { DashboardCollectionsSchema } from '@kiditem/shared/dashboard';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { timeAgo } from '@/lib/utils';

/**
 * The `source_import_runs` key each collection writes its completed runs under.
 *
 * Two of the six fill nothing in that ledger and say so rather than showing a
 * blank: 시장분석 collects sourcing trend sources, which keep their own attempt
 * ledger, and 재고 분석 recalculates from data already collected — it has no
 * "last collected" because it never collects.
 */
export const COLLECTION_SOURCE_TYPE: Readonly<Record<string, string | null>> = {
  collectTrend: null,
  collectAllOrders: 'order_collection_mall',
  collectCoupangShipmentSummary: 'coupang_shipment_summary',
  collectCoupangRocketPurchaseOrders: 'coupang_rocket_po_catalog',
  refreshInventory: null,
  syncSellpia: 'sellpia_inventory',
};

export function useCollectionFreshness() {
  const query = useQuery({
    queryKey: queryKeys.dashboard.collections(),
    queryFn: () => apiClient.getParsed('/api/dashboard/collections', DashboardCollectionsSchema),
    staleTime: 30_000,
  });

  /**
   * `null` means this collection publishes no run to read, which is a
   * different statement from one that has never run — the caller must be able
   * to tell them apart, so the two are separate returns rather than one blank.
   */
  return (action: string): { label: string } | null => {
    const sourceType = COLLECTION_SOURCE_TYPE[action];
    if (!sourceType) return null;
    const at = query.data?.lastCompleted[sourceType];
    return { label: at ? timeAgo(at) : '미수집' };
  };
}
