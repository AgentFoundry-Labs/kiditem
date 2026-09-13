'use client';

import { useQuery } from '@tanstack/react-query';
import { ProductOperationsDataStatusSchema } from '@kiditem/shared/product-operations';
import type { ProductOperationsPeriodDays } from '@kiditem/shared/product-operations';
import { apiClient } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export function useProductOperationsDataStatus(
  open: boolean,
  periodDays: ProductOperationsPeriodDays,
) {
  return useQuery({
    queryKey: queryKeys.products.operations.dataStatus(periodDays),
    queryFn: () => apiClient.getParsed(
      `/api/products/masters/data-status?periodDays=${periodDays}`,
      ProductOperationsDataStatusSchema,
    ),
    enabled: open,
  });
}
