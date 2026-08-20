import { useQuery } from '@tanstack/react-query';

export function PersistedBatchHistoryRead() {
  return useQuery({
    queryKey: ['wing-tracked-products', 'history', 30],
    queryFn: () => fetchWingTrackedHistories(30),
  });
}

declare function fetchWingTrackedHistories(days: number): Promise<unknown>;
