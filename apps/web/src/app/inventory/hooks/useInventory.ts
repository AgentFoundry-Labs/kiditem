import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import {
  adjustStock,
  fetchInventoryDetail,
  fetchInventoryList,
  inventoryListKeyParams,
  issueStock,
  receiveStock,
  updateInventoryMetadata,
} from '../lib/inventory-api';
import type {
  AdjustStockInput,
  IssueStockInput,
  ReceiveStockInput,
  UpdateInventoryMetadataInput,
} from '@kiditem/shared';
import type { InventoryListParams } from '../lib/inventory-api';

export function useInventoryList(params: InventoryListParams) {
  return useQuery({
    queryKey: queryKeys.inventory.list(inventoryListKeyParams(params)),
    queryFn: () => fetchInventoryList(params),
  });
}

export function useInventoryDetail(id: string | null) {
  return useQuery({
    queryKey: id ? queryKeys.inventory.detail(id) : [...queryKeys.inventory.all, 'detail', 'none'],
    queryFn: () => fetchInventoryDetail(id as string),
    enabled: Boolean(id),
  });
}

function useInventoryMutation<TInput>(mutationFn: (id: string, input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TInput }) => mutationFn(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
    },
  });
}

export function useInventoryMetadataMutation() {
  return useInventoryMutation<UpdateInventoryMetadataInput>(updateInventoryMetadata);
}

export function useReceiveStock() {
  return useInventoryMutation<ReceiveStockInput>(receiveStock);
}

export function useIssueStock() {
  return useInventoryMutation<IssueStockInput>(issueStock);
}

export function useAdjustStock() {
  return useInventoryMutation<AdjustStockInput>(adjustStock);
}
