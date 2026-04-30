import type { WarehouseRow } from './warehouses.repository.port';

export const TRANSFERS_REPOSITORY_PORT = Symbol('TransfersRepositoryPort');

export type StockTransferBareRow = {
  id: string;
  companyId: string;
  optionId: string;
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
  option: {
    id: string;
    optionName: string | null;
    sku: string;
  };
  fromWarehouse: WarehouseRow;
  toWarehouse: WarehouseRow;
};

export type CreateStockTransferData = {
  optionId: string;
  optionName: string | null;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  notes?: string;
};

export interface TransfersRepositoryPort {
  listStockTransfers(companyId: string, status?: string): Promise<StockTransferRow[]>;

  findOptionForTransfer(
    optionId: string,
    companyId: string,
  ): Promise<{ optionName: string | null } | null>;

  createStockTransfer(
    companyId: string,
    data: CreateStockTransferData,
  ): Promise<StockTransferRow>;

  findStockTransferById(
    id: string,
    companyId: string,
  ): Promise<StockTransferBareRow | null>;

  updateStockTransferStatus(
    id: string,
    status: string,
    completed: boolean,
  ): Promise<StockTransferRow>;
}
