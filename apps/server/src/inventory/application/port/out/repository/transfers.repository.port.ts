import type { WarehouseRow } from './warehouses.repository.port';

export const TRANSFERS_REPOSITORY_PORT = Symbol('TransfersRepositoryPort');

export type StockTransferBareRow = {
  id: string;
  organizationId: string;
  masterProductId: string | null;
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
  masterProduct: {
    id: string;
    code: string;
    name: string;
    optionName: string | null;
    barcode: string | null;
  } | null;
  fromWarehouse: WarehouseRow;
  toWarehouse: WarehouseRow;
};

export type CreateStockTransferData = {
  masterProductId: string;
  optionName: string | null;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  notes?: string;
};

export interface TransfersRepositoryPort {
  listStockTransfers(organizationId: string, status?: string): Promise<StockTransferRow[]>;

  findMasterProductForTransfer(
    masterProductId: string,
    organizationId: string,
  ): Promise<{ optionName: string | null } | null>;

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
