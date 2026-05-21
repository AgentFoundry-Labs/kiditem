import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import {
  adjustStock,
  fetchInventoryList,
  inventoryListKeyParams,
  issueStock,
  receiveStock,
  updateInventoryMetadata,
} from '../../_shared/inventory-api';
import type {
  AdjustStockInput,
  IssueStockInput,
  ReceiveStockInput,
  UpdateInventoryMetadataInput,
} from '@kiditem/shared/inventory';
import type { InventoryListParams } from '../../_shared/inventory-api';

export function useInventoryList(params: InventoryListParams) {
  return useQuery({
    queryKey: queryKeys.inventory.list(inventoryListKeyParams(params)),
    queryFn: () => fetchInventoryList(params),
    placeholderData: previousData => previousData,
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
