import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import {
  fetchTransactionSummary,
  fetchTransactions,
  transactionKeyParams,
} from '../lib/inventory-api';
import type { TransactionListParams } from '../lib/inventory-api';

export function useInventoryTransactions(params: TransactionListParams) {
  return useQuery({
    queryKey: queryKeys.inventory.transactions(transactionKeyParams(params)),
    queryFn: () => fetchTransactions(params),
  });
}

export function useInventoryTransactionSummary(days: number) {
  return useQuery({
    queryKey: queryKeys.inventory.transactionSummary({ days: String(days) }),
    queryFn: () => fetchTransactionSummary(days),
  });
}
