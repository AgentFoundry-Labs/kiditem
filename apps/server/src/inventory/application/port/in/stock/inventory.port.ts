import type {
  AdjustStockInput,
  Inventory,
  InventoryAssetReport,
  InventoryListResponse,
  RocketInventoryEventInput,
  RocketInventoryEventResult,
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

export type ApplyRocketInventoryEventInput = RocketInventoryEventInput & {
  organizationId: string;
  userId: string;
};

export interface InventoryPort {
  list(input: ListInventoryInput, organizationId: string): Promise<InventoryListResponse>;
  getAssetReport(organizationId: string): Promise<InventoryAssetReport>;
  findById(id: string, organizationId: string): Promise<Inventory>;
  findByOptionId(optionId: string, organizationId: string): Promise<Inventory>;

  updateMetadata(
    id: string,
    dto: UpdateInventoryMetadataInput,
    organizationId: string,
  ): Promise<Inventory>;

  receive(
    id: string,
    dto: ReceiveStockInput,
    organizationId: string,
    userId: string,
  ): Promise<StockOperationResult>;

  issue(
    id: string,
    dto: IssueStockInput,
    organizationId: string,
    userId: string,
  ): Promise<StockOperationResult>;

  adjust(
    id: string,
    dto: AdjustStockInput,
    organizationId: string,
    userId: string,
  ): Promise<StockOperationResult>;

  applyRocketInventoryEvent(
    input: ApplyRocketInventoryEventInput,
  ): Promise<RocketInventoryEventResult>;

  listTransactions(
    input: ListTransactionsInput,
    organizationId: string,
  ): Promise<TransactionListResponse>;

  getTransactionSummary(
    input: TransactionSummaryInput,
    organizationId: string,
  ): Promise<TransactionSummary>;
}
