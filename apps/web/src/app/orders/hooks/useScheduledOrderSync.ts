import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { getCurrentSyncWindow, makeDateHourKey } from '../lib/order-pipeline';

const STORAGE_PREFIX = 'orders_last_sync_hour:';

const OrderSyncResultSchema = z.object({
  synced: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  details: z.array(z.string()).optional(),
});

export function useScheduledOrderSync() {
  const queryClient = useQueryClient();
  const nowKey = typeof window === 'undefined' ? 'server' : makeDateHourKey(new Date());

  return useQuery({
    queryKey: queryKeys.orders.scheduledSync(nowKey),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (typeof window === 'undefined') return { status: 'skipped' as const };
      const windowInfo = getCurrentSyncWindow(new Date());
      if (!windowInfo) return { status: 'skipped' as const };

      const storageKey = `${STORAGE_PREFIX}${windowInfo.dateHour}`;
      if (sessionStorage.getItem(storageKey) === 'success') {
        return { status: 'already-synced' as const };
      }

      try {
        const result = OrderSyncResultSchema.parse(
          await apiClient.post('/api/coupang-sync/orders', {
            from: windowInfo.from,
            to: windowInfo.to,
          }),
        );
        sessionStorage.setItem(storageKey, 'success');
        await queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
        toast.success(`쿠팡 주문 동기화 완료: ${result.synced}건`);
        return { status: 'synced' as const, result };
      } catch (error) {
        toast.error('쿠팡 주문 동기화 실패');
        throw error;
      }
    },
  });
}
