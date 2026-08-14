import { useQueries } from '@tanstack/react-query';

export function ProductTrackingQueries() {
  return useQueries({
    queries: [{
      queryKey: ['wing-tracked-history'],
      queryFn: fetchWingTrackedHistory,
    }],
  });
}

declare function fetchWingTrackedHistory(): Promise<unknown>;
