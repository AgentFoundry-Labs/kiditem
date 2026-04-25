import { useQuery } from '@tanstack/react-query';
import { OrderListResponseSchema, type OrderPipelineStatus } from '@kiditem/shared';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { buildPipelineFromResponses, ORDER_ALL_NODES } from '../lib/order-pipeline';

export function useOrdersPipeline(_showCompleted: boolean) {
  const statuses = ORDER_ALL_NODES.map((node) => node.key);
  const params = { statuses: statuses.join(',') };

  return useQuery({
    queryKey: queryKeys.orders.pipeline(params),
    queryFn: async () => {
      const responses = await Promise.all(
        statuses.map(async (status: OrderPipelineStatus) => {
          const response = await apiClient.getParsed(
            `/api/orders?status=${encodeURIComponent(status)}`,
            OrderListResponseSchema,
          );
          return { status, response };
        }),
      );
      return buildPipelineFromResponses(responses);
    },
  });
}
