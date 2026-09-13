import { useQuery } from '@tanstack/react-query';
import { OrderStatsResponseSchema } from '@kiditem/shared/order';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export function useOrdersStats() {
  return useQuery({
    queryKey: queryKeys.orders.stats(),
    queryFn: () => apiClient.getParsed('/api/orders/stats', OrderStatsResponseSchema),
  });
}
