'use client';

import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ProductOperationsDataStatusSchema } from '@kiditem/shared/product-operations';
import type { ProductOperationsPeriodDays } from '@kiditem/shared/product-operations';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export function useProductOperationsDataStatus(
  open: boolean,
  periodDays: ProductOperationsPeriodDays,
) {
  const queryClient = useQueryClient();
  const hadActiveRun = useRef(false);
  const query = useQuery({
    queryKey: queryKeys.products.operations.dataStatus(periodDays),
    queryFn: () => apiClient.getParsed(
      `/api/products/masters/data-status?periodDays=${periodDays}`,
      ProductOperationsDataStatusSchema,
    ),
    enabled: open,
    refetchInterval: ({ state }) => state.data?.activeRun ? 3_000 : false,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    const active = query.data?.activeRun !== null && query.data?.activeRun !== undefined;
    if (hadActiveRun.current && !active) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.operations.lists() });
    }
    hadActiveRun.current = active;
  }, [query.data?.activeRun, queryClient]);

  return query;
}
