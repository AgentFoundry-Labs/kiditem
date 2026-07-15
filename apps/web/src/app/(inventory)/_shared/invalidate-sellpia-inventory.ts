import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';

export async function invalidateSellpiaInventory(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.inventory.snapshots() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.inventory.assets() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.inventory.importRuns() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.inventory.freshness() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.inventory.history() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.channelSkuAvailability.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.channelSkuMappings.lists() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.inventory() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.products.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.ads.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all }),
  ]);
}
