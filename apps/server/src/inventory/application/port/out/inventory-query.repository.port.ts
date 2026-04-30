export const INVENTORY_QUERY_REPOSITORY_PORT = Symbol('InventoryQueryRepositoryPort');

export type InventoryRow = {
  id: string;
  optionId: string;
  companyId: string;
  currentStock: number;
  reservedStock: number;
  safetyStock: number;
  reorderPoint: number;
  reorderQuantity: number;
  leadTimeDays: number | null;
  dailySalesAvg: unknown;
  warehouseLocation: string | null;
  lastRestockedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type InventoryWithOption = InventoryRow & {
  option: {
    id: string;
    masterId: string;
    sku: string;
    optionName: string | null;
    isBundle: boolean;
    availableStock: number | null;
    master: { name: string };
  };
};

export type StockTransactionRow = {
  id: string;
  companyId: string;
  optionId: string;
  optionName: string | null;
  type: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  warehouseId: string | null;
  relatedId: string | null;
  relatedType: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: Date;
};

export type UnshippedItemRow = {
  id: string;
  companyId: string;
  orderId: string;
  listingId: string | null;
  optionId: string | null;
  productName: string;
  quantity: number;
  orderDate: Date;
  delayDays: number;
  reason: string | null;
  isNotified: boolean;
  notifiedAt: Date | null;
  createdAt: Date;
};

export type InventoryListFilters = {
  optionId?: string;
  masterId?: string;
};

export type ListTransactionsFilters = {
  optionId?: string;
  type?: string;
  from?: string;
  to?: string;
};

export interface InventoryQueryRepositoryPort {
  listInventoryWithOption(
    companyId: string,
    filters: InventoryListFilters,
  ): Promise<{ rows: InventoryWithOption[]; dbCount: number }>;

  findInventoryById(id: string, companyId: string): Promise<InventoryRow | null>;

  findInventoryByOptionId(optionId: string, companyId: string): Promise<InventoryRow | null>;

  listStockTransactions(
    companyId: string,
    filters: ListTransactionsFilters,
    skip: number,
    take: number,
  ): Promise<{ rows: StockTransactionRow[]; total: number }>;

  groupTransactionsByType(
    companyId: string,
    fromDate: Date,
  ): Promise<
    Array<{ type: string; _sum: { quantity: number | null; totalCost: number | null } }>
  >;

  listUnshipped(
    companyId: string,
    minDays: number,
    skip: number,
    take: number,
  ): Promise<{ items: UnshippedItemRow[]; total: number; delayedCount: number }>;
}
