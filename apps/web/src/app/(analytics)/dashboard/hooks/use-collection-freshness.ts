'use client';

import { useQuery } from '@tanstack/react-query';
import { DashboardCollectionsSchema } from '@kiditem/shared/dashboard';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

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

/** How long ago, in the words someone says out loud. */
export function relativeTime(iso: string | Date): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days}일 전`;
  return new Date(iso).toISOString().slice(0, 10);
}

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
    return { label: at ? relativeTime(at) : '미수집' };
  };
}
