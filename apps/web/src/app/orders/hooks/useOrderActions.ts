import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { OrderActionResponseSchema, type OrderListItem } from '@kiditem/shared/order';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { getNumericShipmentBoxIds } from '../lib/order-pipeline';

export function useOrderActions() {
  const queryClient = useQueryClient();

  const confirmMutation = useMutation({
    mutationKey: queryKeys.orders.action('confirm'),
    mutationFn: async (orders: OrderListItem[]) => {
      const { ids, skipped } = getNumericShipmentBoxIds(orders);
      if (ids.length === 0) {
        throw new Error('선택한 주문에 발주확인 가능한 shipmentBoxId가 없습니다.');
      }
      const response = OrderActionResponseSchema.parse(
        await apiClient.post('/api/orders', {
          action: 'confirm',
          shipmentBoxIds: ids,
        }),
      );
      return { response, skippedCount: skipped.length };
    },
    onSuccess: async ({ response, skippedCount }) => {
      toast.success(
        skippedCount > 0 ? `${response.message} (${skippedCount}건 제외)` : response.message,
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '발주확인 실패');
    },
  });

  const invoiceMutation = useMutation({
    mutationKey: queryKeys.orders.action('invoice'),
    mutationFn: async ({
      order,
      deliveryCompanyCode,
      invoiceNumber,
    }: {
      order: OrderListItem;
      deliveryCompanyCode: string;
      invoiceNumber: string;
    }) => {
      if (!order.shipmentBoxId) {
        throw new Error('선택한 주문에 shipmentBoxId가 없습니다.');
      }
      return OrderActionResponseSchema.parse(
        await apiClient.post('/api/orders', {
          action: 'invoice',
          shipmentBoxId: order.shipmentBoxId,
          deliveryCompanyCode,
          invoiceNumber,
        }),
      );
    },
    onSuccess: async (response) => {
      toast.success(response.message);
      await queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '송장 전송 실패');
    },
  });

  return { confirmMutation, invoiceMutation };
}
