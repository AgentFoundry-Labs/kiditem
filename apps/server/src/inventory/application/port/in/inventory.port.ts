import type {
  AdjustStockInput,
  Inventory,
  InventoryListResponse,
  IssueStockInput,
  ReceiveStockInput,
  StockOperationResult,
  StockTransactionType,
  TransactionListResponse,
  TransactionSummary,
  UpdateInventoryMetadataInput,
} from '@kiditem/shared/inventory';

export const INVENTORY_PORT = Symbol('InventoryPort');

export type ListInventoryInput = {
  page?: number;
  limit?: number;
  status?: 'healthy' | 'low' | 'out';
  optionId?: string;
  masterId?: string;
};

export type ListTransactionsInput = {
  page?: number;
  limit?: number;
  optionId?: string;
  type?: StockTransactionType;
  from?: string;
  to?: string;
};

export type TransactionSummaryInput = {
  days?: number;
};

export interface InventoryPort {
  list(input: ListInventoryInput, companyId: string): Promise<InventoryListResponse>;
  findById(id: string, companyId: string): Promise<Inventory>;
  findByOptionId(optionId: string, companyId: string): Promise<Inventory>;

  updateMetadata(
    id: string,
    dto: UpdateInventoryMetadataInput,
    companyId: string,
  ): Promise<Inventory>;

  receive(
    id: string,
    dto: ReceiveStockInput,
    companyId: string,
    userId: string,
  ): Promise<StockOperationResult>;

  issue(
    id: string,
    dto: IssueStockInput,
    companyId: string,
    userId: string,
  ): Promise<StockOperationResult>;

  adjust(
    id: string,
    dto: AdjustStockInput,
    companyId: string,
    userId: string,
  ): Promise<StockOperationResult>;

  listTransactions(
    input: ListTransactionsInput,
    companyId: string,
  ): Promise<TransactionListResponse>;

  getTransactionSummary(
    input: TransactionSummaryInput,
    companyId: string,
  ): Promise<TransactionSummary>;
}
