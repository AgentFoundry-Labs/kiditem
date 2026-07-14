import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import {
  listSellpiaInventorySkus,
  sellpiaInventoryKeyParams,
  type SellpiaInventorySkuListParams,
} from '../../_shared/inventory-api';

export function useInventoryList(params: SellpiaInventorySkuListParams) {
  return useQuery({
    queryKey: queryKeys.inventory.snapshot(sellpiaInventoryKeyParams(params)),
    queryFn: () => listSellpiaInventorySkus(params),
    placeholderData: keepPreviousData,
  });
}
