import type { WarehouseRow } from './warehouses.repository.port';

export const TRANSFERS_REPOSITORY_PORT = Symbol('TransfersRepositoryPort');

export type StockTransferBareRow = {
  id: string;
  organizationId: string;
  inventorySkuId: string | null;
  optionName: string | null;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  status: string;
  requestedBy: string | null;
  completedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StockTransferRow = StockTransferBareRow & {
  inventorySku: {
    id: string;
    sellpiaProductCode: string;
    name: string;
    optionName: string | null;
    barcode: string | null;
  } | null;
  fromWarehouse: WarehouseRow;
  toWarehouse: WarehouseRow;
};

export type CreateStockTransferData = {
  inventorySkuId: string;
  optionId: string;
  optionName: string | null;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  notes?: string;
};

export interface TransfersRepositoryPort {
  listStockTransfers(organizationId: string, status?: string): Promise<StockTransferRow[]>;

  findInventorySkuForTransfer(
    inventorySkuId: string,
    organizationId: string,
  ): Promise<{ optionName: string | null; legacyOptionId: string } | null>;

  findWarehouseIdsForTransfer(
    warehouseIds: string[],
    organizationId: string,
  ): Promise<string[]>;

  createStockTransfer(
    organizationId: string,
    data: CreateStockTransferData,
  ): Promise<StockTransferRow>;

  findStockTransferById(
    id: string,
    organizationId: string,
  ): Promise<StockTransferBareRow | null>;

  updateStockTransferStatus(
    id: string,
    status: string,
    completed: boolean,
  ): Promise<StockTransferRow>;
}
